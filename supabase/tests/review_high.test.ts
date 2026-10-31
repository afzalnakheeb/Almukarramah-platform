// The independent review before switch-on (docs/marketplace/REVIEW-FIXES.md): the High findings that live in the
// database, each reproduced as it was found. H2 and H3 (Moyasar timeouts, half-done payments) need the functions and
// are in edge_functions.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { createClient, fake } from './lib/fake-supabase.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/** Paid as the payment webhook does it (the order, then the parcels handed on), with its tax invoice. */
function paidOrder(): Order {
  const o = unpaidOrder(db, s);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() where id = '${o.o}';
       select mp_order_paid('${o.o}');
       insert into invoices (number, icv, order_id, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
       values ('INV-T-' || substr(md5(random()::text), 1, 8), next_invoice_slot(), '${o.o}', 'SAR', 100000, 15000, 115000, 115000, 15000, 'qr');`);
  return o;
}
const deliver = (sub: string) => svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 day' where id = '${sub}'`);
const prepare = (order: string, p: Record<string, unknown>, who = ids.finance) => db.val<Record<string, any>>(`select mp_prepare_refund('${order}', ${j(p)}, '${who}')`, 'service');
const prepareError = (order: string, p: Record<string, unknown>, who = ids.finance) => db.error(`select mp_prepare_refund('${order}', ${j(p)}, '${who}')`, 'service');

before(() => {
  db = freshDb('review_high');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());

describe('H1: a return is refunded once', () => {
  test('a second refund for the same return is refused, whatever its key, while the first is processing and after it succeeded', () => {
    const o = paidOrder();
    deliver(o.a);
    const r = db.val<{ id: string }>(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: o.a, reason: 'damaged', details: 'The bottle arrived broken', lines: [{ order_item_id: o.items.a, quantity: 1 }] })})`, 'service');
    db.val(`select mp_return_action('${ids.support}', '${r.id}', 'approve', 'Approved: broken in transit', false)`, 'service');

    const first = prepare(o.o, { key: 'h1-first-key', reason: 'Broken bottle', return_id: r.id });
    assert.equal(first.status, 'processing');
    assert.equal(first.amount_minor, 25000, 'one unit, no delivery: the rest of the parcel stays with the customer');

    // another staff member, or a reload during a slow Moyasar call: a new key for the same return
    assert.match(prepareError(o.o, { key: 'h1-second-key', reason: 'Broken bottle', return_id: r.id }) ?? 'accepted', /already|being processed/i);
    assert.equal(db.val(`select coalesce(sum(amount_minor), 0)::int from refunds where order_id = '${o.o}' and status <> 'failed'`), 25000, 'only the returned unit is reserved');

    db.val(`select mp_complete_refund('${first.id}', true, 'moyasar:test', null)`, 'service');
    assert.ok(prepareError(o.o, { key: 'h1-third-key', reason: 'Broken bottle', return_id: r.id }), 'a refunded return cannot be refunded again');
    assert.equal(db.val(`select coalesce(sum(amount_minor), 0)::int from refunds where order_id = '${o.o}' and status <> 'failed'`), 25000);
  });

  test('the database itself allows one live refund per return', () => {
    assert.equal(db.val(`select count(*)::int from pg_indexes where tablename = 'refunds' and indexdef ilike '%unique%(return_id)%'`), 1);
  });
});

describe('H4: products keep working with select *', () => {
  test('anon and signed-in customers read products with select * (the live site and the apps branch use it)', () => {
    for (const who of ['anon', user('customer')] as const) {
      const rows = db.rows<{ slug: string }>(`select * from products`, who);
      assert.ok(rows.some((r) => r.slug === 'ajwa-dates-1kg'), 'our own products are listed');
    }
  });

  test("main's and the apps branch's catalogue query (PRODUCT_FIELDS with embedded tables) works as anon", async () => {
    const MAIN_FIELDS = '*, categories(slug, name_en, name_ar), product_prices(currency, amount_minor), product_tags(tags(*))';
    const anon = createClient('https://project.supabase.test', 'anon-key');
    const { data, error } = await anon.from('products').select(MAIN_FIELDS).eq('is_active', true).order('is_featured', { ascending: false });
    assert.equal(error, null, JSON.stringify(error));
    assert.ok((data as { slug: string }[]).some((p) => p.slug === 'kaaba-door-prayer-mat'));
    const one = await anon.from('products').select(MAIN_FIELDS).eq('slug', 'ajwa-dates-1kg').maybeSingle();
    assert.equal(one.error, null);
    assert.equal((one.data as { categories: { slug: string } }).categories.slug, 'dates');
  });

  test('the review notes, AI findings and reviewers of a listing are still not readable by the public or other sellers', () => {
    const row = db.val<Record<string, unknown>>(`select to_jsonb(p) from products p where slug = 'royal-oud'`, 'anon');
    assert.ok(row, 'the live listing is visible');
    for (const k of ['ai_check', 'review_note', 'reviewed_by', 'compliance_note', 'compliance_reviewed_by']) assert.ok(!(k in row), `${k} is not on products`);
    const mine = db.val<{ id: string }[]>(`select mp_listing_private(array['${s.oud}'::uuid])`, user('sellerA'));
    assert.equal(mine.length, 1, 'the seller reads their own review fields');
    assert.equal(db.val<unknown[]>(`select mp_listing_private(array['${s.oud}'::uuid])`, user('sellerB')).length, 0);
  });
});

describe('H5: a shop page shows only what our team approved', () => {
  test('a logo or banner from another server is refused, even with our storage path in it', () => {
    const evil = `https://evil.example/storage/v1/object/public/catalogue/${s.A}/x.jpg`;
    assert.match(db.error(`update sellers set logo = '${evil}' where id = '${s.A}'`, user('sellerA')) ?? 'accepted', /logo/i);
    assert.match(db.error(`update sellers set banner = '${evil}' where id = '${s.A}'`, user('sellerA')) ?? 'accepted', /banner/i);
    const shop = db.val<{ seller: { logo: string | null; banner: string | null } }>(`select mp_storefront('oud-house-a')`, 'anon');
    assert.equal(shop.seller.logo, null);
    assert.equal(shop.seller.banner, null);
  });

  test('contact details and our name are refused in the shop profile', () => {
    for (const [col, v] of [
      ['tagline_en', 'WhatsApp +966 50 123 4567 for 30% off direct orders'],
      ['about_en', 'Order directly: wa.me/966501234567'],
      ['about_ar', 'للطلب تواصل معنا على الواتساب ٠٥٠١٢٣٤٥٦٧'],
      ['returns_en', 'Email returns@oudhouse.sa first'],
    ] as const) {
      assert.match(db.error(`update sellers set ${col} = '${v}' where id = '${s.A}'`, user('sellerA')) ?? 'accepted', /contact/i, `${col}: ${v}`);
    }
    assert.match(db.error(`update sellers set name_en = 'Al Mukarramah Official Outlet' where id = '${s.A}'`, user('sellerA')) ?? 'accepted', /Al Mukarramah/i);
    assert.match(db.error(`update sellers set name_ar = 'متجر المكرمة الرسمي' where id = '${s.A}'`, user('sellerA')) ?? 'accepted', /Al Mukarramah|المكرمة/i);
  });

  test('a change to an approved shop waits for our team: the page keeps the approved text until then', () => {
    svc(`update sellers set tagline_en = 'Oud from Madinah' where id = '${s.A}'`);
    assert.equal(db.error(`update sellers set tagline_en = 'Hand-blended oud from the Madinah souq' where id = '${s.A}'`, user('sellerA')), null);
    const before = db.val<{ seller: { tagline_en: string } }>(`select mp_storefront('oud-house-a')`, 'anon');
    assert.equal(before.seller.tagline_en, 'Oud from Madinah', 'the approved tagline stays until approved');
    db.val(`select mp_review_seller('${s.A}', 'approve_profile', 'Fine')`, user('manager'));
    const after = db.val<{ seller: { tagline_en: string } }>(`select mp_storefront('oud-house-a')`, 'anon');
    assert.equal(after.seller.tagline_en, 'Hand-blended oud from the Madinah souq');
  });
});

describe('H6: design-option pictures are screened like the main photos', () => {
  /** a screened upload of seller B: <seller>/media/<asset id>.jpg */
  const asset = (status: string) => {
    const id = db.val<string>(`select gen_random_uuid()`);
    db.exec(`insert into media_assets (id, seller_id, kind, bucket, path, mime, bytes, sha256, status)
      values ('${id}', '${s.B}', 'listing_photo', 'seller-uploads', '${s.B}/media/${id}.jpg', 'image/jpeg', 1000, md5(random()::text) || md5(random()::text), '${status}')`, 'service');
    return `${s.B}/media/${id}.jpg`;
  };
  const tailoring = (img: string) => ({ production_days: 10, options: [{ key: 'collar', label_en: 'Collar', label_ar: 'الياقة', choices: [{ id: 'classic', label_en: 'Classic', label_ar: 'كلاسيكي', image: img }] }] });

  test('a picture that has not passed the photo check stops the listing being sent for review', () => {
    const passed = asset('passed');
    const pending = asset('pending');
    const p = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, made_to_measure, stock, images, tailoring)
      values ('thobe-opt', 'Thobe with options', 'ثوب بخيارات', 50000, '${s.B}', '${s.cat('thobes')}', true, 0, array['${passed}'], ${j(tailoring(pending))}) returning id`, user('sellerB'));
    assert.match(db.error(`select mp_begin_listing_check('${p}', '${ids.sellerB}')`, 'service') ?? 'accepted', /option|photo check/i);
    svc(`update media_assets set status = 'passed' where path = '${pending}'`);
    assert.equal(db.error(`select mp_begin_listing_check('${p}', '${ids.sellerB}')`, 'service'), null, 'once it passes, the listing can be checked');
  });

  test('a design-option picture must be the seller\'s own upload, never a link', () => {
    assert.match(db.error(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, made_to_measure, stock, tailoring)
      values ('thobe-link', 'Thobe', 'ثوب', 50000, '${s.B}', '${s.cat('thobes')}', true, 0, ${j(tailoring('https://evil.example/collar.jpg'))})`, user('sellerB')) ?? 'accepted', /photo|picture|upload/i);
  });
});

// The independent review before switch-on: the Medium and Low findings (and the business decisions given a safe
// default) that live in the database, each reproduced as it was found. The ones that need a function (M3 cancel
// reasons, M9, M10, M11, M13, M15) are in edge_functions.test.ts; the text checks (M3, M14) in aftersale.test.ts and
// screening.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { type Order, type Shop, seedShop, setMarketOpen, unpaidOrder } from './lib/market.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const status = (p: string) => db.val<string>(`select listing_status from products where id = '${p}'`);

function paidOrder(customer: string = ids.customer): Order {
  const o = unpaidOrder(db, s, customer);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() where id = '${o.o}';
       select mp_order_paid('${o.o}');
       insert into invoices (number, icv, order_id, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
       values ('INV-M-' || substr(md5(random()::text), 1, 8), next_invoice_slot(), '${o.o}', 'SAR', 100000, 15000, 115000, 115000, 15000, 'qr');`);
  return o;
}
/** A live listing of seller A, approved by our team at 100.00 SAR. */
function liveListing(slug: string, price = 10000): string {
  const p = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, stock) values ('${slug}', 'Oud ${slug}', 'عود', ${price}, '${s.A}', '${s.cat('oud-oils')}', 5) returning id`, user('sellerA'));
  svc(`update products set listing_status = 'approved', is_active = true where id = '${p}'`);
  return p;
}

let fresh: { marketDefault: string | null; sandboxActive: boolean };
before(() => {
  db = freshDb('review_medium', undefined, { asShipped: true });
  fresh = {
    marketDefault: db.val<string | null>(`select column_default from information_schema.columns where table_name = 'mp_settings' and column_name = 'marketplace_open'`),
    sandboxActive: db.val<boolean>(`select active from carrier_providers where id = 'sandbox'`),
  };
  s = seedShop(db);
});
after(() => db.drop());

describe('M1: the price guard compares with the approved price', () => {
  test('small steps cannot walk a live price past the limit', () => {
    const p = liveListing('steps');
    let price = 10000;
    let first = -1;
    for (let i = 1; i <= 13 && first < 0; i++) {
      price = Math.round(price * 0.71);
      db.exec(`update products set base_price_sar = ${price} where id = '${p}'`, user('sellerA'));
      if (status(p) !== 'approved') first = i;
    }
    assert.equal(first, 2, 'the second 29% cut is 50% below the approved price: back to our team');
    assert.equal(status(p), 'pending_review');
  });

  test('a price changed while the listing waits for review sends it back through the check', () => {
    const p = liveListing('queue-price');
    svc(`update products set listing_status = 'pending_review' where id = '${p}'`);
    db.exec(`update products set base_price_sar = 100 where id = '${p}'`, user('sellerA'));
    assert.equal(status(p), 'draft');
  });

  test('within the limit of the approved price the listing stays live, both ways', () => {
    const p = liveListing('small');
    db.exec(`update products set base_price_sar = 8000 where id = '${p}'`, user('sellerA'));
    db.exec(`update products set base_price_sar = 12500 where id = '${p}'`, user('sellerA'));
    assert.equal(status(p), 'approved');
  });

  test('an option\'s price is held to its approved price too', () => {
    const p = liveListing('opt-steps');
    const v = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock, price_minor) values ('${p}', '6 ml', '٦ مل', 3, 10000) returning id`, 'service');
    for (const price of [7100, 5000]) db.exec(`update product_variants set price_minor = ${price} where id = '${v}'`, user('sellerA'));
    assert.equal(status(p), 'pending_review');
  });
});

describe('M2: options are content', () => {
  test('an option added, changed or removed while the listing waits for review sends it back through the check', () => {
    const p = liveListing('opt-queue');
    svc(`update products set listing_status = 'pending_review' where id = '${p}'`);
    db.exec(`insert into product_variants (product_id, label_en, label_ar, stock, price_minor) values ('${p}', 'WhatsApp 0501234567 for wholesale', 'جملة', 5, 1)`, user('sellerA'));
    assert.equal(status(p), 'draft');
  });

  test('removing an option of a waiting listing also sends it back; removing the last option of a live one leaves no stale stock', () => {
    const p = liveListing('opt-delete');
    const v = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${p}', '3 ml', '٣ مل', 50) returning id`, 'service');
    assert.equal(db.val(`select stock from products where id = '${p}'`), 50);
    db.exec(`delete from product_variants where id = '${v}'`, user('sellerA'));
    assert.equal(db.val(`select stock from products where id = '${p}'`), 0, 'no option left: nothing to sell until the seller sets stock');
    const q = liveListing('opt-delete-2');
    const w = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${q}', '3 ml', '٣ مل', 5) returning id`, 'service');
    svc(`update products set listing_status = 'pending_review' where id = '${q}'`);
    db.exec(`delete from product_variants where id = '${w}'`, user('sellerA'));
    assert.equal(status(q), 'draft');
  });

  test('the listing check and our reviewers see the options', () => {
    const p = liveListing('opt-context');
    svc(`insert into product_variants (product_id, label_en, label_ar, stock, price_minor) values ('${p}', '12 ml', '١٢ مل', 5, 20000)`);
    const ctx = db.val<{ variants: { label_en: string; price_minor: number }[] }>(`select mp_listing_check_context('${p}')`, 'service');
    assert.deepEqual(ctx.variants.map((v) => [v.label_en, v.price_minor]), [['12 ml', 20000]]);
  });
});

describe('M4: a failed delivery attempt is not the end', () => {
  test('failed on day 1 then delivered on day 2: delivered (at the carrier\'s time), the sale booked, returns open', () => {
    const o = paidOrder();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    const sh = db.val<{ id: string }>(`select mp_record_shipment('${o.a}', ${j({ idempotency_key: 'm4-ship-0001', provider_id: 'sandbox', tracking_number: 'SBXM4000001', label_path: `${o.a}/m4.pdf` })})`, 'service');
    const d1 = new Date(Date.now() - 2 * 86400000).toISOString();
    const d2 = new Date(Date.now() - 86400000).toISOString();
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([
      { id: 'pu', status: 'picked_up', at: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: 'f1', status: 'failed', at: d1, en: 'Nobody at home' },
      { id: 'dl', status: 'delivered', at: d2 },
    ])})`, 'service');
    assert.equal(db.val(`select status from shipments where id = '${sh.id}'`), 'delivered');
    const sub = db.one<{ status: string; delivered_at: string }>(`select status, delivered_at from sub_orders where id = '${o.a}'`);
    assert.equal(sub.status, 'delivered');
    assert.equal(new Date(sub.delivered_at).toISOString(), d2, 'L7: delivered when the carrier says, not when we heard');
    assert.equal(db.val(`select count(*)::int from seller_ledger where sub_order_id = '${o.a}' and kind = 'sale'`), 1);
  });

  test('a failure as the latest news shows as failed, and a later delivery still wins', () => {
    const o = paidOrder();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    const sh = db.val<{ id: string }>(`select mp_record_shipment('${o.a}', ${j({ idempotency_key: 'm4-ship-0002', provider_id: 'sandbox', tracking_number: 'SBXM4000002', label_path: `${o.a}/m4b.pdf` })})`, 'service');
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([{ id: 'pu', status: 'picked_up', at: new Date(Date.now() - 7200000).toISOString() }, { id: 'f', status: 'failed', at: new Date(Date.now() - 3600000).toISOString() }])})`, 'service');
    assert.equal(db.val(`select status from sub_orders where id = '${o.a}'`), 'delivery_failed');
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([{ id: 'dl', status: 'delivered', at: new Date().toISOString() }])})`, 'service');
    assert.equal(db.val(`select status from sub_orders where id = '${o.a}'`), 'delivered');
  });
});

describe('M5: partners are not paid the retail price by default', () => {
  test('a partner\'s delivered parcel books nothing payable until their terms are set', () => {
    const P = db.val<string>(`select staff_create_seller(${j({ name_en: 'Private label partner', country: 'SA', kind: 'partner', contact_name: 'Partner', contact_email: 'p@partner.test', commission_bps: 3000 })})`, user('owner'));
    const o = paidOrder();
    svc(`update sub_orders set seller_id = '${P}', kind = 'partner', commission_minor = 0 where id = '${o.b}'`);
    svc(`update sub_orders set status = 'delivered', delivered_at = now() where id = '${o.b}'`);
    assert.equal(db.val(`select count(*)::int from seller_ledger where seller_id = '${P}'`), 0);
  });
});

describe('M6: the marketplace switch is in the database, and off by default', () => {
  test('off: the public sees only our own products, and no seller pages, search results or applications', () => {
    setMarketOpen(db, false);
    try {
      assert.equal(db.val(`select marketplace_open from mp_settings where id = 1`), false);
      const slugs = db.rows<{ slug: string }>(`select slug from products`, 'anon').map((r) => r.slug);
      assert.ok(slugs.includes('ajwa-dates-1kg'));
      assert.ok(!slugs.includes('royal-oud'), 'a live seller listing is hidden while the marketplace is closed');
      assert.ok(!db.rows<{ slug: string }>(`select slug from products`, user('customer')).some((r) => r.slug === 'royal-oud'));
      assert.equal(db.val(`select mp_storefront('oud-house-a')`, 'anon'), null);
      const found = db.val<{ items: { slug: string }[] }>(`select mp_search('{"q": "oud"}')`, 'anon');
      assert.ok(!found.items.some((i) => i.slug === 'royal-oud'));
      assert.equal(db.rows(`select id from sellers`, 'anon').length, 0);
      assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "New shop", "country": "SA", "contact_name": "New", "product_summary": "Oud"}'::jsonb)`, user('applicant')) ?? 'accepted', /not open|opening soon/i);
      // the seller and our team still see the listing (to prepare and to test)
      assert.ok(db.rows(`select slug from products where slug = 'royal-oud'`, user('sellerA')).length === 1);
      assert.ok(db.rows(`select slug from products where slug = 'royal-oud'`, user('manager')).length === 1);
    } finally {
      setMarketOpen(db, true);
    }
    assert.ok(db.rows<{ slug: string }>(`select slug from products`, 'anon').some((r) => r.slug === 'royal-oud'), 'on: live listings show');
  });

  test('a fresh database starts with the marketplace closed and the sandbox courier switched off', () => {
    assert.equal(fresh.marketDefault, 'false', 'marketplace_open is off until Afzal switches it on');
    assert.equal(fresh.sandboxActive, false, 'the sandbox courier cannot mark real parcels delivered until it is switched on');
  });
});

describe('M12: bank details', () => {
  test('only finance, managers and the owner see a seller\'s bank details', () => {
    for (const k of ['marketing', 'support', 'operations'] as const) {
      const all = db.val<{ private: Record<string, unknown> | null }[]>(`select admin_sellers()`, user(k));
      assert.ok(all.every((x) => !x.private || !('iban' in x.private)), `${k} does not get the IBAN from admin_sellers`);
      assert.equal(db.rows(`select iban from seller_private where seller_id = '${s.A}'`, user(k)).length, 0, `${k} cannot read it from the table`);
    }
    assert.ok(db.val<{ private: { iban?: string } }[]>(`select admin_sellers()`, user('finance')).some((x) => x.private?.iban === 'SA0380000000608010167519'));
  });

  test('no payout is recorded after the bank details change until KYC approves them again and the hold has passed', () => {
    const o = paidOrder();
    svc(`update sub_orders set status = 'delivered', delivered_at = now() - interval '60 days' where id = '${o.a}';
         update seller_private set kyc_status = 'approved' where seller_id = '${s.A}';
         update mp_settings set payouts_enabled = true where id = 1`);
    db.exec(`update seller_private set iban = 'GB82WEST12345698765432' where seller_id = '${s.A}'`, user('sellerA'));
    const pay = `select mp_record_payout('${s.A}', 1000, 'TRF-1', (now() at time zone 'Asia/Riyadh')::date, null)`;
    assert.match(db.error(pay, user('finance')) ?? 'accepted', /bank details|KYC/i);
    svc(`update seller_private set kyc_status = 'approved' where seller_id = '${s.A}'`);
    assert.match(db.error(pay, user('finance')) ?? 'accepted', /bank details changed/i, 'the hold after a change');
    // and once the hold has passed (the change 8 days ago), the payout goes through (REVIEW-2: the block is not for ever)
    svc(`update seller_private set bank_changed_at = now() - interval '8 days' where seller_id = '${s.A}'`);
    assert.equal(db.error(pay, user('finance')), null);
    assert.equal(db.val(`select count(*)::int from seller_payouts where seller_id = '${s.A}' and reference = 'TRF-1'`), 1);
  });
});

describe('Decisions given a safe default (Needs Afzal)', () => {
  test('payouts stay off until the VAT treatment of sellers\' payouts is settled (decision 53)', () => {
    svc(`update mp_settings set payouts_enabled = false where id = 1`);
    assert.match(db.error(`select mp_record_payout('${s.B}', 100, 'TRF-2', (now() at time zone 'Asia/Riyadh')::date, null)`, user('finance')) ?? 'accepted', /not switched on|payouts/i);
  });

  test('support refunds only up to its limit (0 by default); finance, managers and the owner refund (decision 54)', () => {
    const o = paidOrder();
    assert.match(db.error(`select mp_prepare_refund('${o.o}', ${j({ key: 'sup-limit-0001', reason: 'Dates crushed', lines: [{ order_item_id: o.items.h, quantity: 1 }] })}, '${ids.support}')`, 'service') ?? 'accepted', /limit|finance/i);
    assert.equal(db.error(`select mp_prepare_refund('${o.o}', ${j({ key: 'fin-limit-0001', reason: 'Dates crushed', lines: [{ order_item_id: o.items.h, quantity: 1 }] })}, '${ids.finance}')`, 'service'), null);
  });

  test('L4: a sale is payable only after the problem window (30 days) and the hold, not after the shorter return window', () => {
    const o = paidOrder();
    svc(`update sub_orders set status = 'delivered', delivered_at = now() where id = '${o.a}'`);
    const days = db.val<number>(`select available_on - booked_on from seller_ledger where sub_order_id = '${o.a}' and kind = 'sale'`);
    assert.equal(days, 33, '30 days to report a problem + 3 days hold (the oud\'s own return window is 7)');
  });

  test('the Saudi marketplace corridor opens only with an adviser\'s sign-off on record (decision 2)', () => {
    assert.equal(db.val(`select adviser_signed_off_at is not null or status = 'closed' from corridors where scope = 'marketplace' and from_country = 'SA' and to_country = 'SA'`), true);
  });
});

describe('Lows', () => {
  test('L1: an approved seller cannot be created directly through the table', () => {
    const id = db.val<string>(`insert into sellers (slug, name_en, country, status, kind) values ('direct-in', 'Direct', 'IN', 'approved', 'marketplace') returning id`, user('owner'));
    assert.equal(db.val(`select status from sellers where id = '${id}'`), 'pending');
  });

  test('L2: side-effect helpers in the private schema cannot be run by the API roles', () => {
    for (const fn of ['private.book_sale(uuid)', 'private.book_refund(uuid, uuid)', 'private.refresh_rating(uuid)', 'private.notify_return(uuid, text)',
      'private.notify_message(uuid, text, boolean)', 'private.notify_review(uuid, text)', 'private.ledger_available(uuid)']) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(db.val(`select has_function_privilege('${role}', '${fn}', 'execute')`), false, `${role} ${fn}`);
      }
    }
  });

  test('L3: a request with no role claim is never treated as the server', () => {
    db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if; end $$;
             grant anon, authenticated, service_role to authenticator;`);
    // what an API request with a token that has no role claim looks like: the API's own login, no claims
    assert.match(db.error(`set session authorization authenticator; set role authenticated; select seller_balance('${s.A}');`) ?? 'allowed', /Not allowed/);
    assert.equal(db.error(`select seller_balance('${s.A}')`), null, 'a direct database session (the connector, a job) still is the server');
  });

  test('L6: two lines of the same option cannot buy more than its stock (checked together)', async () => {
    const { createClient, fake } = await import('./lib/fake-supabase.ts');
    fake.db = db.name;
    fake.env = (k) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-role-key' : undefined);
    const { priceCart } = await import('../functions/_shared/cart.ts');
    const dbc = createClient('https://x', 'service-role-key');
    svc(`update product_variants set stock = 5 where id = '${s.variant}'`);
    // each line alone fits (4 and 2 of 5); together they do not
    await assert.rejects(priceCart(dbc as never, [{ productId: s.oud, variantId: s.variant, quantity: 4 }, { productId: s.oud, variantId: s.variant, quantity: 2 }]), /Only 5 left/);
    const ok = await priceCart(dbc as never, [{ productId: s.oud, variantId: s.variant, quantity: 3 }, { productId: s.oud, variantId: s.variant, quantity: 2 }]);
    assert.equal(ok.length, 2, 'five of five is fine');
  });

  test('L10: a payout recorded late is booked on the day it is recorded (a closed month never changes)', () => {
    const o = paidOrder();
    svc(`update sub_orders set status = 'delivered', delivered_at = now() - interval '70 days' where id = '${o.a}';
         update seller_private set kyc_status = 'approved', bank_changed_at = now() - interval '30 days' where seller_id = '${s.A}';
         update mp_settings set payouts_enabled = true where id = 1`);
    const paidOn = db.val<string>(`select ((now() at time zone 'Asia/Riyadh')::date - 20)::text`);
    db.val(`select mp_record_payout('${s.A}', 1000, 'TRF-LATE', '${paidOn}', null)`, user('finance'));
    assert.equal(db.val(`select booked_on::text = (now() at time zone 'Asia/Riyadh')::date::text from seller_ledger where kind = 'payout' and note like '%TRF-LATE%'`), true);
    assert.equal(db.val(`select paid_on::text from seller_payouts where reference = 'TRF-LATE'`), paidOn);
  });

});

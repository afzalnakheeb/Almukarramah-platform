// The independent re-review of the fix pass (REVIEW-2): what was still open, and what the fix pass added, each
// reproduced as it was found, in the database. The ones that need a function (N2's renewals and stray payments, N6,
// N7) are in edge_functions.test.ts; the masking (M3) and N10's made-to-measure choices, N12 in review_text.test.ts.
// The account deletion (N1, N3) runs the apps branch's real delete_account_data (fixtures/apps, freshDb withApps).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, user } from './lib/db.ts';
import { createClient, fake } from './lib/fake-supabase.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import { CONTACT_PROBES, ORDINARY, SOLICIT_PROBES } from './lib/probes.ts';

let db: Db;
let off: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Paid as the payment webhook does it (the order, then the parcels handed on), with its tax invoice. */
function paidOrder(customer: string = ids.customer): Order {
  const o = unpaidOrder(db, s, customer);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() where id = '${o.o}';
       select mp_order_paid('${o.o}');
       insert into invoices (number, icv, order_id, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
       values ('INV-R-' || substr(md5(random()::text), 1, 8), next_invoice_slot(), '${o.o}', 'SAR', 100000, 15000, 115000, 115000, 15000, 'qr');`);
  return o;
}
const deliver = (sub: string) => svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 day' where id = '${sub}'`);
const prepare = (order: string, p: Record<string, unknown>, who = ids.finance) => db.val<Record<string, any>>(`select mp_prepare_refund('${order}', ${j(p)}, '${who}')`, 'service');
const prepareError = (order: string, p: Record<string, unknown>, who = ids.finance) => db.error(`select mp_prepare_refund('${order}', ${j(p)}, '${who}')`, 'service');
const complete = (refund: string) => db.val(`select mp_complete_refund('${refund}', true, 'moyasar:test', null)`, 'service');
const refunded = (order: string) => db.val<number>(`select coalesce(sum(amount_minor), 0)::int from refunds where order_id = '${order}' and status <> 'failed'`);
/** One unit of the oud (2 bought, 250 SAR each) returned and approved: R-… */
function approvedReturn(o: Order): string {
  deliver(o.a);
  const r = db.val<{ id: string }>(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: o.a, reason: 'damaged', details: 'One bottle arrived broken', lines: [{ order_item_id: o.items.a, quantity: 1 }] })})`, 'service');
  db.val(`select mp_return_action('${ids.support}', '${r.id}', 'approve', 'Approved: broken in transit', false)`, 'service');
  return r.id;
}

before(() => {
  db = freshDb('review2', undefined, { withApps: true });
  fake.db = db.name;
  s = seedShop(db);
  off = freshDb('review2_off', undefined, { asShipped: true });
  seedPeople(off);
});
after(() => {
  db.drop();
  off.drop();
});

// ================================================================ H1: one ledger for every refund path
describe('H1 (round 2): every refund path counts what the others refunded, per line, return and delivery', () => {
  test('a lines refund of an item in an open return is refused; the return refunds only the unit that came back', () => {
    const o = paidOrder();
    const r = approvedReturn(o);
    // the re-review's route: the returned unit by lines first...
    assert.match(prepareError(o.o, { key: 'h1b-lines-0001', reason: 'Broken bottle', lines: [{ order_item_id: o.items.a, quantity: 1 }] }) ?? 'accepted',
      /return R-\d+-\d+/, 'refused: that unit is refunded from its return');
    // ...then "Refund this return": one unit, no delivery (the other unit is still with the customer)
    const f = prepare(o.o, { key: 'h1b-return-001', reason: 'Broken bottle', return_id: r });
    assert.equal(f.amount_minor, 25000);
    complete(f.id);
    assert.equal(refunded(o.o), 25000, 'never the unit that stayed with the customer, never the delivery');
  });

  test('once the return is refunded, the other unit can be refunded by lines; the delivery is refunded once', () => {
    const o = paidOrder();
    const r = approvedReturn(o);
    complete(prepare(o.o, { key: 'h1b-return-002', reason: 'Broken bottle', return_id: r }).id);
    const f = prepare(o.o, { key: 'h1b-lines-0002', reason: 'Goodwill: the other bottle too', lines: [{ order_item_id: o.items.a, quantity: 1 }], shipping: [o.a] });
    assert.equal(f.amount_minor, 25000 + 3000);
    complete(f.id);
    assert.match(prepareError(o.o, { key: 'h1b-lines-0003', reason: 'Again', lines: [{ order_item_id: o.items.a, quantity: 1 }], shipping: [o.a] }) ?? 'accepted', /Only 0|Nothing left/);
    assert.equal(refunded(o.o), 53000);
  });

  test('a parcel or a whole-order refund is refused while a return on it is open', () => {
    const o = paidOrder();
    approvedReturn(o);
    assert.match(prepareError(o.o, { key: 'h1b-parcel-001', reason: 'Seller cancelled', sub_order_id: o.a }) ?? 'accepted', /return R-/);
    assert.match(prepareError(o.o, { key: 'h1b-full-0001', reason: 'Everything back' }) ?? 'accepted', /return R-/);
    assert.equal(refunded(o.o), 0);
  });

  test('a unit being refunded by lines cannot be asked back in a return (the same ledger, processing included)', () => {
    const o = paidOrder();
    deliver(o.a);
    prepare(o.o, { key: 'h1b-lines-0004', reason: 'Both bottles leaked', lines: [{ order_item_id: o.items.a, quantity: 2 }] });   // processing
    assert.match(db.error(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: o.a, reason: 'damaged', details: 'One bottle arrived broken', lines: [{ order_item_id: o.items.a, quantity: 1 }] })})`, 'service') ?? 'accepted',
      /Only 0/);
  });
});

// ================================================================ H4 with the marketplace as shipped
describe('H4 (round 2): products are read with select * on the database as shipped (every switch off)', () => {
  test('anon and a signed-in customer, with main\'s and the apps branch\'s catalogue query', async () => {
    assert.equal(off.val(`select marketplace_open::text from mp_settings where id = 1`), 'false');
    for (const who of ['anon', user('customer')] as const) {
      assert.ok(off.rows<{ slug: string }>(`select * from products`, who).some((r) => r.slug === 'ajwa-dates-1kg'));
    }
    const FIELDS = '*, categories(slug, name_en, name_ar), product_prices(currency, amount_minor), product_tags(tags(*))';
    const was = fake.db;
    fake.db = off.name;
    try {
      const anon = createClient('https://project.supabase.test', 'anon-key');
      const { data, error } = await anon.from('products').select(FIELDS).eq('is_active', true);
      assert.equal(error, null, JSON.stringify(error));
      assert.ok((data as { slug: string }[]).some((p) => p.slug === 'ajwa-dates-1kg'));
    } finally {
      fake.db = was;
    }
  });
});

// ================================================================ H5: every public field of a shop
const HELD = ['name_en', 'name_ar', 'tagline_en', 'tagline_ar', 'about_en', 'about_ar', 'returns_en', 'returns_ar', 'city'];
const MEDIA = ['logo', 'banner'];
const LOCKED = ['id', 'slug', 'country', 'kind', 'status', 'created_at'];
const NUMBERS = ['handling_days'];

describe('H5 (round 2): every public field of a shop page is checked, and held for approval once the shop is live', () => {
  test('the public columns of sellers are exactly the ones classified here (a new public column fails until it is)', () => {
    const cols = db.rows<{ column_name: string }>(`select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'sellers' and grantee = 'anon' and privilege_type = 'SELECT'`).map((r) => r.column_name).sort();
    assert.deepEqual(cols, [...HELD, ...MEDIA, ...LOCKED, ...NUMBERS].sort());
    assert.ok(!cols.includes('website'), 'a link off the platform is not public');
    const store = db.val<{ seller: Record<string, unknown> }>(`select mp_storefront('${db.val(`select slug from sellers where id = '${s.A}'`)}')`, 'anon');
    for (const k of Object.keys(store.seller)) assert.ok([...HELD, ...MEDIA, ...LOCKED, ...NUMBERS, 'since'].includes(k), `storefront shows ${k}`);
  });

  test('a contact detail in any held field is refused, the city included (the re-review\'s wa.me link)', () => {
    for (const f of HELD) {
      for (const v of ['wa.me/966501234567', 'Call 0501234567']) {
        assert.ok(db.error(`update sellers set ${f} = ${lit(v)} where id = '${s.A}'`, user('sellerA')), `${f} = ${v}`);
      }
    }
    assert.equal(db.val(`select city from sellers where id = '${s.A}'`), 'Madinah');
    assert.equal(db.rows(`select 1 from sellers where id = '${s.A}' and profile_pending is not null`).length, 0, 'nothing was held either');
  });

  test('a clean change to the city waits for our team; the page keeps the approved one until then', () => {
    db.exec(`update sellers set city = 'Jeddah' where id = '${s.A}'`, user('sellerA'));
    assert.equal(db.val(`select city from sellers where id = '${s.A}'`, 'anon'), 'Madinah');
    assert.equal(db.val(`select profile_pending ->> 'city' from sellers where id = '${s.A}'`), 'Jeddah');
    db.val(`select mp_review_seller('${s.A}', 'approve_profile', 'Fine', null)`, user('manager'));
    assert.equal(db.val(`select city from sellers where id = '${s.A}'`, 'anon'), 'Jeddah');
  });

  test('logo and banner only from the seller\'s own uploads; locked fields do not move; handling days stay a small number', () => {
    for (const f of MEDIA) assert.ok(db.error(`update sellers set ${f} = 'https://evil.example/x.png' where id = '${s.A}'`, user('sellerA')), f);
    const before = db.one<Record<string, unknown>>(`select ${LOCKED.join(', ')} from sellers where id = '${s.A}'`);
    db.error(`update sellers set slug = 'call-0501234567', country = 'AE', kind = 'partner', status = 'approved', created_at = now() - interval '1 year' where id = '${s.A}'`, user('sellerA'));
    assert.deepEqual(db.one(`select ${LOCKED.join(', ')} from sellers where id = '${s.A}'`), before);
    assert.ok(db.error(`update sellers set handling_days = 99 where id = '${s.A}'`, user('sellerA')));
  });

  test('N10: a pending shop\'s address (slug) is checked for contact details and our name too', () => {
    const applicant = db.val<string>(`select apply_as_seller('{"agree": true, "name_en": "Rawdah Looms", "country": "SA", "city": "Madinah", "contact_name": "Hamza", "product_summary": "Prayer mats"}'::jsonb)`, user('applicant'));
    for (const slug of ['call-0501234567', 'whatsapp-rawdah', 'almukarramah-official']) {
      assert.ok(db.error(`update sellers set slug = '${slug}' where id = '${applicant}'`, user('applicant')), slug);
    }
    assert.equal(db.error(`update sellers set slug = 'rawdah-looms-madinah' where id = '${applicant}'`, user('applicant')), null);
  });
});

// ================================================================ M3 in the database
describe('M3 (round 2): the database check catches the same disguises (private.contact_hint)', () => {
  test('every one of the re-review\'s 43 probes', () => {
    const missed = [...CONTACT_PROBES.map(([p]) => p), ...SOLICIT_PROBES].filter((p) => db.val(`select private.contact_hint(${lit(p)})`) === null);
    assert.deepEqual(missed, []);
  });
  test('ordinary shop text passes', () => {
    const flagged = ORDINARY.filter((p) => db.val(`select private.contact_hint(${lit(p)})`) !== null);
    assert.deepEqual(flagged, []);
  });
});

// ================================================================ N1 and N3: account deletion (the apps branch's own function)
describe('N1: a customer with messages, a reviewed purchase, a return with photos and a gift message can delete their account', () => {
  test('delete_account_data, then the account itself: everything kept for the records is unlinked and its words removed', () => {
    const c = ids.customer2;
    svc(`insert into profiles (id, full_name) values ('${c}', 'Sara Al Qahtani') on conflict (id) do update set full_name = excluded.full_name`);
    const o = paidOrder(c);
    for (const sub of [o.a, o.b, o.h]) deliver(sub);
    svc(`update orders set status = 'delivered' where id = '${o.o}'`);
    // a conversation with the seller, both ways
    const sent = db.val<{ thread_id: string }>(`select mp_post_message('${c}', ${j({ as: 'customer', sub_order_id: o.a, body: 'Is this oud from Cambodia? My name is Sara.' })})`, 'service');
    db.val(`select mp_post_message('${ids.sellerA}', ${j({ as: 'seller', thread_id: sent.thread_id, body: 'Yes, from Trat province.' })})`, 'service');
    // a published review with the seller's published reply
    const rv = db.val<{ id: string }>(`select mp_submit_review('${c}', ${j({ order_item_id: o.items.a, rating: 5, title: 'Lovely', body: 'Deep and smooth, as described.', lang: 'en' })})`, 'service');
    db.val(`select mp_moderate_review('${ids.support}', '${rv.id}', 'review', 'publish')`, 'service');
    db.val(`select mp_reply_review('${ids.sellerA}', '${rv.id}', 'Thank you, Sara!')`, 'service');
    db.val(`select mp_moderate_review('${ids.support}', '${rv.id}', 'reply', 'publish')`, 'service');
    // a return with a screened photo
    const photo = db.val<string>(`insert into media_assets (user_id, kind, bucket, path, mime, bytes, width, height, sha256, status)
      values ('${c}', 'return_photo', 'customer-uploads', '${c}/media/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 1600, 1200, encode(sha256(convert_to(random()::text, 'UTF8')), 'hex'), 'passed') returning id`, 'service');
    const ret = db.val<{ id: string }>(`select mp_return_request('${c}', ${j({ sub_order_id: o.h, reason: 'damaged', details: 'The box was crushed', photos: [photo], lines: [{ order_item_id: o.items.h, quantity: 1 }] })})`, 'service');
    // the sellers' copy of the gift message, as create-payment writes it (masked)
    svc(`update sub_orders set gift_message = 'Happy Eid! Call me on •••' where order_id = '${o.o}'`);

    // the apps branch's account deletion: the data first, then the account
    const summary = db.val<{ orders_kept_unlinked: number }>(`select delete_account_data('${c}')`, 'service');
    assert.ok(summary.orders_kept_unlinked >= 1);
    assert.equal(db.error(`delete from auth.users where id = '${c}'`), null, 'the account itself goes (the person can no longer sign in)');
    assert.equal(db.val(`select count(*)::int from auth.users where id = '${c}'`), 0);

    // kept for the records, unlinked, the words removed
    const msgs = db.rows<{ sender: string; sender_id: string | null; body: string }>(`select sender, sender_id, body from messages where thread_id = '${sent.thread_id}' order by id`);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].sender_id, null);
    assert.doesNotMatch(msgs[0].body, /Cambodia|Sara/, 'the customer\'s words are removed');
    assert.equal(msgs[1].body, 'Yes, from Trat province.', 'the seller\'s reply stays');
    assert.deepEqual(db.one(`select user_id, subject ~ 'Sara' as named from message_threads where id = '${sent.thread_id}'`), { user_id: null, named: false });
    assert.equal(db.val(`select user_id from return_requests where id = '${ret.id}'`), null, 'the return is kept, unlinked');
    assert.equal(db.val(`select user_id from media_assets where id = '${photo}'`), null);
    // N3: the sellers' copies of the gift message go with the order's own
    assert.equal(db.val(`select count(*)::int from sub_orders where order_id = '${o.o}' and gift_message is not null`), 0);
    // the review is the person's own words on a public page: it goes, with its reply
    assert.equal(db.val(`select count(*)::int from product_reviews where id = '${rv.id}'`), 0);
    // the seller cannot write to someone who is no longer there
    assert.match(db.error(`select mp_post_message('${ids.sellerA}', ${j({ as: 'seller', thread_id: sent.thread_id, body: 'Hello?' })})`, 'service') ?? 'accepted', /deleted/);
  });

  test('messages are still never edited or deleted directly', () => {
    const id = db.val<number>(`select id from messages order by id limit 1`);
    assert.match(db.error(`update messages set body = 'changed' where id = ${id}`, 'service') ?? 'accepted', /never/);
    assert.match(db.error(`update messages set sender_id = null where id = ${id}`, 'service') ?? 'accepted', /never/);
    assert.match(db.error(`delete from messages where id = ${id}`, 'service') ?? 'accepted', /never/);
  });
});

describe('N3: the sellers\' copies of a gift message follow the order\'s', () => {
  test('clearing the order\'s gift message clears every parcel\'s copy', () => {
    const o = unpaidOrder(db, s);
    svc(`update sub_orders set gift_message = 'Happy Eid! Call me on •••' where order_id = '${o.o}'`);
    svc(`update orders set gift_message = null where id = '${o.o}'`);
    assert.equal(db.val(`select count(*)::int from sub_orders where order_id = '${o.o}' and gift_message is not null`), 0);
  });
});

// ================================================================ N2: payments for orders no longer waiting
describe('N2: a payment for an order that is no longer waiting is recorded for our team, never dropped', () => {
  test('a paid payment for a cancelled order: logged, on the dashboard, once however often Moyasar sends it', () => {
    const o = unpaidOrder(db, s);
    svc(`update orders set status = 'cancelled' where id = '${o.o}'`);
    const p = { id: 'pay_late_00001', amount: o.total, currency: 'SAR', order_id: o.o, invoice_id: null };
    const r = db.val<{ applied: boolean; stray?: boolean }>(`select mp_payment_received(${j(p)})`, 'service');
    assert.equal(r.applied, false);
    assert.equal(r.stray, true);
    db.val(`select mp_payment_received(${j(p)})`, 'service');
    assert.equal(db.val(`select count(*)::int from payment_issues where payment_id = 'pay_late_00001' and status = 'open' and kind = 'order_not_waiting'`), 1);
    assert.ok(db.val<number>(`select count(*)::int from audit_log where row_id = '${o.o}' and action = 'STRAY_PAYMENT'`) >= 1);
    assert.equal(db.val<{ queues: { payments_to_resolve: number } }>(`select admin_marketplace_overview(30)`, user('owner')).queues.payments_to_resolve >= 1, true);
    assert.equal(db.rows(`select * from payment_issues`, user('support')).length, 0, 'only owner, manager and finance see them');
  });

  test('a second payment for a paid order and a payment of the wrong amount are recorded too', () => {
    const o = paidOrder();
    db.val(`select mp_payment_received(${j({ id: 'pay_second_0001', amount: o.total, currency: 'SAR', order_id: o.o })})`, 'service');
    const o2 = unpaidOrder(db, s);
    db.val(`select mp_payment_received(${j({ id: 'pay_wrong_00001', amount: o2.total - 100, currency: 'SAR', order_id: o2.o })})`, 'service');
    assert.deepEqual(db.rows<{ kind: string }>(`select kind from payment_issues where payment_id in ('pay_second_0001', 'pay_wrong_00001') order by payment_id`).map((x) => x.kind),
      ['second_payment', 'amount_mismatch']);
  });
});

// ================================================================ N4: immutable records and deleted parents
describe('N4: an immutable record may follow a deleted parent; nothing else changes it', () => {
  test('a seller deletes a draft that went through the listing check: its screening records stay, unlinked', () => {
    const draft = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('checked-draft', 'Checked draft', 'مسودة', 9000, '${s.A}', '${s.cat('oud-oils')}') returning id`, user('sellerA'));
    const run = db.val<number>(`insert into screening_runs (subject, product_id, seller_id, stage, verdict) values ('listing', '${draft}', '${s.A}', 'final', 'block') returning id`, 'service');
    assert.equal(db.error(`delete from products where id = '${draft}'`, user('sellerA')), null);
    assert.deepEqual(db.one(`select product_id, seller_id is not null as seller from screening_runs where id = ${run}`), { product_id: null, seller: true });
    assert.match(db.error(`update screening_runs set verdict = 'pass' where id = ${run}`, 'service') ?? 'accepted', /never/);
    assert.match(db.error(`delete from screening_runs where id = ${run}`, 'service') ?? 'accepted', /never/);
  });

  test('deleting a member of staff who booked statement entries keeps the entries, unlinked', () => {
    const temp = '00000000-0000-4000-a000-0000000000ff';
    db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${temp}', 'temp-finance@test.local', now());
             insert into staff_members (user_id, role, name) values ('${temp}', 'finance', 'Temp');`);
    db.val(`select mp_ledger_adjust('${s.B}', 100, 'Courier refund passed on')`, { uid: temp, email: 'temp-finance@test.local' });
    svc(`delete from staff_members where user_id = '${temp}'`);
    assert.equal(db.error(`delete from auth.users where id = '${temp}'`), null);
    assert.equal(db.val(`select count(*)::int from seller_ledger where seller_id = '${s.B}' and note like 'Courier refund%' and created_by is null`), 1);
    assert.match(db.error(`update seller_ledger set note = 'changed' where seller_id = '${s.B}'`, 'service') ?? 'accepted', /never/);
  });

  test('a seller deleted by the owner takes its review history; a direct delete of that history is still refused', () => {
    const x = db.val<string>(`insert into sellers (slug, name_en, country, kind) values ('to-delete', 'To delete', 'SA', 'marketplace') returning id`, 'service');
    svc(`insert into seller_review_events (seller_id, kind, message) values ('${x}', 'note', 'Applied by phone')`);
    assert.match(db.error(`delete from seller_review_events where seller_id = '${x}'`, 'service') ?? 'accepted', /never/);
    assert.equal(db.error(`delete from sellers where id = '${x}'`, user('owner')), null);
    assert.equal(db.val(`select count(*)::int from seller_review_events where seller_id = '${x}'`), 0);
  });
});

// ================================================================ N5: finishing invoices has a limit
describe('N5: finish-pending issues missing invoices for recent orders only; anything older is for our team', () => {
  test('an old paid order and a refunded order without an invoice are flagged, not invoiced automatically', () => {
    const recent = unpaidOrder(db, s);
    const old = unpaidOrder(db, s);
    const refundedOrder = unpaidOrder(db, s);
    svc(`update orders set status = 'paid', payment_id = 'pay_recent_n5', paid_at = now() - interval '1 hour' where id = '${recent.o}';
         update orders set status = 'paid', payment_id = 'pay_old_n5', paid_at = now() - interval '40 days' where id = '${old.o}';
         update orders set status = 'refunded', payment_id = 'pay_ref_n5', paid_at = now() - interval '2 hours' where id = '${refundedOrder.o}';`);
    const w = db.val<{ orders_without_invoice: string[]; orders_without_invoice_old: string[] }>(`select mp_pending_work(500, 0)`, 'service');
    assert.ok(w.orders_without_invoice.includes(recent.o));
    assert.ok(!w.orders_without_invoice.includes(old.o), 'an old order is never invoiced today by the job');
    assert.ok(!w.orders_without_invoice.includes(refundedOrder.o), 'nor a refunded one');
    assert.ok(w.orders_without_invoice_old.includes(old.o) && w.orders_without_invoice_old.includes(refundedOrder.o), 'they are listed for our team');
  });
});

// ================================================================ N8: tracking
describe('N8: a late "returned" event does not undo a delivery', () => {
  test('returned dated before the delivery, arriving after it: the parcel stays delivered', () => {
    const o = paidOrder();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    const sh = db.val<{ id: string }>(`select mp_record_shipment('${o.a}', ${j({ idempotency_key: 'n8-label-00001', provider_id: 'sandbox', provider_ref: 'sbx_n8', tracking_number: 'SBXN8', tracking_url: 'https://track.test/SBXN8' })})`, 'service');
    const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([{ id: 'p', status: 'picked_up', at: at(30) }, { id: 'd', status: 'delivered', at: at(2) }])})`, 'service');
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([{ id: 'r', status: 'returned', at: at(5) }])})`, 'service');
    assert.equal(db.val(`select status::text from sub_orders where id = '${o.a}'`), 'delivered');
    // a return that really comes after the delivery still counts
    db.val(`select mp_record_shipment_event('${sh.id}', ${j([{ id: 'r2', status: 'returned', at: at(1) }])})`, 'service');
    assert.equal(db.val(`select status::text from sub_orders where id = '${o.a}'`), 'returned');
  });
});

// ================================================================ N9: Afzal's switches
describe('N9: only the owner changes the switches and limits Afzal decides', () => {
  test('a manager cannot; the owner can; the manager still edits the other settings', () => {
    for (const set of ['marketplace_open = false', 'sellers_open = false', 'payouts_enabled = true', 'support_refund_limit_minor = 999999', 'payout_bank_hold_days = 0']) {
      assert.match(db.error(`update mp_settings set ${set} where id = 1`, user('manager')) ?? 'accepted', /owner/, set);
    }
    assert.equal(db.error(`update mp_settings set review_window_days = 300 where id = 1`, user('manager')), null);
    assert.equal(db.error(`update mp_settings set support_refund_limit_minor = 50000 where id = 1`, user('owner')), null);
    assert.equal(db.val(`select support_refund_limit_minor from mp_settings where id = 1`), 50000);
    db.exec(`update mp_settings set support_refund_limit_minor = 0, review_window_days = 365 where id = 1`, user('owner'));
  });
});

// ================================================================ N11: what staff see about a seller
describe('N11: a seller\'s private details reach owner, manager and finance only', () => {
  test('admin_sellers for marketing, support and operations has no notes, legal or tax numbers, KYC note or contact details', () => {
    svc(`update seller_private set internal_notes = 'Paid late twice', legal_name = 'Oud House Est.', registration_no = '1010', tax_registration_no = '300000000000003',
           kyc_note = 'CR expires soon', contact_phone = '+966500000077' where seller_id = '${s.A}'`);
    const PRIVATE = ['internal_notes', 'legal_name', 'registration_no', 'tax_registration_no', 'kyc_note', 'contact_email', 'contact_phone', 'iban'];
    const rowOf = (who: Parameters<typeof user>[0]) => db.val<{ seller: { id: string }; private: Record<string, unknown> | null }[]>(`select admin_sellers()`, user(who)).find((r) => r.seller.id === s.A)!;
    for (const who of ['marketing', 'support', 'operations'] as const) {
      const p = rowOf(who).private ?? {};
      for (const k of PRIVATE) assert.ok(!(k in p) || p[k] === null, `${who} sees ${k}`);
    }
    for (const who of ['owner', 'manager', 'finance'] as const) assert.equal(rowOf(who).private?.internal_notes, 'Paid late twice', who);
  });
});

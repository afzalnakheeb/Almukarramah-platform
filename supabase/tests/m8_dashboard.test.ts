// M8: our team's marketplace dashboard: staff only, read-only, and its queues and figures follow what happened.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, staffRoles, user } from './lib/db.ts';

let db: Db;
let A = '';
let o = '';
let sub = '';
let item = '';
type Overview = {
  days: number; queues: Record<string, number>; sales: Record<string, number>; owed_to_sellers: Record<string, number>;
  sellers: Record<string, number>; listings: Record<string, number>; top_sellers: { name_en: string; sales_sar_minor: number; standard: string }[];
  destinations: { country: string; parcels: number }[]; notifications_queued: number;
};
const overview = (who: Parameters<typeof user>[0] = 'manager') => db.val<Overview>(`select admin_marketplace_overview(30)`, user(who));

before(() => {
  db = freshDb('m8');
  seedPeople(db);
  ({ A } = seedSellers(db));
  const cat = db.val<string>(`select id from categories where slug = 'oud-oils'`);
  const p = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('oud-x', 'Oud X', 'عود', 40000, '${A}', '${cat}') returning id`, user('sellerA'));
  db.exec(`update products set listing_status = 'approved', is_active = true where id = '${p}'`, 'service');
  o = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, fx_per_sar)
    values ('${ids.customer}', 'c@test.local', 'GBP', 8400, 630, 9030, 1178, '{"kind": "home", "recipient_name": "Sara", "country": "AE", "city": "Dubai", "line1": "x"}', 0.21) returning id`, 'service');
  sub = db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, currency, items_minor, shipping_minor, commission_minor, invoicer, vat_mode, duties_mode, from_country, to_country, ship_by)
    values ('${o}', 1, '${A}', 'marketplace', 'GBP', 8400, 630, 2100, 'platform', 'destination', 'ddp', 'SA', 'AE', current_date - 2) returning id`, 'service');
  item = db.val<string>(`insert into order_items (order_id, sub_order_id, product_id, name_en, name_ar, unit_price_minor, quantity, line_total_minor, seller_id, commission_minor, return_policy, return_window_days)
    values ('${o}', '${sub}', '${p}', 'Oud X', 'عود', 8400, 1, 8400, '${A}', 2100, 'standard', 14) returning id`, 'service');
  db.exec(`update orders set status = 'paid', payment_id = 'pay_m8', paid_at = now() where id = '${o}'; select mp_order_paid('${o}')`, 'service');
});
after(() => db.drop());

describe('the marketplace dashboard', () => {
  test('staff, and server-side callers (a function with the service role, Claude\'s connector), never customers or sellers', () => {
    for (const r of staffRoles) assert.ok(overview(r).days === 30, r);
    assert.equal(db.val<Overview>(`select admin_marketplace_overview(7)`).days, 7, 'a direct database session');
    assert.equal(db.val<Overview>(`select admin_marketplace_overview()`, 'service').days, 30);
    assert.ok(Array.isArray(db.val(`select admin_payouts()`)), 'finance figures for the daily brief');
    for (const who of ['customer', 'sellerA'] as const) assert.match(db.error(`select admin_marketplace_overview()`, user(who)) ?? '', /Not allowed/);
    assert.match(db.error(`select admin_marketplace_overview()`, 'anon') ?? '', /permission denied/);
  });

  test('sales in SAR at the checkout rate, commission, destinations and the seller queues', () => {
    db.exec(`select seller_accept_sub_order('${sub}')`, user('sellerA'));
    db.exec(`update sub_orders set ship_by = current_date - 2 where id = '${sub}'`, 'service');   // two days on, not shipped
    const v = overview();
    assert.equal(v.sales.marketplace_sar_minor, 40000, 'GBP 84.00 at 0.21 per SAR');
    assert.equal(v.sales.commission_sar_minor, 10000);
    assert.deepEqual(v.destinations, [{ country: 'AE', parcels: 1 }]);
    assert.equal(v.queues.late_to_ship, 1, 'its ship-by date has passed');
    assert.equal(v.top_sellers[0].name_en, 'Oud House A');
    assert.equal(v.top_sellers[0].standard, 'new');
    assert.ok(v.notifications_queued >= 2, 'order confirmed and new order emails, queued');
  });

  test('after delivery: owed to the seller (held), then a return, a review and a flagged conversation show in the queues', () => {
    db.exec(`update sub_orders set status = 'delivered', shipped_at = now(), delivered_at = now() where id = '${sub}'`, 'service');
    let v = overview();
    assert.deepEqual([v.owed_to_sellers.balance_sar_minor, v.owed_to_sellers.held_sar_minor, v.owed_to_sellers.available_sar_minor], [30000, 30000, 0]);
    assert.equal(v.queues.late_to_ship, 0);
    db.exec(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${sub}", "reason": "damaged", "details": "The bottle arrived cracked", "lines": [{"order_item_id": "${item}", "quantity": 1}]}'::jsonb)`, 'service');
    db.exec(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${item}", "rating": 4}'::jsonb)`, 'service');
    db.exec(`select mp_post_message('${ids.sellerA}', '{"as": "seller", "sub_order_id": "${sub}", "body": "Sorry. WhatsApp me on •••", "masked": 1, "flags": ["contact_phone", "solicit"]}'::jsonb)`, 'service');
    v = overview('support');
    assert.deepEqual([v.queues.returns_to_answer, v.queues.reviews_to_publish, v.queues.conversations_flagged], [1, 1, 1]);
    assert.equal(v.sellers.approved, 2);
    assert.equal(v.listings.live, 1);
  });

  test('public tracking: anyone with the number sees the progress, never a name or an address', () => {
    const h = db.val<string>(`insert into shipments (sub_order_id, provider_id, tracking_number, idempotency_key, status) values ('${sub}', 'sandbox', 'SBX0000000777', 'm8-label-0001', 'picked_up') returning id`, 'service');
    db.exec(`insert into shipment_events (shipment_id, status, description_en, description_ar, location, occurred_at, source, dedupe_key) values
      ('${h}', 'label_created', 'Label created; waiting for the courier', 'تم إنشاء ملصق الشحن', null, '2026-11-01T08:00:00Z', 'seller', '${h}:label'),
      ('${h}', 'picked_up', 'Collected from the seller', 'استلمها المندوب من البائع', 'Madinah', '2026-11-01T10:00:00Z', 'sandbox', '${h}:picked')`, 'service');
    const t = db.val<{ status: string; events: { en: string; location: string }[] }>(`select track_parcel('sbx0000000777')`, 'anon');
    assert.equal(t.status, 'picked_up');
    assert.deepEqual(t.events.map((e) => e.en), ['Collected from the seller', 'Label created; waiting for the courier']);
    assert.doesNotMatch(JSON.stringify(t), /Sara|Dubai|c@test/);
    assert.equal(db.val(`select track_parcel('SBX0000000000')`, 'anon'), null);
    assert.equal(db.val(`select track_parcel('x'' or 1=1 --')`, 'anon'), null);
  });
});


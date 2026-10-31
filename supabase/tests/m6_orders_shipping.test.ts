// M6: sub-orders, payment, the seller's order flow (accept, make, label, cancel), shipments, tracking events, labels
// and the customer's tracking, with who can see what.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, staffRoles, user } from './lib/db.ts';

let db: Db;
let A = '';
let B = '';
let order = '';
let subA = '';
let subB = '';
let subHouse = '';
let variant = '';
let mat = '';
let thobe = '';
const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);

/** An order as create-payment writes it: the order, one sub-order per seller (and ours), the lines. */
function makeOrder(customer: string, f: { thobeDays?: number } = {}) {
  const o = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, idempotency_key)
    values ('${customer}', 'buyer@test.local', 'SAR', 100000, 6000, 106000, 13826,
            '{"kind": "home", "recipient_name": "Maryam Al Harbi", "phone": "+966500000009", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}', 'idem-' || substr(md5(random()::text), 1, 12)) returning id`, 'service');
  const sub = (seq: number, seller: string | null, kind: string, production = 0) => db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, currency, items_minor, shipping_minor,
      invoicer, vat_mode, duties_mode, from_country, to_country, handling_days, production_days, days_min, days_max, commission_minor)
    values ('${o}', ${seq}, ${seller ? `'${seller}'` : 'null'}, '${kind}', 'SAR', 50000, 3000, 'platform', 'origin', 'none', 'SA', 'SA', 2, ${production}, ${3 + production}, ${5 + production}, 12500) returning id`, 'service');
  const a = sub(1, A, 'marketplace');
  const b = sub(2, B, 'marketplace', f.thobeDays ?? 0);
  const h = sub(3, null, 'house');
  db.exec(`insert into order_items (order_id, sub_order_id, product_id, variant_id, variant_label, name_en, name_ar, unit_price_minor, quantity, line_total_minor, seller_id, commission_bps, commission_minor, custom, production_days, return_policy, return_window_days)
    values ('${o}', '${a}', '${mat}', '${variant}', '12 ml', 'Royal oud', 'دهن عود', 25000, 2, 50000, '${A}', 2500, 12500, null, 0, 'unopened_only', 7),
           ('${o}', '${b}', '${thobe}', null, null, 'Thobe', 'ثوب', 50000, 1, 50000, '${B}', 2500, 12500, '{"measurements": {"chest": 104}}', ${f.thobeDays ?? 0}, 'faulty_only', 14),
           ('${o}', '${h}', null, null, null, 'Dates', 'تمر', 6000, 1, 6000, null, null, null, null, 0, 'faulty_only', 3)`, 'service');
  return { o, a, b, h };
}

before(() => {
  db = freshDb('m6');
  seedPeople(db);
  ({ A, B } = seedSellers(db));
  db.exec(`insert into seller_categories (seller_id, category_id, status) values ('${B}', '${cat('thobes')}', 'approved')`, 'service');
  mat = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('royal', 'Royal oud', 'دهن عود', 25000, '${A}', '${cat('oud-oils')}') returning id`, user('sellerA'));
  variant = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${mat}', '12 ml', '١٢ مل', 10) returning id`, user('sellerA'));
  thobe = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, made_to_measure, stock) values ('thobe', 'Thobe', 'ثوب', 50000, '${B}', '${cat('thobes')}', true, 0) returning id`, user('sellerB'));
  db.exec(`update products set listing_status = 'approved', is_active = true where id in ('${mat}', '${thobe}')`, 'service');
  ({ o: order, a: subA, b: subB, h: subHouse } = makeOrder(ids.customer, { thobeDays: 10 }));
});
after(() => db.drop());

describe('payment', () => {
  test('paid: ours accepted at once, sellers accept theirs; stock comes off the option (and so the product)', () => {
    assert.equal(db.val(`select status from sub_orders where id = '${subA}'`), 'pending_payment');
    assert.match(db.error(`select mp_order_paid('${order}')`, user('customer')) ?? '', /permission denied/);
    // the payment webhook marks the order paid, then hands it on
    db.exec(`update orders set status = 'paid', paid_at = now() where id = '${order}'`, 'service');
    assert.deepEqual(db.val(`select mp_order_paid('${order}')`, 'service'), { applied: true, sub_orders: 3 });
    assert.deepEqual(db.rows(`select seq, status from sub_orders where order_id = '${order}' order by seq`),
      [{ seq: 1, status: 'awaiting_acceptance' }, { seq: 2, status: 'awaiting_acceptance' }, { seq: 3, status: 'accepted' }]);
    assert.equal(db.val(`select stock from product_variants where id = '${variant}'`), 8);
    assert.equal(db.val(`select stock from products where id = '${mat}'`), 8);
    assert.equal(db.val(`select stock from products where id = '${thobe}'`), 0, 'made to measure has no stock');
    assert.deepEqual(db.val(`select mp_order_paid('${order}')`, 'service'), { applied: false }, 'twice is harmless');
    assert.equal(db.val(`select stock from product_variants where id = '${variant}'`), 8);
  });
});

describe('who sees what', () => {
  test('the customer sees their sub-orders; each seller only theirs; nobody else', () => {
    assert.equal(db.rows(`select 1 from sub_orders where order_id = '${order}'`, user('customer')).length, 3);
    assert.equal(db.rows(`select 1 from sub_orders where order_id = '${order}'`, user('customer2')).length, 0);
    assert.deepEqual(db.rows<{ id: string }>(`select id from sub_orders where order_id = '${order}'`, user('sellerA')).map((x) => x.id), [subA]);
    assert.equal(db.rows(`select 1 from sub_orders`, 'anon').length, 0);
    for (const r of staffRoles) assert.equal(db.rows(`select 1 from sub_orders where order_id = '${order}'`, user(r)).length, 3, r);
  });

  test('sellers see their own lines, never the order (email, phone, address) or another seller\'s lines', () => {
    assert.deepEqual(db.rows<{ name_en: string }>(`select name_en from order_items where order_id = '${order}'`, user('sellerA')).map((x) => x.name_en), ['Royal oud']);
    assert.equal(db.rows(`select 1 from orders where id = '${order}'`, user('sellerA')).length, 0);
    const list = db.val<{ number: string; recipient: string; city: string; lines: { variant: string }[] }[]>(`select seller_sub_orders('${A}')`, user('sellerA'));
    assert.equal(list.length, 1);
    assert.equal(list[0].recipient, 'Maryam', 'first name only');
    assert.equal(list[0].city, 'Riyadh');
    assert.equal(list[0].lines[0].variant, '12 ml');
    assert.doesNotMatch(JSON.stringify(list), /buyer@test|\+966500000009|Olaya/);
    assert.match(db.error(`select seller_sub_orders('${A}')`, user('sellerB')) ?? '', /Not allowed/);
  });
});

describe('the seller\'s order flow', () => {
  test('accept: made-to-measure goes into production; ship-by counts production and handling', () => {
    assert.match(db.error(`select seller_accept_sub_order('${subB}')`, user('sellerA')) ?? '', /Not allowed/);
    db.exec(`select seller_accept_sub_order('${subB}')`, user('sellerB'));
    assert.deepEqual(db.one(`select status, ship_by = current_date + 12 as on_time from sub_orders where id = '${subB}'`), { status: 'in_production', on_time: true });
    assert.match(db.error(`select seller_accept_sub_order('${subB}')`, user('sellerB')) ?? '', /in_production/);
    db.exec(`select seller_production_done('${subB}')`, user('sellerB'));
    assert.equal(db.val(`select status from sub_orders where id = '${subB}'`), 'accepted');
    db.exec(`select seller_accept_sub_order('${subA}')`, user('sellerA'));
    assert.equal(db.val(`select status from sub_orders where id = '${subA}'`), 'accepted');
  });

  test('a label: recorded once per idempotency key, one active shipment per sub-order', () => {
    const rec = (key: string) => db.val<{ id: string; duplicate: boolean }>(`select mp_record_shipment('${subA}', '{"provider_id": "sandbox", "tracking_number": "SBX0000000001",
      "tracking_url": "https://track.example/SBX0000000001", "label_path": "${subA}/x.pdf", "weight_g": 900, "idempotency_key": "${key}"}'::jsonb)`, 'service');
    const first = rec('label-key-0001');
    assert.equal(first.duplicate, false);
    assert.deepEqual(rec('label-key-0001'), { id: first.id, duplicate: true });
    assert.match(db.error(`select mp_record_shipment('${subA}', '{"provider_id": "sandbox", "idempotency_key": "label-key-0002"}'::jsonb)`, 'service') ?? '', /ready_to_ship|duplicate key|shipments_one_active/);
    assert.equal(db.val(`select status from sub_orders where id = '${subA}'`), 'ready_to_ship');
    assert.match(db.error(`select mp_record_shipment('${subA}', '{}'::jsonb)`, user('sellerA')) ?? '', /permission denied/);
  });

  test('tracking events: de-duplicated, never backwards; the sub-order and the order move with them', () => {
    const ship = db.val<string>(`select id from shipments where sub_order_id = '${subA}'`);
    const ev = (status: string, at: string, id?: string) => db.val<{ added: number; status: string }>(`select mp_record_shipment_event('${ship}', '[{"status": "${status}", "at": "${at}"${id ? `, "id": "${id}"` : ''}, "en": "x"}]'::jsonb)`, 'service');
    assert.deepEqual(ev('picked_up', '2026-11-01T10:00:00Z'), { added: 1, status: 'picked_up' });
    assert.deepEqual(ev('picked_up', '2026-11-01T10:00:00Z'), { added: 0, status: 'picked_up' }, 'the same event twice');
    assert.equal(db.val(`select status from sub_orders where id = '${subA}'`), 'shipped');
    ev('in_transit', '2026-11-01T18:00:00Z');
    assert.equal(db.val(`select status from orders where id = '${order}'`), 'shipped');
    ev('label_created', '2026-11-01T20:00:00Z', 'late-label');
    assert.equal(db.val(`select status from shipments where id = '${ship}'`), 'in_transit', 'never backwards');
    ev('delivered', '2026-11-02T12:00:00Z');
    assert.deepEqual(db.one(`select status, delivered_at is not null as d from sub_orders where id = '${subA}'`), { status: 'delivered', d: true });
    assert.equal(db.val(`select status from orders where id = '${order}'`), 'shipped', 'the other sub-orders are still on their way');
    assert.match(db.error(`update shipment_events set location = 'x' where shipment_id = '${ship}'`, 'service') ?? '', /never edited/);
    assert.equal(db.rows(`select 1 from shipment_events where shipment_id = '${ship}'`, user('customer')).length, 5, 'label, pickup, transit, a late duplicate label scan, delivery');
    assert.equal(db.rows(`select 1 from shipment_events where shipment_id = '${ship}'`, user('sellerB')).length, 0);
  });

  test('cancelling: only with a reason and no live label; stock goes back and our team refunds', () => {
    const second = makeOrder(ids.customer2);
    db.exec(`select mp_order_paid('${second.o}')`, 'service');
    assert.equal(db.val(`select stock from product_variants where id = '${variant}'`), 6);
    // through the after-sale function, which masks the reason first (review M3): the server calls this as the seller
    assert.ok(db.error(`select seller_cancel_sub_order('${second.a}', 'no reason')`, user('sellerA')), 'no direct route around the masking');
    assert.match(db.error(`select mp_cancel_parcel('${ids.sellerA}', '${second.a}', ' ')`, 'service') ?? '', /why/);
    assert.match(db.error(`select mp_cancel_parcel('${ids.sellerB}', '${second.a}', 'Not mine to cancel')`, 'service') ?? '', /Not allowed/);
    db.exec(`select mp_cancel_parcel('${ids.sellerA}', '${second.a}', 'The 12 ml bottles are delayed by our glassmaker.')`, 'service');
    assert.deepEqual(db.one(`select status, needs_refund, cancelled_by from sub_orders where id = '${second.a}'`), { status: 'cancelled', needs_refund: true, cancelled_by: 'seller' });
    assert.equal(db.val(`select stock from product_variants where id = '${variant}'`), 8);
    assert.match(db.error(`select mp_cancel_parcel('${ids.sellerA}', '${subA}', 'too late')`, 'service') ?? '', /delivered/);
  });

  test('labels are private to the seller of the sub-order and our operations team', () => {
    db.exec(`insert into storage.objects (bucket_id, name) values ('labels', '${subA}/label.pdf')`, 'service');
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'labels'`, user('sellerA')).length, 1);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'labels'`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'labels'`, user('operations')).length, 1);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'labels'`, user('marketing')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'labels'`, user('customer')).length, 0);
    assert.match(db.error(`insert into storage.objects (bucket_id, name) values ('labels', '${subA}/fake.pdf')`, user('sellerA')) ?? '', /row-level security/);
  });
});

describe('the customer\'s tracking', () => {
  test('the order with each seller\'s part, its estimate and its tracking', () => {
    const t = db.val<{ order: { number: number }; sub_orders: { number: string; status: string; seller: { slug: string } | null; shipments: { tracking_number: string; events: unknown[] }[] }[] }>(
      `select my_order_tracking('${order}')`, user('customer'));
    assert.equal(t.sub_orders.length, 3);
    assert.equal(t.sub_orders[0].status, 'delivered');
    assert.equal(t.sub_orders[0].shipments[0].tracking_number, 'SBX0000000001');
    assert.equal(t.sub_orders[2].seller, null, 'ours');
    assert.match(db.error(`select my_order_tracking('${order}')`, user('customer2')) ?? '', /Not allowed/);
    assert.match(db.error(`select my_order_tracking('${order}')`, 'anon') ?? '', /permission denied/);
    assert.equal(db.val<{ sub_orders: unknown[] }>(`select my_order_tracking('${order}')`, user('support')).sub_orders.length, 3);
  });
});

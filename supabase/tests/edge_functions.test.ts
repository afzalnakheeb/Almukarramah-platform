// Edge Functions, run for real under Node against the local test database (lib/edge.ts): moyasar-webhook,
// refund-order, after-sale, create-shipment, review-listing and the job that finishes half-done work, with Moyasar
// and the carriers mocked. Timeouts, gateway errors, definite rejections, duplicate and concurrent webhooks, and
// failures between steps are reproduced here (review findings H2, H3, H6, M3, M7, M8, M9, M10, M11, M13, M15, and from
// the re-review N2 (renewals, stray payments), N6 (labels bought at the same moment) and N7 (refunds settled by hand).
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent, type Reply } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');

before(() => {
  db = freshDb('edge');
  fake.db = db.name;
  s = seedShop(db);
  svc(`insert into seller_locations (seller_id, contact_name, phone, country, city, line1, is_default) values ('${s.A}', 'Oud House workshop', '+966500000077', 'SA', 'Madinah', 'Quba Road 7', true)`);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
  env.REFUND_RECONCILE_GRACE_MINUTES = '15';
});

const order = (id: string) => db.one<{ status: string; payment_id: string | null; refunded_minor: number }>(`select status, payment_id, refunded_minor from orders where id = '${id}'`);
const invoices = (id: string) => db.rows<{ number: string; icv: number; doc: string }>(`select number, icv, doc from invoices where order_id = '${id}' order by icv`);
const subStatuses = (o: Order) => db.rows<{ status: string }>(`select status from sub_orders where order_id = '${o.o}' order by seq`).map((x) => x.status);
const variantStock = () => db.val<number>(`select stock from product_variants where id = '${s.variant}'`);
/** No invoice counter value is ever skipped: the counter equals the number of invoices and credit notes. */
const gapFree = () => db.val<boolean>(`select (select last_icv from invoice_counter where id = 1) = (select count(*) from invoices)
                                        and (select count(*) from invoices) = (select coalesce(max(icv), 0) from invoices)`);

/** An order paid through the webhook (Moyasar holds the payment), with its tax invoice. */
async function paidThroughWebhook(): Promise<{ o: Order; payId: string }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
  const r = await invoke('moyasar-webhook', moyasarEvent(pay));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { o, payId: pay.id };
}
const refundDates = (o: Order, key: string, as = ids.finance) =>
  invoke('refund-order', { orderId: o.o, reason: 'Dates arrived crushed', key, lines: [{ orderItemId: o.items.h, quantity: 1 }] }, { as });
const refundRow = (o: Order) => db.one<{ id: string; status: string; error: string | null; credit_note_status: string }>(
  `select id, status, error, credit_note_status from refunds where order_id = '${o.o}' order by created_at desc limit 1`);

// ================================================================ moyasar-webhook (H3, M9, M10)
describe('moyasar-webhook', () => {
  test('a paid payment marks the order paid, hands the parcels on, takes stock once and issues one tax invoice', async () => {
    const stock = variantStock();
    const { o } = await paidThroughWebhook();
    assert.equal(order(o.o).status, 'paid');
    assert.deepEqual(subStatuses(o), ['awaiting_acceptance', 'awaiting_acceptance', 'accepted']);
    assert.equal(variantStock(), stock - 2);
    assert.equal(invoices(o.o).length, 1);
    assert.ok(gapFree());
  });

  test('H3: the tax invoice failed once; Moyasar\'s retry of the same webhook issues it, with no gap in the counter', async () => {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    fake.faults.push({ match: (op) => (op.kind === 'insert' && op.name === 'invoices') || (op.kind === 'rpc' && op.name === 'mp_issue_document'), error: { message: 'connection reset by peer' } });
    const first = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(first.status, 200);
    assert.equal(order(o.o).status, 'paid', 'the payment stands');
    assert.equal(invoices(o.o).length, 0);
    const retry = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(invoices(o.o).length, 1, 'the retry issues the missing invoice');
    assert.ok(gapFree(), 'no invoice counter value was lost to the failure');
  });

  test('H3: handing the parcels on failed after the payment was recorded; the retry finishes it (stock once)', async () => {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    const stock = variantStock();
    fake.faults.push({ match: (op) => op.kind === 'rpc' && (op.name === 'mp_order_paid' || op.name === 'mp_payment_received'), error: { message: 'canceling statement due to statement timeout' } });
    const first = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.ok(first.status >= 500 || first.body?.error, 'Moyasar is told to retry');
    const retry = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(order(o.o).status, 'paid');
    assert.deepEqual(subStatuses(o), ['awaiting_acceptance', 'awaiting_acceptance', 'accepted'], 'the sellers see the order');
    assert.equal(variantStock(), stock - 2, 'stock taken once');
    assert.equal(invoices(o.o).length, 1);
  });

  test('M10: two deliveries of the same webhook at once give one paid order, one invoice and stock taken once', async () => {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    const stock = variantStock();
    const [a, b] = await Promise.all([invoke('moyasar-webhook', moyasarEvent(pay)), invoke('moyasar-webhook', moyasarEvent(pay))]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(invoices(o.o).length, 1, 'one tax invoice');
    assert.equal(variantStock(), stock - 2);
    assert.ok(gapFree());
  });

  test('M7: an order made by an older create-payment (no parcels) still takes its stock once and gets its tax invoice', async () => {
    const before = db.val<number>(`select stock from products where id = '${s.dates}'`);
    const ref = `inv_legacy_${Math.random().toString(36).slice(2, 8)}`;
    const o = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, payment_ref)
      values ('${ids.customer}', 'buyer@test.local', 'SAR', 12000, 3000, 15000, 1957,
              '{"kind": "home", "recipient_name": "Maryam Al Harbi", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}', '${ref}') returning id`, 'service');
    svc(`insert into order_items (order_id, product_id, name_en, name_ar, unit_price_minor, quantity, line_total_minor)
         values ('${o}', '${s.dates}', 'Ajwa dates', 'تمر عجوة', 6000, 2, 12000)`);
    const pay = moyasar.pay({ orderId: o, amount: 15000, invoiceId: ref });
    const r = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(order(o).status, 'paid');
    assert.equal(db.val(`select stock from products where id = '${s.dates}'`), before - 2);
    assert.equal(invoices(o).length, 1);
    // Moyasar's retry changes nothing
    await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(db.val(`select stock from products where id = '${s.dates}'`), before - 2, 'stock comes off once');
    assert.equal(invoices(o).length, 1);
    assert.deepEqual(db.val(`select mp_order_paid('${o}')`, 'service'), { applied: false }, 'a second call takes nothing');
  });

  test('an amount that does not match the order is never marked paid', async () => {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total - 100, invoiceId: o.paymentRef });
    const r = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(r.status, 409);
    assert.equal(order(o.o).status, 'pending_payment');
  });

  test('a wrong secret token is refused', async () => {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    const r = await invoke('moyasar-webhook', { ...moyasarEvent(pay), secret_token: 'guess' });
    assert.equal(r.status, 401);
    assert.equal(order(o.o).status, 'pending_payment');
  });
});

// ================================================================ refund-order (H2)
describe('refund-order', () => {
  test('a refund Moyasar confirms is recorded, with its credit note', async () => {
    const { o, payId } = await paidThroughWebhook();
    const r = await refundDates(o, 'rf-ok-000001');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(refundRow(o).status, 'succeeded');
    assert.equal(refundRow(o).credit_note_status, 'issued');
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000);
    assert.ok(gapFree());
  });

  test('H2: a timeout after Moyasar refunded is never "failed": the payment is read back at once and the refund recorded', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: 'timeout_after' });
    const r = await refundDates(o, 'rf-timeout-00');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((r.body as { reconciled?: boolean }).reconciled, true);
    assert.equal(refundRow(o).status, 'succeeded');
    assert.equal(refundRow(o).credit_note_status, 'issued');
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000, 'Moyasar refunded once');
    assert.equal(order(o.o).refunded_minor, 6000);
  });

  test('H2: when the read-back times out too, the refund stays processing, blocks a second refund, and reconciling completes it', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.next.push({ op: 'get', do: 'ok' }, { op: 'refund', do: 'timeout_after' }, { op: 'get', do: 'timeout' });
    const r = await refundDates(o, 'rf-timeout-01');
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(refundRow(o).status, 'processing', `a timeout is not a rejection: ${JSON.stringify(r.body)}`);
    assert.match(String((r.body as { error_ar?: string }).error_ar ?? ''), /ميسر/, 'the message comes in Arabic too');
    // a second press, or another member of staff, cannot start another refund on the order meanwhile
    const again = await refundDates(o, 'rf-timeout-02');
    assert.equal(again.status, 409);
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000, 'Moyasar refunded once');
    // reconcile: Moyasar shows the refund, so it is recorded with its credit note
    const rec = await invoke('refund-order', { action: 'reconcile', refundId: refundRow(o).id }, { as: ids.finance });
    assert.equal(rec.status, 200, JSON.stringify(rec.body));
    assert.equal(refundRow(o).status, 'succeeded');
    assert.equal(refundRow(o).credit_note_status, 'issued');
    assert.equal(order(o.o).refunded_minor, 6000);
    assert.ok(gapFree());
  });

  test('H2: a 5xx page leaves it processing; reconciling after the grace period marks it failed when Moyasar shows no refund', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: '5xx' });
    await refundDates(o, 'rf-5xx-000001');
    assert.equal(refundRow(o).status, 'processing');
    const early = await invoke('refund-order', { action: 'reconcile', refundId: refundRow(o).id }, { as: ids.finance });
    assert.equal(early.status, 200);
    assert.equal(refundRow(o).status, 'processing', 'too early to say');
    env.REFUND_RECONCILE_GRACE_MINUTES = '0';
    try {
      await invoke('refund-order', { action: 'reconcile', refundId: refundRow(o).id }, { as: ids.finance });
    } finally {
      env.REFUND_RECONCILE_GRACE_MINUTES = '15';
    }
    assert.equal(refundRow(o).status, 'failed');
    assert.equal(moyasar.payments.get(payId)!.refunded, 0);
    // now a new refund can be made
    const r = await refundDates(o, 'rf-5xx-000002');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(refundRow(o).status, 'succeeded');
  });

  test('H2: a definite rejection from Moyasar (400) marks the refund failed at once', async () => {
    const { o } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: { status: 400, json: { type: 'invalid_request_error', message: 'Payment cannot be refunded', errors: {} } } });
    const r = await refundDates(o, 'rf-400-000001');
    assert.notEqual(r.status, 200);
    assert.equal(refundRow(o).status, 'failed');
  });

  test('a network failure leaves it processing too', async () => {
    const { o } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: 'network' });
    await refundDates(o, 'rf-net-000001');
    assert.equal(refundRow(o).status, 'processing');
  });

  test('M9: the credit note uses the VAT rate of the invoice it corrects, not today\'s setting; the counter has no gap', async () => {
    const { o } = await paidThroughWebhook();
    const inv = db.one<{ vat_rate_bp: number }>(`select vat_rate_bp from invoices where order_id = '${o.o}' and doc = 'invoice'`);
    assert.equal(inv.vat_rate_bp, 1500);
    svc(`update store_settings set vat_rate_bp = 500 where id = 1`);   // a later change to the VAT setting
    try {
      const r = await refundDates(o, 'rf-m9-000001');
      assert.equal(r.status, 200, JSON.stringify(r.body));
    } finally {
      svc(`update store_settings set vat_rate_bp = 1500 where id = 1`);
    }
    const cn = db.one<{ vat_rate_bp: number; vat_minor: number; total_incl_vat_minor: number; original_invoice_id: string | null }>(
      `select vat_rate_bp, vat_minor, total_incl_vat_minor, original_invoice_id from invoices where order_id = '${o.o}' and doc = 'credit_note'`);
    assert.equal(cn.vat_rate_bp, 1500);
    assert.equal(cn.vat_minor, Math.round((cn.total_incl_vat_minor * 1500) / 11500), 'VAT worked out at 15%, as invoiced');
    assert.ok(cn.original_invoice_id);
    assert.ok(gapFree());
  });

  test('M9: a credit note in another currency uses the exchange rate of its invoice, not today\'s', async () => {
    const o = unpaidOrder(db, s, ids.customer, { currency: 'AED', fx: 0.98 });
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, currency: 'AED', invoiceId: o.paymentRef });
    const paid = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    const inv = db.one<{ fx_per_sar: number }>(`select fx_per_sar::float8 as fx_per_sar from invoices where order_id = '${o.o}' and doc = 'invoice'`);
    assert.equal(Number(inv.fx_per_sar), 0.98);
    const before = db.val<number | null>(`select per_sar::float8 from fx_rates where currency = 'AED'`);
    svc(`insert into fx_rates (currency, per_sar) values ('AED', 1.5) on conflict (currency) do update set per_sar = 1.5`);   // the rate moved since
    try {
      const r = await refundDates(o, 'rf-m9-aed-0001');
      assert.equal(r.status, 200, JSON.stringify(r.body));
    } finally {
      if (before !== null) svc(`update fx_rates set per_sar = ${before} where currency = 'AED'`);
    }
    const cn = db.one<{ total_incl_vat_minor: number; total_sar_incl_vat_minor: number; fx_per_sar: number }>(
      `select total_incl_vat_minor, total_sar_incl_vat_minor, fx_per_sar::float8 as fx_per_sar from invoices where order_id = '${o.o}' and doc = 'credit_note'`);
    assert.equal(Number(cn.fx_per_sar), 0.98);
    assert.equal(cn.total_sar_incl_vat_minor, Math.round(cn.total_incl_vat_minor / 0.98));
  });

  test('M8: a refusal from the database reaches the app in Arabic and English', async () => {
    const { o } = await paidThroughWebhook();
    const r = await invoke('after-sale', { action: 'return_request', subOrderId: o.h, reason: '', lines: [] }, { as: ids.customer });
    assert.equal(r.status, 400);
    const b = r.body as { error: string; error_ar: string | null };
    assert.equal(b.error, 'Choose a reason');
    assert.equal(b.error_ar, 'اختر سببًا');
  });

  test('only finance, managers, the owner (and support within its limit) refund', async () => {
    const { o } = await paidThroughWebhook();
    assert.equal((await refundDates(o, 'rf-role-000001', ids.marketing)).status, 403);
    assert.equal((await refundDates(o, 'rf-role-000002', ids.customer)).status, 403);
  });
});

// ================================================================ finishing half-done work (H3)
describe('finish-pending', () => {
  test('H3: issues missing invoices and credit notes and hands on paid orders the webhook left half done', async () => {
    // a paid order with no invoice (the webhook's invoice failed and Moyasar gave up)
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    fake.faults.push({ match: (op) => (op.kind === 'insert' && op.name === 'invoices') || (op.kind === 'rpc' && op.name === 'mp_issue_document'), error: { message: 'timeout' } });
    await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(invoices(o.o).length, 0);
    // a refund whose credit note failed
    const { o: o2 } = await paidThroughWebhook();
    fake.faults.push({ match: (op) => (op.kind === 'insert' && op.name === 'invoices') || (op.kind === 'rpc' && op.name === 'mp_issue_document'), error: { message: 'timeout' } });
    const r = await refundDates(o2, 'rf-cn-0000001');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(refundRow(o2).credit_note_status, 'pending');

    const run = await invoke('finish-pending', {}, { headers: { 'x-cron-secret': env.CRON_SECRET } });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(invoices(o.o).length, 1, 'the missing invoice is issued');
    assert.equal(refundRow(o2).credit_note_status, 'issued', 'the credit note is issued');
    assert.ok(gapFree());
    const overview = db.val<{ pending_work: Record<string, number> }>(`select admin_marketplace_overview(30)`, user('owner'));
    assert.equal(overview.pending_work.orders_without_invoice, 0);
    assert.equal(overview.pending_work.credit_notes_pending, 0);
    // nobody else can run it: not a customer, not support, not a wrong secret, not an anonymous call
    assert.equal((await invoke('finish-pending', {}, { as: ids.customer })).status, 403);
    assert.equal((await invoke('finish-pending', {}, { as: ids.support })).status, 403);
    assert.equal((await invoke('finish-pending', {}, { headers: { 'x-cron-secret': 'guess' } })).status, 403);
    assert.equal((await invoke('finish-pending', {})).status, 403);
    // finance can run it from the dashboard
    assert.equal((await invoke('finish-pending', {}, { as: ids.finance })).status, 200);
  });
});

// ================================================================ screen-image (L5)
describe('screen-image', () => {
  test('L5: a customer\'s photo is screened only for an order that can have a review or a return photo', async () => {
    // no order at all: refused before any check runs (the AI costs money)
    const none = await invoke('screen-image', { kind: 'review_photo', path: `${ids.customer2}/incoming/a.jpg` }, { as: ids.customer2 });
    assert.equal(none.status, 403, JSON.stringify(none.body));
    assert.equal((none.body as { code?: string }).code, 'no_eligible_order');
    assert.match(String((none.body as { error_ar?: string }).error_ar), /[\u0600-\u06FF]/);
    // a delivered order: past the check (the file itself is then looked for)
    const { o } = await paidThroughWebhook();
    svc(`update sub_orders set status = 'delivered', delivered_at = now() - interval '2 days' where id = '${o.h}'`);
    const ok = await invoke('screen-image', { kind: 'review_photo', path: `${ids.customer}/incoming/b.jpg` }, { as: ids.customer });
    assert.notEqual(ok.status, 403, JSON.stringify(ok.body));
    // someone else's folder is refused whatever their orders
    const other = await invoke('screen-image', { kind: 'review_photo', path: `${ids.customer2}/incoming/c.jpg` }, { as: ids.customer });
    assert.equal(other.status, 400);
  });
});

// ================================================================ create-shipment (M11)
describe('create-shipment', () => {
  test('M11: a second label is never bought while the parcel has one (a reload makes a new key)', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    const first = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'ship-key-000001' }, { as: ids.sellerA });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'ship-key-000002' }, { as: ids.sellerA });
    assert.equal(second.status, 409, JSON.stringify(second.body));
    const labels = [...(fake.storage.get('labels')?.keys() ?? [])].filter((k) => k.startsWith(`${o.a}/`));
    assert.equal(labels.length, 1, 'one label bought');
    // the same key again returns the same label without buying another
    const same = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'ship-key-000001' }, { as: ids.sellerA });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal(same.body.tracking_number, first.body.tracking_number);
  });

  test('a carrier that times out or fails buys nothing and records nothing; the same key works afterwards', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    svc(`insert into carrier_providers (id, name, kind, regions, mode, active) values ('mockcarrier', 'Mock carrier', 'carrier', 'Test', 'test', true) on conflict (id) do nothing;
         insert into carrier_services (provider_id, code, carrier_name, service_name, from_countries, to_countries, days_min, days_max)
         values ('mockcarrier', 'mock-road', 'Mock', 'Road', '{SA}', '{SA}', 1, 3) on conflict do nothing;
         update sub_orders set service_id = (select id from carrier_services where code = 'mock-road') where id = '${o.a}'`);
    const { mockCarrier } = await import('./lib/edge-carrier.ts');
    mockCarrier.next.push('timeout');
    const t = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'mock-key-000001' }, { as: ids.sellerA });
    assert.equal(t.status, 502, JSON.stringify(t.body));
    mockCarrier.next.push('5xx');
    const f = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'mock-key-000001' }, { as: ids.sellerA });
    assert.equal(f.status, 502);
    assert.equal(db.val(`select count(*)::int from shipments where sub_order_id = '${o.a}'`), 0);
    const ok = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'mock-key-000001' }, { as: ids.sellerA });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(db.val(`select count(*)::int from shipments where sub_order_id = '${o.a}'`), 1);
  });
});

// ================================================================ after-sale (M3, M13)
describe('after-sale', () => {
  test('messages are masked before they are stored; an invitation to pay outside is flagged', async () => {
    const { o } = await paidThroughWebhook();
    const r = await invoke('after-sale', { action: 'message', subOrderId: o.a, body: 'Is the oud from Cambodia? Pay me by bank transfer instead, SA0380000000608010167519' }, { as: ids.customer });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const m = db.one<{ body: string; flagged: boolean }>(`select m.body, t.flagged from messages m join message_threads t on t.id = m.thread_id where m.id = ${r.body.message_id}`);
    assert.doesNotMatch(m.body, /SA038/);
    assert.equal(m.flagged, true);
  });

  test('M3: a seller\'s cancellation reason reaches the customer with contact details masked', async () => {
    const { o } = await paidThroughWebhook();
    const r = await invoke('after-sale', { action: 'cancel_parcel', subOrderId: o.b, reason: 'Out of fabric, call me on 05O1234567 and I can make it' }, { as: ids.sellerB });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const reason = db.val<string>(`select cancel_reason from sub_orders where id = '${o.b}'`);
    assert.doesNotMatch(reason, /123/);
    assert.match(reason, /Out of fabric/);
    // and the direct route around the masking is closed
    assert.ok(db.error(`select seller_cancel_sub_order('${o.a}', 'call 0501234567')`, user('sellerA')));
  });

  test('M13: a return approved by our team records who approved it (the audit log names the person)', async () => {
    const { o } = await paidThroughWebhook();
    svc(`update sub_orders set status = 'delivered', delivered_at = now() - interval '1 day' where id = '${o.h}'`);
    const req = await invoke('after-sale', { action: 'return_request', subOrderId: o.h, reason: 'damaged', details: 'The box was crushed and wet', lines: [{ orderItemId: o.items.h, quantity: 1 }] }, { as: ids.customer });
    assert.equal(req.status, 200, JSON.stringify(req.body));
    const ok = await invoke('after-sale', { action: 'return_action', returnId: req.body.id, do: 'approve', note: 'Approved' }, { as: ids.support });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(db.val(`select approved_by from return_requests where id = '${req.body.id}'`), ids.support);
    const actors = db.rows<{ actor: string | null }>(`select actor from audit_log where table_name = 'return_requests' and row_id = '${req.body.id}' and action = 'UPDATE'`);
    assert.ok(actors.length && actors.every((a) => a.actor === ids.support), JSON.stringify(actors));
  });
});

// ================================================================ review-listing (H6, M15)
describe('review-listing', () => {
  const asset = (seller: string, status: string) => {
    const id = db.val<string>(`select gen_random_uuid()`);
    const path = `${seller}/media/${id}.jpg`;
    db.exec(`insert into media_assets (id, seller_id, kind, bucket, path, mime, bytes, sha256, status)
      values ('${id}', '${seller}', 'listing_photo', 'seller-uploads', '${path}', 'image/jpeg', 1000, md5(random()::text) || md5(random()::text), '${status}')`, 'service');
    if (!fake.storage.has('seller-uploads')) fake.storage.set('seller-uploads', new Map());
    fake.storage.get('seller-uploads')!.set(path, { bytes: new Uint8Array([0xff, 0xd8, 0xff]), type: 'image/jpeg' });
    return path;
  };
  const queued = (seller: string, slug: string, fields: Record<string, unknown>) => {
    const cols = Object.keys(fields);
    const p = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, ${cols.join(', ')})
      values ('${slug}', 'Listing ${slug}', 'منتج', 50000, '${seller}', '${seller === s.B ? s.cat('thobes') : s.cat('oud-oils')}',
              ${cols.map((c) => (typeof fields[c] === 'string' ? `'${fields[c]}'` : `'${JSON.stringify(fields[c]).replace(/'/g, "''")}'`)).join(', ')}) returning id`, user(seller === s.B ? 'sellerB' : 'sellerA'));
    svc(`update products set listing_status = 'pending_review' where id = '${p}'`);
    return p;
  };

  test('H6: a design-option picture that has not passed the photo check stops the approval', async () => {
    const main = asset(s.B, 'passed');
    const option = asset(s.B, 'pending');
    const p = queued(s.B, 'mtm-pending-opt', { made_to_measure: true, stock: 0, images: `{${main}}`,
      tailoring: { production_days: 10, options: [{ key: 'collar', label_en: 'Collar', label_ar: 'الياقة', choices: [{ id: 'classic', label_en: 'Classic', label_ar: 'كلاسيكي', image: option }] }] } });
    const r = await invoke('review-listing', { productId: p, action: 'approve' }, { as: ids.manager });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(db.val(`select listing_status from products where id = '${p}'`), 'pending_review');
    assert.ok(![...(fake.storage.get('catalogue')?.keys() ?? [])].some((k) => k.endsWith(option.split('/').pop()!)), 'the unscreened picture was not published');
  });

  test('M15: an edit made while the photos are being published is never approved unseen', async () => {
    const main = asset(s.A, 'passed');
    const p = queued(s.A, 'race-listing', { images: `{${main}}`, description_en: 'Pure Cambodi oud, 3 ml.' });
    let edited = false;
    fake.onUpload = async (bucket) => {
      if (bucket !== 'catalogue' || edited) return;
      edited = true;
      db.exec(`update products set description_en = 'Pure oud. WhatsApp 0501234567 for wholesale' where id = '${p}'`, user('sellerA'));
    };
    const r = await invoke('review-listing', { productId: p, action: 'approve' }, { as: ids.manager });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    const row = db.one<{ listing_status: string; description_en: string }>(`select listing_status, description_en from products where id = '${p}'`);
    assert.notEqual(row.listing_status, 'approved', 'the edited text did not go live');
  });

  test('approval publishes the photos and the screened option pictures', async () => {
    const main = asset(s.B, 'passed');
    const option = asset(s.B, 'passed');
    const p = queued(s.B, 'mtm-ok', { made_to_measure: true, stock: 0, images: `{${main}}`,
      tailoring: { production_days: 10, options: [{ key: 'collar', label_en: 'Collar', label_ar: 'الياقة', choices: [{ id: 'classic', label_en: 'Classic', label_ar: 'كلاسيكي', image: option }] }] } });
    const r = await invoke('review-listing', { productId: p, action: 'approve' }, { as: ids.manager });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = db.one<{ listing_status: string; images: string[]; tailoring: { options: { choices: { image: string }[] }[] } }>(`select listing_status, images, tailoring from products where id = '${p}'`);
    assert.equal(row.listing_status, 'approved');
    assert.match(row.images[0], /^https:\/\/project\.supabase\.test\/storage\/v1\/object\/public\/catalogue\//);
    assert.match(row.tailoring.options[0].choices[0].image, /^https:\/\/project\.supabase\.test\/storage\/v1\/object\/public\/catalogue\//);
  });
});

// ================================================================ the re-review (REVIEW-2)
const cron = () => ({ headers: { 'x-cron-secret': env.CRON_SECRET } });
function useMockCarrier(sub: string) {
  svc(`insert into carrier_providers (id, name, kind, regions, mode, active) values ('mockcarrier', 'Mock carrier', 'carrier', 'Test', 'test', true) on conflict (id) do nothing;
       insert into carrier_services (provider_id, code, carrier_name, service_name, from_countries, to_countries, days_min, days_max)
       values ('mockcarrier', 'mock-road', 'Mock', 'Road', '{SA}', '{SA}', 1, 3) on conflict do nothing;
       update sub_orders set service_id = (select id from carrier_services where code = 'mock-road') where id = '${sub}'`);
}

describe('charge-subscriptions (N2)', () => {
  function dueSubscription(): string {
    const plan = db.val<string>(`insert into plans (slug, kind, name_en, name_ar, price_sar) values ('box-' || substr(md5(random()::text), 1, 8), 'box', 'Oud box', 'صندوق العود', 9900) returning id`, 'service');
    return db.val<string>(`insert into subscriptions (user_id, plan_id, source, status, current_period_end, moyasar_token, ship_to)
      values ('${ids.customer}', '${plan}', 'moyasar', 'active', now() - interval '1 hour', 'tok_saved_card',
              '{"kind": "home", "recipient_name": "Maryam", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}') returning id`, 'service');
  }
  const renewals = (sub: string) => db.rows<{ id: string; status: string }>(`select id, status::text as status from orders where subscription_id = '${sub}' order by created_at`);

  test('N2: an unknown answer leaves the renewal waiting (never cancelled); the next run asks again with the same key and the card is charged once', async () => {
    const sub = dueSubscription();
    const charged = moyasar.charges;
    moyasar.next.push({ op: 'charge', do: 'timeout_after' });
    const r1 = await invoke('charge-subscriptions', {}, cron());
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual(renewals(sub).map((x) => x.status), ['pending_payment'], 'never cancelled on a guess');
    assert.equal(db.val(`select status from subscriptions where id = '${sub}'`), 'active', 'not past due either');
    assert.equal(moyasar.charges, charged + 1, 'Moyasar did charge the card');
    const r2 = await invoke('charge-subscriptions', {}, cron());
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(moyasar.charges, charged + 1, 'asking again with the same key does not charge again');
    const rows = renewals(sub);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'paid');
    assert.ok(db.val<boolean>(`select current_period_end > now() from subscriptions where id = '${sub}'`), 'renewed');
    assert.equal(invoices(rows[0].id).length, 1);
  });

  test('a declined card cancels that renewal and the subscription waits for the next try, as before', async () => {
    const sub = dueSubscription();
    moyasar.declineNext = true;
    await invoke('charge-subscriptions', {}, cron());
    assert.deepEqual(renewals(sub).map((x) => x.status), ['cancelled']);
    assert.equal(db.val(`select status from subscriptions where id = '${sub}'`), 'past_due');
  });
});

describe('stray payments (N2)', () => {
  async function strayPayment(): Promise<{ o: Order; payId: string; issue: string }> {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    svc(`update orders set status = 'cancelled' where id = '${o.o}'`);
    const r = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.stray, true, 'answered so Moyasar stops retrying, and recorded for our team');
    return { o, payId: pay.id, issue: db.val<string>(`select id from payment_issues where payment_id = '${pay.id}'`) };
  }

  test('N2: finance refunds a payment for a cancelled order in full through Moyasar', async () => {
    const { o, payId, issue } = await strayPayment();
    assert.equal((await invoke('refund-order', { action: 'payment_issue', issueId: issue, do: 'refund', reason: 'The order was cancelled' }, { as: ids.support })).status, 403);
    const r = await invoke('refund-order', { action: 'payment_issue', issueId: issue, do: 'refund', reason: 'The order was cancelled' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(moyasar.payments.get(payId)!.refunded, o.total);
    assert.equal(db.val(`select status from payment_issues where id = '${issue}'`), 'refunded');
    assert.equal((await invoke('refund-order', { action: 'payment_issue', issueId: issue, do: 'refund', reason: 'Again' }, { as: ids.finance })).status, 409, 'once');
  });

  test('N2: or revives the order with it: paid, parcels handed on, invoiced', async () => {
    const { o, payId, issue } = await strayPayment();
    const r = await invoke('refund-order', { action: 'payment_issue', issueId: issue, do: 'attach', reason: 'The customer still wants the order' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([order(o.o).status, order(o.o).payment_id], ['paid', payId]);
    assert.deepEqual(subStatuses(o), ['awaiting_acceptance', 'awaiting_acceptance', 'accepted']);
    assert.equal(invoices(o.o).length, 1);
    assert.equal(db.val(`select status from payment_issues where id = '${issue}'`), 'attached');
  });
});

describe('create-shipment (N6)', () => {
  test('N6: two people pressing at the same moment buy one label; the other is told one is being bought', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    useMockCarrier(o.a);
    const { mockCarrier } = await import('./lib/edge-carrier.ts');
    const creates = () => mockCarrier.calls.filter((c) => c.op === 'create').length;
    const before = creates();
    mockCarrier.delayMs = 400;
    let res: Reply[];
    try {
      res = await Promise.all([
        invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'race-key-00001' }, { as: ids.sellerA }),
        invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'race-key-00002' }, { as: ids.operations }),
      ]);
    } finally {
      mockCarrier.delayMs = 0;
    }
    assert.deepEqual(res.map((x) => x.status).sort(), [200, 409], JSON.stringify(res.map((x) => x.body)));
    assert.equal(creates() - before, 1, 'one label bought');
    assert.equal(db.val(`select count(*)::int from shipments where sub_order_id = '${o.a}'`), 1);
  });

  test('N6: a label bought but not recorded is cancelled at the carrier, and a new try works', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    useMockCarrier(o.a);
    const { mockCarrier } = await import('./lib/edge-carrier.ts');
    const cancels = () => mockCarrier.calls.filter((c) => c.op === 'cancel').length;
    const before = cancels();
    fake.faults.push({ match: (op) => op.kind === 'rpc' && op.name === 'mp_record_shipment', error: { message: 'connection lost' } });
    const r = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'orphan-key-0001' }, { as: ids.sellerA });
    assert.notEqual(r.status, 200);
    assert.equal(cancels() - before, 1, 'the label nobody recorded is cancelled');
    assert.equal(db.val(`select count(*)::int from shipments where sub_order_id = '${o.a}'`), 0);
    const ok = await invoke('create-shipment', { subOrderId: o.a, idempotencyKey: 'orphan-key-0002' }, { as: ids.sellerA });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });
});

describe('refund-order (N7)', () => {
  test('N7: finance settles a refund stuck waiting for Moyasar, with a reason; the order is free again', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: '5xx' });
    await refundDates(o, 'rf-n7-0000001');
    const stuck = refundRow(o);
    assert.equal(stuck.status, 'processing');
    assert.equal((await invoke('refund-order', { action: 'resolve', refundId: stuck.id, outcome: 'failed', reason: 'Checked' }, { as: ids.support })).status, 403);
    assert.equal((await invoke('refund-order', { action: 'resolve', refundId: stuck.id, outcome: 'failed', reason: 'x' }, { as: ids.finance })).status, 400, 'a reason is needed');
    const r = await invoke('refund-order', { action: 'resolve', refundId: stuck.id, outcome: 'failed', reason: 'Checked the Moyasar dashboard: no refund was made' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(refundRow(o).status, 'failed');
    assert.equal((await refundDates(o, 'rf-n7-0000002')).status, 200, 'a new refund can be made');
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000);
  });

  test('N7: a refund Moyasar completed late, after it was marked failed, blocks a new one until it is settled', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.next.push({ op: 'refund', do: '5xx' });
    await refundDates(o, 'rf-n7-0000003');
    env.REFUND_RECONCILE_GRACE_MINUTES = '0';
    try {
      await invoke('refund-order', { action: 'reconcile', refundId: refundRow(o).id }, { as: ids.finance });
    } finally {
      env.REFUND_RECONCILE_GRACE_MINUTES = '15';
    }
    const failed = refundRow(o);
    assert.equal(failed.status, 'failed');
    moyasar.payments.get(payId)!.refunded = 6000;   // ...then Moyasar completes it after all
    const again = await refundDates(o, 'rf-n7-0000004');
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.match(String(again.body.error), /Moyasar shows/);
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000, 'never refunded twice');
    const r = await invoke('refund-order', { action: 'resolve', refundId: failed.id, outcome: 'succeeded', reason: 'Moyasar completed it late (dashboard checked)' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // the failed record never changes; the late completion is recorded as its own refund, with its credit note
    assert.equal(db.val(`select status from refunds where id = '${failed.id}'`), 'failed');
    assert.deepEqual([refundRow(o).status, refundRow(o).credit_note_status], ['succeeded', 'issued']);
    assert.equal(order(o.o).refunded_minor, 6000);
    assert.notEqual((await refundDates(o, 'rf-n7-0000005')).status, 200, 'and that unit is not refunded again');
  });
});


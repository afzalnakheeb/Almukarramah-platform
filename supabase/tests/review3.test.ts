// The third independent review (REVIEW-3), each finding reproduced as it was found, before the fix:
// R3-1 the contact detector against everyday text (sizes, measurements, prices, dates, tracking and order numbers), in
//      the server (contact.ts, cleanText, the listing checks) and in the database (private.contact_hint), with every
//      disguise from the earlier reviews still caught;
// R3-2 refunds Moyasar holds that we have no record of: made in its dashboard, or completed late (also after the same
//      unit was refunded again), recorded against Moyasar's own figures and listed for finance;
// R3-3 "attach" reads the payment back from Moyasar first; R3-4 a payment whose order no longer exists is kept;
// R3-5 a label whose purchase was not confirmed keeps its claim, and the carrier is asked again with the same key;
// R3-6 a renewal completed by the webhook follows the paid period, keeps the saved card and the customer's cancellation;
// R3-7 the direction marks people type in mixed Arabic and English stay in stored messages.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts, splitNumber } from '../functions/_shared/contact.ts';
import { textChecks } from '../functions/_shared/screening.ts';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import { CONTACT_PROBES, EVERYDAY, EXTRA_PROBES, LISTING_TEXTS, ORDINARY, SOLICIT_PROBES, SPLIT_PAIRS } from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);

before(() => {
  db = freshDb('review3');
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

// ================================================================ R3-1: everyday text is left alone
describe('R3-1: everyday text is never masked, flagged or refused; every disguise is still caught', () => {
  test('the re-review\'s 42 everyday texts and the Arabic ones reach the other person untouched and unflagged (server)', () => {
    const changed = EVERYDAY.map((t) => ({ t, c: cleanText(t, 2000) })).filter(({ t, c }) => c.text !== t || c.flags.length > 0)
      .map(({ t, c }) => `${t} => ${c.text} [${c.flags.join(',')}]`);
    assert.deepEqual(changed, []);
  });

  test('a shop page may say them (the database check)', () => {
    const refused = EVERYDAY.filter((t) => hint(t) !== null).map((t) => `${t} => ${hint(t)}`);
    assert.deepEqual(refused, []);
  });

  test('listings with size charts and measurements are not blocked as contact details', () => {
    const blocked = LISTING_TEXTS.flatMap((d) => textChecks({ name_en: 'Thobe', name_ar: 'ثوب', description_en: d, description_ar: 'ثوب' }, [])
      .map((h) => `${d} => ${h.kind}:${h.match}`));
    assert.deepEqual(blocked, []);
    assert.deepEqual(LISTING_TEXTS.filter((d) => hint(d) !== null), []);
  });

  test('an order number, a date or a price sent across two messages is not taken for a split phone number', () => {
    for (const [prev, text, phone] of SPLIT_PAIRS) {
      const c = cleanText(text, 2000, { previous: prev });
      if (phone) assert.ok(c.flags.includes('contact_split'), `${prev} | ${text}`);
      else assert.deepEqual([c.text, c.flags], [text, []], `${prev} | ${text}`);
      assert.equal(splitNumber(prev, text) !== null, phone, `${prev} | ${text}`);
    }
  });

  test('every disguise of the earlier reviews, and the new ones, is still masked and flagged (server)', () => {
    for (const [input, leak] of [...CONTACT_PROBES, ...EXTRA_PROBES]) {
      const c = cleanText(input, 2000);
      assert.ok(c.flags.some((f) => f.startsWith('contact_')), `flagged: ${input} => ${JSON.stringify(c)}`);
      assert.doesNotMatch(c.text, leak, `masked: ${input} => ${c.text}`);
    }
    for (const input of SOLICIT_PROBES) assert.ok(cleanText(input, 2000).flags.includes('solicit'), input);
    for (const t of ORDINARY) assert.deepEqual(cleanText(t, 2000).flags, [], t);
  });

  test('...and refused by the database check', () => {
    const missed = [...CONTACT_PROBES.map(([p]) => p), ...EXTRA_PROBES.map(([p]) => p), ...SOLICIT_PROBES].filter((p) => hint(p) === null);
    assert.deepEqual(missed, []);
  });

  test('the server and the database agree on every text', () => {
    const texts = [...EVERYDAY, ...LISTING_TEXTS, ...ORDINARY, ...CONTACT_PROBES.map(([p]) => p), ...EXTRA_PROBES.map(([p]) => p), ...SOLICIT_PROBES];
    const differ = texts.filter((t) => (detectContacts(t).length > 0) !== (hint(t) !== null))
      .map((t) => `${t}: server ${detectContacts(t).map((h) => h.kind).join(',') || '-'}, database ${hint(t) ?? '-'}`);
    assert.deepEqual(differ, []);
  });

  test('a date range is not a bank account, and so never an invitation to pay outside', () => {
    for (const t of ['From 31/10/2026 - 05/11/2026 we are closed', '٢٠٢٦/١٠/٣١ - ٢٠٢٦/١١/٠٥']) {
      assert.deepEqual(cleanText(t, 2000).flags, [], t);
    }
    // a real account number still is
    assert.deepEqual(cleanText('my account 0380000000608010167519', 2000).flags, ['contact_bank', 'solicit']);
  });
});

// ================================================================ R3-7: direction marks
describe('R3-7: the direction marks people type stay in stored messages', () => {
  test('left-to-right and right-to-left marks and isolates are kept; overrides and zero-width characters are not', () => {
    for (const t of ['طلبت ‏Royal Oud‏ حجم ١٢ مل', 'اسم العطر ⁧Royal Oud⁩ رائع', 'Order ‎AM-104912‎ وصل ؜ شكرا']) {
      assert.equal(cleanText(t, 2000).text, t);
    }
    // a right-to-left override would show 7654321050 as 0501234567: it is taken out, and the number is masked anyway
    const o = cleanText('call ‮7654321050‬', 2000);
    assert.doesNotMatch(o.text, /[‪-‮]/);
    assert.equal(cleanText('a​b﻿c', 2000).text, 'abc');
  });
});

// ================================================================ the functions (Moyasar and the carrier mocked)
const order = (id: string) => db.one<{ status: string; payment_id: string | null; refunded_minor: number }>(`select status, payment_id, refunded_minor from orders where id = '${id}'`);
const invoices = (id: string) => db.rows<{ number: string; doc: string }>(`select number, doc from invoices where order_id = '${id}' order by icv`);
async function paidThroughWebhook(): Promise<{ o: Order; payId: string }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
  const r = await invoke('moyasar-webhook', moyasarEvent(pay));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { o, payId: pay.id };
}
const refundDates = (o: Order, key: string, as = ids.finance) =>
  invoke('refund-order', { orderId: o.o, reason: 'Dates arrived crushed', key, lines: [{ orderItemId: o.items.h, quantity: 1 }] }, { as });
const refunds = (o: Order) => db.rows<{ id: string; status: string; amount_minor: number; goodwill_minor: number; items_minor: number; credit_note_status: string; provider_ref: string | null }>(
  `select id, status, amount_minor, goodwill_minor, items_minor, credit_note_status, provider_ref from refunds where order_id = '${o.o}' order by created_at`);
const datesRefunded = (o: Order) => db.val<number>(`select refunded_quantity from order_items where id = '${o.items.h}'`);
const queue = () => db.val<{ unrecorded: { order_id: string; unrecorded_minor: number; failed: { id: string; amount_minor: number }[] }[] }>(`select admin_refund_queue()`, user('finance'));
async function failedThenCompletedLate(o: Order, payId: string, key: string) {
  moyasar.next.push({ op: 'refund', do: '5xx' });
  await refundDates(o, key);
  env.REFUND_RECONCILE_GRACE_MINUTES = '0';
  try {
    const id = refunds(o).at(-1)!.id;
    const r = await invoke('refund-order', { action: 'reconcile', refundId: id }, { as: ids.finance });
    assert.equal(r.body.state, 'failed', JSON.stringify(r.body));
    return id;
  } finally {
    env.REFUND_RECONCILE_GRACE_MINUTES = '15';
  }
}

describe('R3-2: a refund Moyasar holds that we have no record of is recorded, never a dead end', () => {
  test('a goodwill refund made in the Moyasar dashboard: listed, recorded against Moyasar\'s figures with its credit note, and the order is free again', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.payments.get(payId)!.refunded = 2000;   // 20 SAR goodwill, refunded in Moyasar's dashboard
    const blocked = await refundDates(o, 'r3-dash-00001');
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal(blocked.body.code, 'moyasar_unrecorded');
    // finance sees it on the refunds page, with what Moyasar holds that we have not recorded
    const listed = queue().unrecorded.find((u) => u.order_id === o.o);
    assert.equal(listed?.unrecorded_minor, 2000, JSON.stringify(queue().unrecorded));
    const record = (p: Record<string, unknown>, as = ids.finance) =>
      invoke('refund-order', { action: 'record_moyasar', orderId: o.o, reference: 'Moyasar dashboard, 31 Oct, Afzal', reason: 'Goodwill for the late delivery', ...p }, { as });
    assert.equal((await record({ key: 'r3-dash-rec-01', amount: 2000, goodwill: true }, ids.support)).status, 403);
    const tooMuch = await record({ key: 'r3-dash-rec-02', amount: 3000, goodwill: true });
    assert.equal(tooMuch.status, 409, 'never more than Moyasar shows');
    const r = await record({ key: 'r3-dash-rec-03', amount: 2000, goodwill: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const rec = refunds(o).find((x) => x.status === 'succeeded')!;
    assert.deepEqual([rec.amount_minor, rec.goodwill_minor, rec.items_minor, rec.credit_note_status], [2000, 2000, 0, 'issued']);
    assert.match(String(rec.provider_ref), /moyasar/i);
    assert.equal(order(o.o).refunded_minor, 2000);
    assert.equal(datesRefunded(o), 0, 'no item came back');
    assert.equal(invoices(o.o).filter((i) => i.doc === 'credit_note').length, 1);
    assert.equal(moyasar.payments.get(payId)!.refunded, 2000, 'nothing refunded again');
    // the same press again records nothing more
    assert.equal((await record({ key: 'r3-dash-rec-03', amount: 2000, goodwill: true })).status, 200);
    assert.equal(refunds(o).filter((x) => x.status === 'succeeded').length, 1);
    assert.equal(queue().unrecorded.find((u) => u.order_id === o.o), undefined, 'off the list');
    // and the customer's real refund goes through
    const dates = await refundDates(o, 'r3-dash-00002');
    assert.equal(dates.status, 200, JSON.stringify(dates.body));
    assert.equal(moyasar.payments.get(payId)!.refunded, 8000);
  });

  test('a dashboard refund of items is recorded against those items (their amount must match Moyasar\'s)', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.payments.get(payId)!.refunded = 6000;   // the dates, refunded in the dashboard
    const record = (key: string, amount: number) => invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, reference: 'Moyasar dashboard 31 Oct',
      reason: 'The dates were refunded in the dashboard', lines: [{ orderItemId: o.items.h, quantity: 1 }] }, { as: ids.finance });
    assert.equal((await record('r3-lines-rec-01', 5000)).status, 409, 'the dates come to 60.00, not 50.00');
    const r = await record('r3-lines-rec-02', 6000);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(datesRefunded(o), 1);
    assert.equal(order(o.o).refunded_minor, 6000);
    assert.equal(refunds(o).at(-1)!.credit_note_status, 'issued');
    assert.notEqual((await refundDates(o, 'r3-lines-00003')).status, 200, 'that unit is not refunded again');
    assert.equal(moyasar.payments.get(payId)!.refunded, 6000);
  });

  test('a failed refund that Moyasar completed later is listed with it, and settled', async () => {
    const { o, payId } = await paidThroughWebhook();
    const failed = await failedThenCompletedLate(o, payId, 'r3-late-00001');
    moyasar.payments.get(payId)!.refunded = 6000;   // Moyasar completes it after all
    assert.equal((await refundDates(o, 'r3-late-00002')).body.code, 'moyasar_unrecorded');
    const listed = queue().unrecorded.find((u) => u.order_id === o.o);
    assert.deepEqual(listed?.failed.map((f) => [f.id, f.amount_minor]), [[failed, 6000]], JSON.stringify(listed));
    const r = await invoke('refund-order', { action: 'resolve', refundId: failed, outcome: 'succeeded', reason: 'Moyasar shows it refunded on the 31st' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(datesRefunded(o), 1);
    assert.equal(queue().unrecorded.find((u) => u.order_id === o.o), undefined);
  });

  test('...also when the same unit was refunded again meanwhile: recorded as goodwill, never more than bought, never twice', async () => {
    const { o, payId } = await paidThroughWebhook();
    const first = await failedThenCompletedLate(o, payId, 'r3-again-00001');
    const second = await refundDates(o, 'r3-again-00002');   // the customer is refunded again, and that one goes through
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(datesRefunded(o), 1);
    moyasar.payments.get(payId)!.refunded = 12000;   // then Moyasar completes the first one late: the customer had 120 back
    const r = await invoke('refund-order', { action: 'resolve', refundId: first, outcome: 'succeeded', reason: 'Moyasar shows both refunds of the dates' }, { as: ids.finance });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(datesRefunded(o), 1, 'one unit bought, one unit refunded');
    assert.equal(order(o.o).refunded_minor, 12000, 'what Moyasar paid back');
    const late = refunds(o).filter((x) => x.status === 'succeeded').at(-1)!;
    assert.deepEqual([late.amount_minor, late.goodwill_minor, late.items_minor], [6000, 6000, 0]);
    const again = await invoke('refund-order', { action: 'resolve', refundId: first, outcome: 'succeeded', reason: 'Moyasar shows both refunds of the dates' }, { as: ids.finance });
    assert.equal(again.status, 409, 'never recorded twice');
    assert.equal(order(o.o).refunded_minor, 12000);
  });
});

describe('R3-3, R3-4: payments to resolve', () => {
  async function strayPayment(): Promise<{ o: Order; payId: string; issue: string }> {
    const o = unpaidOrder(db, s);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    svc(`update orders set status = 'cancelled' where id = '${o.o}'`);
    assert.equal((await invoke('moyasar-webhook', moyasarEvent(pay))).status, 200);
    return { o, payId: pay.id, issue: db.val<string>(`select id from payment_issues where payment_id = '${pay.id}'`) };
  }
  const settle = (issue: string, act: string, reason = 'Checked with the customer') =>
    invoke('refund-order', { action: 'payment_issue', issueId: issue, do: act, reason }, { as: ids.finance });

  test('R3-3: attaching reads the payment from Moyasar first: money refunded in the dashboard revives nothing', async () => {
    const { o, payId, issue } = await strayPayment();
    moyasar.payments.get(payId)!.refunded = o.total;   // refunded in Moyasar's dashboard
    moyasar.payments.get(payId)!.status = 'refunded';
    const r = await settle(issue, 'attach');
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(order(o.o).status, 'cancelled', 'not revived');
    assert.equal(db.val(`select status from payment_issues where id = '${issue}'`), 'open');
    // and pressing "Refund" records what Moyasar already did, without refunding again
    const calls = moyasar.calls.filter((c) => c.op === 'refund').length;
    const refund = await settle(issue, 'refund');
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(db.val(`select status from payment_issues where id = '${issue}'`), 'refunded');
    assert.equal(moyasar.calls.filter((c) => c.op === 'refund').length, calls, 'no second refund asked');
  });

  test('R3-3: Moyasar out of reach: nothing is attached', async () => {
    const { o, issue } = await strayPayment();
    moyasar.next.push({ op: 'get', do: 'timeout' });
    assert.equal((await settle(issue, 'attach')).status, 503);
    assert.equal(order(o.o).status, 'cancelled');
  });

  test('R3-4: a payment whose order no longer exists is kept for our team, and can be refunded', async () => {
    const gone = db.val<string>(`select gen_random_uuid()`);
    const pay = moyasar.pay({ orderId: gone, amount: 25000, invoiceId: 'inv_gone_000001' });
    const r = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const i = db.one<{ id: string; kind: string; order_id: string | null; amount_minor: number }>(`select id, kind, order_id, amount_minor from payment_issues where payment_id = '${pay.id}'`);
    assert.deepEqual([i.kind, i.order_id, i.amount_minor], ['order_not_found', null, 25000]);
    assert.equal((await invoke('moyasar-webhook', moyasarEvent(pay))).status, 200, 'Moyasar\'s retries add nothing');
    assert.equal(db.val(`select count(*)::int from payment_issues where payment_id = '${pay.id}'`), 1);
    const refund = await settle(i.id, 'refund', 'The order was removed before payment');
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(moyasar.payments.get(pay.id)!.refunded, 25000);
  });
});

describe('R3-5: a label whose purchase was not confirmed', () => {
  function useMockCarrier(sub: string) {
    svc(`insert into carrier_providers (id, name, kind, regions, mode, active) values ('mockcarrier', 'Mock carrier', 'carrier', 'Test', 'test', true) on conflict (id) do nothing;
         insert into carrier_services (provider_id, code, carrier_name, service_name, from_countries, to_countries, days_min, days_max)
         values ('mockcarrier', 'mock-road', 'Mock', 'Road', '{SA}', '{SA}', 1, 3) on conflict do nothing;
         update sub_orders set service_id = (select id from carrier_services where code = 'mock-road') where id = '${sub}'`);
  }
  const ship = (sub: string, key: string, as = ids.sellerA) => invoke('create-shipment', { subOrderId: sub, idempotencyKey: key }, { as });

  test('a timeout after the carrier sold the label keeps the claim: the next press, by anyone, asks with the same key and one label is bought', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    useMockCarrier(o.a);
    const { mockCarrier } = await import('./lib/edge-carrier.ts');
    const bought = mockCarrier.bought.size;
    mockCarrier.next.push('timeout_after');
    const first = await ship(o.a, 'r3-ship-key-0001');
    assert.equal(first.status, 502, JSON.stringify(first.body));
    assert.equal(first.body.code, 'carrier_unconfirmed');
    assert.equal(mockCarrier.bought.size, bought + 1, 'the carrier did sell it');
    // someone else presses (a new key): the carrier is asked with the first key and answers with that label
    const second = await ship(o.a, 'r3-ship-key-0002', ids.operations);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(mockCarrier.bought.size, bought + 1, 'no second label');
    assert.equal(db.val(`select idempotency_key from shipments where sub_order_id = '${o.a}'`), 'r3-ship-key-0001');
  });

  test('a definite refusal from the carrier frees the parcel for the next try', async () => {
    const { o } = await paidThroughWebhook();
    db.val(`select seller_accept_sub_order('${o.a}')`, user('sellerA'));
    useMockCarrier(o.a);
    const { mockCarrier } = await import('./lib/edge-carrier.ts');
    mockCarrier.next.push('refuse');
    const first = await ship(o.a, 'r3-ship-key-0003');
    assert.equal(first.body.code, 'carrier_refused', JSON.stringify(first.body));
    const second = await ship(o.a, 'r3-ship-key-0004');
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(db.val(`select idempotency_key from shipments where sub_order_id = '${o.a}'`), 'r3-ship-key-0004');
  });
});

describe('R3-6: a renewal completed by Moyasar\'s webhook', () => {
  const cron = () => ({ headers: { 'x-cron-secret': env.CRON_SECRET } });
  function dueSubscription(): { sub: string; end: string } {
    const plan = db.val<string>(`insert into plans (slug, kind, name_en, name_ar, price_sar) values ('box-' || substr(md5(random()::text), 1, 8), 'box', 'Oud box', 'صندوق العود', 9900) returning id`, 'service');
    const sub = db.val<string>(`insert into subscriptions (user_id, plan_id, source, status, current_period_end, moyasar_token, ship_to)
      values ('${ids.customer}', '${plan}', 'moyasar', 'active', date_trunc('second', now()) - interval '1 hour', 'tok_saved_card',
              '{"kind": "home", "recipient_name": "Maryam", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}') returning id`, 'service');
    return { sub, end: db.val<string>(`select current_period_end::text from subscriptions where id = '${sub}'`) };
  }

  test('it follows the paid period, keeps the saved card, and a cancellation made meanwhile still stops the next charge', async () => {
    const { sub, end } = dueSubscription();
    moyasar.next.push({ op: 'charge', do: 'timeout_after' });
    await invoke('charge-subscriptions', {}, cron());
    const renewal = db.one<{ id: string; charge_given_id: string }>(`select id, charge_given_id from orders where subscription_id = '${sub}'`);
    // the customer cancels while the renewal waits; then Moyasar's webhook completes it (its token is not repeated)
    svc(`update subscriptions set cancel_at_period_end = true where id = '${sub}'`);
    const pay = moyasar.payments.get(renewal.charge_given_id)!;
    pay.source = { type: 'token', token: null };
    const r = await invoke('moyasar-webhook', moyasarEvent(pay));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(order(renewal.id).status, 'paid');
    const row = db.one<{ status: string; cancel_at_period_end: boolean; moyasar_token: string | null; follows: boolean }>(
      `select status, cancel_at_period_end, moyasar_token, current_period_end = '${end}'::timestamptz + interval '1 month' as follows from subscriptions where id = '${sub}'`);
    assert.deepEqual(row, { status: 'active', cancel_at_period_end: true, moyasar_token: 'tok_saved_card', follows: true });
    // the paid month runs out: the subscription ends, and the card is not charged again
    const charges = moyasar.charges;
    svc(`update subscriptions set current_period_end = now() - interval '1 minute' where id = '${sub}'`);
    await invoke('charge-subscriptions', {}, cron());
    assert.equal(db.val(`select status from subscriptions where id = '${sub}'`), 'cancelled');
    assert.equal(moyasar.charges, charges);
  });

  test('the daily run asks about a waiting renewal before ending a cancelled subscription', async () => {
    const { sub, end } = dueSubscription();
    moyasar.next.push({ op: 'charge', do: 'timeout_after' });
    await invoke('charge-subscriptions', {}, cron());
    const charges = moyasar.charges;
    svc(`update subscriptions set cancel_at_period_end = true where id = '${sub}'`);
    await invoke('charge-subscriptions', {}, cron());
    assert.equal(db.val(`select status::text from orders where subscription_id = '${sub}'`), 'paid', 'the renewal Moyasar charged is recorded');
    assert.equal(moyasar.charges, charges, 'and not charged again');
    assert.deepEqual(db.one(`select status, cancel_at_period_end, current_period_end = '${end}'::timestamptz + interval '1 month' as follows from subscriptions where id = '${sub}'`),
      { status: 'active', cancel_at_period_end: true, follows: true });
  });
});

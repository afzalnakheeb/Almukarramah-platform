// The sixth independent review (REVIEW-6), each finding reproduced as it was found, before the fix:
// R6-1 a Gulf mobile after على (read علي once ى is made ي), عبر, معي or معنا not masked (server and database);
// R6-2 a closed return freeing its units, so the customer could return them again and be refunded on top of the
//      goodwill that covered them; the refund preview not showing goodwill already given on the parcel; decision Z
//      (goodwill off a later refund of the same parcel) still open, so a switch, off;
// R6-3 the send-back date: closing before the date the customer was shown (at the time of day of acceptance, or at
//      once when the owner lowered the days), "by" in English but "before" in Arabic, emails "within N days";
// R6-4 couriers' tracking numbers masked in the sent-back note (Arabic courier names, Express, J&T, UPS, Naqel);
// and the review's notes: the auto-close notice points somewhere that works; a refund carries the amount staff saw.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts } from '../functions/_shared/contact.ts';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import { R5_GULF_MASK, R6_COURIER_PHONES, R6_NOTES } from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);

before(() => {
  db = freshDb('review6');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
  env.REFUND_RECONCILE_GRACE_MINUTES = '15';
});

// ================================================================ R6-1, R6-4: masking
describe('R6-1: a Gulf mobile after على, عبر, معي or معنا is masked', () => {
  const ALA = R5_GULF_MASK.filter((t) => /على|علي|عبر|معنا/.test(t));
  test('in the server and in the database', () => {
    assert.ok(ALA.length >= 15);
    assert.deepEqual(ALA.filter((t) => !cleanText(t, 2000).flags.includes('contact_phone')).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(ALA.filter((t) => hint(t) !== 'phone').map((t) => `${t} => ${hint(t)}`), []);
  });
});

describe('R6-4: a courier\'s tracking number is kept; a phone number next to a courier is not', () => {
  // since REVIEW-7 (R7-1) in the customer's sent-back note only, and never a whole phone number there either: the
  // "receipt 05..." note is masked (review8 has the rest)
  const RECEIPT_05 = 'dropped at the SMSA branch, receipt 0512345678';
  const note = (n: string) => cleanText(n, 1000, { sentBackNote: true }).text;
  test('the review\'s 22 notes, and the other courier names, keep their numbers in the sent-back note (server and database)', () => {
    const kept = R6_NOTES.filter((n) => n !== RECEIPT_05);
    assert.deepEqual(kept.filter((n) => note(n) !== n).map((n) => `${n} => ${note(n)}`), []);
    assert.deepEqual(kept.filter((n) => db.val(`select private.contact_hint(${lit(n)}, true)`) !== null), []);
    assert.equal(note(RECEIPT_05), 'dropped at the SMSA branch, receipt •••');
  });

  test('a whole mobile number after a courier\'s name, or a number after a contact word, is still masked; server and database agree', () => {
    assert.deepEqual(R6_COURIER_PHONES.filter((t) => !cleanText(t, 2000).flags.includes('contact_phone')).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(R6_COURIER_PHONES.filter((t) => hint(t) !== 'phone').map((t) => `${t} => ${hint(t)}`), []);
    const differ = [...R6_NOTES, ...R6_COURIER_PHONES, ...R5_GULF_MASK].filter((t) => detectContacts(t).some((h) => h.kind === 'phone') !== (hint(t) === 'phone'));
    assert.deepEqual(differ, []);
  });
});

// ================================================================ the functions (Moyasar mocked)
type Pay = { id: string; refunded: number; amount: number };
async function paidAndDelivered(): Promise<{ o: Order; pay: Pay }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef }) as Pay;
  const r = await invoke('moyasar-webhook', moyasarEvent(pay));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 day' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return { o, pay };
}
const askReturn = (sub: string, item: string, q = 1) => db.val<{ id: string }>(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: sub, reason: 'damaged',
  details: 'It arrived crushed in the box', lines: [{ order_item_id: item, quantity: q }] })})`, 'service').id;
const act = (who: string, rid: string, action: string, note: string | null = null) =>
  db.error(`select mp_return_action('${who}', '${rid}', '${action}', ${note === null ? 'null' : lit(note)}, false)`, 'service');
async function goodwill(o: Order, pay: Pay, key: string, amount: number, subOrderId?: string) {
  pay.refunded += amount;
  const r = await invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, goodwill: true, reference: 'Moyasar dashboard, 31 Oct',
    reason: 'Goodwill: the box was dented', ...(subOrderId ? { subOrderId } : {}) }, { as: ids.finance });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const preview = (o: Order, what: Record<string, unknown>) => invoke('refund-order', { action: 'preview', orderId: o.o, ...what }, { as: ids.finance });
const refund = (o: Order, key: string, what: Record<string, unknown>) => invoke('refund-order', { orderId: o.o, reason: 'Came back to us', key, ...what }, { as: ids.finance });
const returnable = (o: Order, item: string) => db.val<number>(`select (l ->> 'returnable_quantity')::int from jsonb_array_elements(my_order_tracking('${o.o}') -> 'sub_orders') x,
  jsonb_array_elements(x -> 'lines') l where l ->> 'id' = '${item}'`, user('customer'));

describe('R6-2: a closed return keeps its units; staff see the goodwill on the parcel', () => {
  test('the units of a closed return cannot be returned again; staff can refund them by line and see the goodwill already given', async () => {
    const { o, pay } = await paidAndDelivered();
    const first = askReturn(o.h, o.items.h);
    assert.equal(act(ids.support, first, 'approve', 'Approved: crushed'), null);
    await goodwill(o, pay, 'r6b-gw-000001', 4000, o.h);
    assert.equal(act(ids.finance, first, 'close', 'The goodwill already given covered most of the dates'), null);
    // the customer: nothing left to return in that line
    assert.match(db.error(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: o.h, reason: 'damaged', details: 'They arrived crushed, as I said',
      lines: [{ order_item_id: o.items.h, quantity: 1 }] })})`, 'service') ?? 'opened', /Only 0/);
    assert.equal(returnable(o, o.items.h), 0);
    // our team: what is still due by line (decision AA), with the goodwill on that parcel in plain sight and, since
    // Afzal's yes to decision Z, taken off: 60 for the dates less the 40 given
    const pv = await preview(o, { lines: [{ orderItemId: o.items.h, quantity: 1 }] });
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.deepEqual([pv.body.amount_minor, pv.body.goodwill_on_parcels_minor, pv.body.goodwill_deducted_minor, pv.body.parcel_goodwill_deducted], [2000, 4000, 4000, true]);
    const r = await refund(o, 'r6b-line-0001', { lines: [{ orderItemId: o.items.h, quantity: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.amount, 2000);
  });

  test('units refunded by line after a return was closed do not stop the rest of the line being returned', async () => {
    const { o } = await paidAndDelivered();
    const first = askReturn(o.a, o.items.a, 1);                     // one of the two bottles
    assert.equal(act(ids.support, first, 'approve', 'Approved: broken'), null);
    assert.equal(act(ids.finance, first, 'close', 'Settled with the customer by phone call'), null);
    assert.equal(returnable(o, o.items.a), 1);
    assert.equal((await refund(o, 'r6b-line-0002', { lines: [{ orderItemId: o.items.a, quantity: 1 }] })).status, 200);   // it came back after all
    assert.equal(returnable(o, o.items.a), 1, 'the other bottle can still be returned');
  });

  test('decision Z is an owner-only switch (on since Afzal\'s yes): goodwill on a parcel comes off a later refund of it', async () => {
    assert.equal(db.val(`select parcel_goodwill_deducted from mp_settings where id = 1`), true);
    assert.match(db.error(`update mp_settings set parcel_goodwill_deducted = false where id = 1`, user('manager')) ?? 'changed', /owner/);
    try {
      const { o, pay } = await paidAndDelivered();
      await goodwill(o, pay, 'r6z-gw-000001', 2000, o.a);
      const pv = await preview(o, { subOrderId: o.a });
      assert.deepEqual([pv.body.amount_minor, pv.body.goodwill_deducted_minor, pv.body.parcel_goodwill_deducted], [51000, 2000, true]);
      const ra = await refund(o, 'r6z-par-a-001', { subOrderId: o.a });
      assert.deepEqual([ra.status, ra.body.amount, ra.body.goodwillDeducted], [200, 51000, 2000]);
      const rb = await refund(o, 'r6z-par-b-001', { subOrderId: o.b });
      assert.deepEqual([rb.status, rb.body.amount, rb.body.goodwillDeducted], [200, 53000, 0]);
      assert.equal(pay.refunded, 2000 + 51000 + 53000);
      assert.deepEqual(db.rows<{ refunded_minor: number }>(`select refunded_minor from sub_orders where order_id = '${o.o}' order by seq`).map((x) => x.refunded_minor),
        [53000, 53000, 0], 'parcel A: 20 of goodwill and 510');
    } finally {
      db.exec(`update mp_settings set parcel_goodwill_deducted = true where id = 1`, user('owner'));
    }
  });
});

// ================================================================ R6-3: the send-back date
/** A paid order with recent deliveries (returns can be asked for), paid in SQL. */
function deliveredRecently(): Order {
  const o = unpaidOrder(db, s);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() - interval '5 days' where id = '${o.o}';
       update sub_orders set status = 'delivered', shipped_at = now() - interval '3 days', delivered_at = now() - interval '2 days' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return o;
}
/** Seller A accepts a return of one bottle: the customer must send it back. */
function acceptedNow(o: Order): string {
  const rid = askReturn(o.a, o.items.a, 1);
  assert.equal(act(ids.sellerA, rid, 'accept', 'Please send it back in its box'), null);
  return rid;
}
const sendBackBy = (rid: string) => db.val<string>(`select send_back_by::text from return_requests where id = '${rid}'`);
const riyadhTodayPlus = (n: number) => db.val<string>(`select ((now() at time zone 'Asia/Riyadh')::date + ${n})::text`);
const status = (rid: string) => db.val<string>(`select status from return_requests where id = '${rid}'`);
let seq = 50;
/** An accepted return with its date set (the row as acceptance stores it). */
function acceptedWithDate(date: string): string {
  const o = unpaidOrder(db, s);
  seq += 1;
  const rid = db.val<string>(`insert into return_requests (order_id, sub_order_id, seq, seller_id, user_id, kind, reason, status, accepted_at, send_back_by, decided_by)
    values ('${o.o}', '${o.a}', ${seq}, '${s.A}', '${ids.customer}', 'return', 'changed_mind', 'accepted', '${date}'::date - 30, '${date}', 'seller') returning id`, 'service');
  svc(`insert into return_lines (return_id, order_item_id, quantity) values ('${rid}', '${o.items.a}', 1)`);
  return rid;
}
/** One statement's single value, in a session with the time zone given (the harness's sessions are in UTC). */
const inZone = (tz: string, sql: string) => db.exec(`set timezone = '${tz}';\n${sql};`).trim().split('\n').filter(Boolean).pop() ?? '';
/** What the auto-close step closes if it runs at that moment. */
const autoclose = (at: string, tz = 'UTC') => JSON.parse(inZone(tz, `select coalesce(mp_autoclose_returns(50, '${at}'::timestamptz) -> 'closed', '[]')`)) as string[];

describe('R6-3: the date to send a return back by', () => {
  test('is fixed when the seller accepts and stored; lowering or raising the days later changes nothing for it', async () => {
    const o = deliveredRecently();
    const first = acceptedNow(o);
    assert.equal(sendBackBy(first), riyadhTodayPlus(30));
    db.exec(`update mp_settings set return_autoclose_days = 7 where id = 1`, user('owner'));
    try {
      assert.equal(sendBackBy(first), riyadhTodayPlus(30));
      assert.equal(db.val(`select private.return_json('${first}', 'customer') ->> 'send_back_by'`), riyadhTodayPlus(30));
      const run = await invoke('finish-pending', {}, { headers: { 'x-cron-secret': env.CRON_SECRET } });
      assert.ok(!run.body.returns_closed.includes(first), 'lowering the days closes nothing already accepted');
      assert.equal(status(first), 'accepted');
      const second = acceptedNow(o);                                 // accepted after the change: the new days
      assert.equal(sendBackBy(second), riyadhTodayPlus(7));
      db.exec(`update mp_settings set return_autoclose_days = 45 where id = 1`, user('owner'));
      assert.deepEqual([sendBackBy(first), sendBackBy(second)], [riyadhTodayPlus(30), riyadhTodayPlus(7)]);
      const third = acceptedNow(deliveredRecently());
      assert.equal(sendBackBy(third), riyadhTodayPlus(45));
    } finally {
      db.exec(`update mp_settings set return_autoclose_days = 30 where id = 1`, user('owner'));
    }
  });

  test('closes only once the date has ended everywhere (the end of that day in UTC−12): a minute before, it stays', () => {
    const rid = acceptedWithDate('2025-01-10');
    assert.equal(db.val(`select to_char(private.send_back_ends('2025-01-10') at time zone 'UTC', 'YYYY-MM-DD HH24:MI')`), '2025-01-11 12:00');
    assert.deepEqual(autoclose('2025-01-11 11:59:00+00'), []);
    assert.equal(status(rid), 'accepted');
    assert.deepEqual(autoclose('2025-01-11 12:00:00+00'), [rid]);
    assert.equal(status(rid), 'closed');
  });

  test('the same in every session time zone: the stored date, its end and the decision', () => {
    const at = '2026-10-26 21:30:00+00';     // 00:30 on 27 October in Riyadh
    for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
      const o = unpaidOrder(db, s);
      seq += 1;
      const rid = inZone(tz, `insert into return_requests (order_id, sub_order_id, seq, seller_id, user_id, kind, reason, status, accepted_at, decided_by)
        values ('${o.o}', '${o.a}', ${seq}, '${s.A}', '${ids.customer}', 'return', 'changed_mind', 'accepted', '${at}', 'seller') returning id`);
      assert.equal(inZone(tz, `select send_back_by::text from return_requests where id = '${rid}'`), '2026-11-26', tz);
      assert.equal(Number(inZone(tz, `select extract(epoch from private.send_back_ends('2026-11-26'))::bigint`)), Date.UTC(2026, 10, 27, 12) / 1000, tz);
      assert.equal(inZone(tz, `select private.return_json('${rid}', 'customer') ->> 'send_back_by'`), '2026-11-26', tz);
    }
    const rid = acceptedWithDate('2025-02-10');
    assert.deepEqual(autoclose('2025-02-11 11:59:00+00', 'Pacific/Kiritimati'), []);
    assert.deepEqual(autoclose('2025-02-11 11:59:00+00', 'Etc/GMT+12'), []);
    assert.deepEqual(autoclose('2025-02-11 12:00:00+00', 'Asia/Riyadh'), [rid]);
  });

  test('"by {date}" in both languages; the emails give the stored date, never "within N days"', () => {
    const i18n = readFileSync(new URL('../../src/lib/i18n.tsx', import.meta.url), 'utf8');
    const [en, ar] = [...i18n.matchAll(/^\s*rtSendBackBy: '([^']*)'/gm)].map((m) => m[1]);
    assert.match(en, /by \{date\}/);
    assert.match(ar, /في موعد أقصاه \{date\}/);
    assert.doesNotMatch(ar, /قبل \{date\}/);
    const o = deliveredRecently();
    const rid = acceptedNow(o);
    const date = sendBackBy(rid);
    const accepted = db.rows<{ body_en: string; body_ar: string }>(`select body_en, body_ar from notification_outbox where template_key = 'return_accepted' and payload ->> 'return_id' = '${rid}'`);
    assert.ok(accepted.length > 0 && accepted.every((x) => x.body_en.includes(date) && x.body_ar.includes(date)), JSON.stringify(accepted));
    svc(`update return_requests set send_back_by = '2025-03-01' where id = '${rid}'`);
    assert.deepEqual(autoclose('2025-03-02 12:00:00+00'), [rid]);
    const closed = db.rows<{ body_en: string; body_ar: string }>(`select body_en, body_ar from notification_outbox where template_key in ('return_autoclosed', 'seller_return_autoclosed')
      and payload ->> 'return_id' = '${rid}'`);
    assert.ok(closed.length >= 2, JSON.stringify(closed));
    for (const x of closed) {
      assert.ok(x.body_en.includes('2025-03-01') && x.body_ar.includes('2025-03-01'), JSON.stringify(x));
      assert.doesNotMatch(x.body_en, /within \d+ days/);
    }
  });
});

// ================================================================ the review's notes
describe('REVIEW-6 notes: the auto-close notice, and the amount staff saw', () => {
  test('the auto-close notice points to the address that works, in both languages', () => {
    const t = db.one<{ body_en: string; body_ar: string }>(`select body_en, body_ar from notification_templates where key = 'return_autoclosed'`);
    assert.match(t.body_en, /hello@almukarramah\.com/);
    assert.match(t.body_ar, /hello@almukarramah\.com/);
    assert.doesNotMatch(t.body_en, /order page/);
  });

  test('a refund carries the amount the preview showed: if it changed meanwhile, nothing is refunded and staff preview again', async () => {
    const { o, pay } = await paidAndDelivered();
    const pv = await preview(o, {});
    assert.equal(pv.body.amount_minor, o.total);
    await goodwill(o, pay, 'r6n-gw-000001', 2000);            // given meanwhile, by someone else
    const stale = await refund(o, 'r6n-all-00001', { expectedAmount: pv.body.amount_minor });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.match(String(stale.body.error), /changed.*preview again/i);
    assert.equal(pay.refunded, 2000, 'nothing refunded');
    const fresh = await preview(o, {});
    const ok = await refund(o, 'r6n-all-00002', { expectedAmount: fresh.body.amount_minor });
    assert.deepEqual([ok.status, ok.body.amount], [200, o.total - 2000]);
  });
});

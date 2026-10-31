// Afzal's marketplace decisions of 31 October 2026 (DECISIONS.md), each written as a test before the change:
// * commission stays 25% in every category for launch, and support does not refund (guards on the defaults);
// * a return accepted for sending back that is never sent back closes on its own after `return_autoclose_days` (30,
//   owner only), in the finish-pending job: the seller's sale is then free to be paid, the customer and the seller are
//   told (in Arabic and English), each closure is in the audit log, a second run changes nothing, and a return the
//   customer has sent back (in transit) is never touched.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

before(() => {
  db = freshDb('decisions');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
});

describe('Afzal, 31 October: commission and refunds by support stay as set for launch', () => {
  test('every category charges 25%, and support cannot refund', () => {
    assert.equal(db.val(`select default_commission_bps from mp_settings where id = 1`), 2500);
    assert.deepEqual(db.rows(`select slug from categories where (mp_category_policy(id) ->> 'commission_bps')::int <> 2500`), []);
    assert.equal(db.val(`select support_refund_limit_minor from mp_settings where id = 1`), 0);
  });
});

// ================================================================ returns never sent back
/** A paid order whose two seller parcels were delivered long ago (their sales are past their hold). */
function deliveredLongAgo(): Order {
  const o = unpaidOrder(db, s);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() - interval '70 days' where id = '${o.o}';
       update sub_orders set status = 'delivered', shipped_at = now() - interval '62 days', delivered_at = now() - interval '60 days' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return o;
}
let seq = 0;
/** A return of one bottle from seller A's parcel, in the state given, accepted (the seller said "send it back") that long ago. */
function acceptedReturn(o: Order, acceptedAgo: string, status = 'accepted'): string {
  seq += 1;
  const id = db.val<string>(`insert into return_requests (order_id, sub_order_id, seq, seller_id, user_id, kind, reason, status, accepted_at, decided_by, created_at)
    values ('${o.o}', '${o.a}', ${seq}, '${s.A}', '${ids.customer}', 'return', 'changed_mind', '${status}', now() - interval '${acceptedAgo}', 'seller',
            now() - interval '${acceptedAgo}' - interval '1 day') returning id`, 'service');
  svc(`insert into return_lines (return_id, order_item_id, quantity) values ('${id}', '${o.items.a}', 1)`);
  return id;
}
const finishPending = () => invoke('finish-pending', {}, { headers: { 'x-cron-secret': env.CRON_SECRET } });
const statusOf = (rid: string) => db.val<string>(`select status from return_requests where id = '${rid}'`);
const closures = (rid: string) => db.val<number>(`select count(*)::int from audit_log where table_name = 'return_requests' and row_id = '${rid}' and action = 'RETURN_AUTOCLOSED'`);
const told = (key: string, rid: string) => db.val<number>(`select count(*)::int from notification_outbox where template_key = '${key}' and payload ->> 'return_id' = '${rid}'`);

describe('Afzal, 31 October: an accepted return that is never sent back closes after 30 days', () => {
  test('the setting is 30 days, and only the owner changes it', () => {
    assert.equal(db.val(`select return_autoclose_days from mp_settings where id = 1`), 30);
    assert.match(db.error(`update mp_settings set return_autoclose_days = 90 where id = 1`, user('manager')) ?? 'changed', /owner/);
    assert.equal(db.error(`update mp_settings set return_autoclose_days = 31 where id = 1`, user('owner')), null);
    assert.equal(db.val(`select return_autoclose_days from mp_settings where id = 1`), 31);
    db.exec(`update mp_settings set return_autoclose_days = 30 where id = 1`, user('owner'));
  });

  test('closed at 30 days, not at 29: the seller can be paid, the customer and the seller are told, the closure is logged', async () => {
    const o = deliveredLongAgo();
    const due = acceptedReturn(o, '30 days 1 minute');
    const notYet = acceptedReturn(o, '29 days 23 hours');
    const before = db.val<{ available_sar_minor: number; held_sar_minor: number }>(`select private.ledger_available('${s.A}')`);
    const run = await finishPending();
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.deepEqual(run.body.returns_closed, [due]);
    assert.deepEqual([statusOf(due), statusOf(notYet)], ['closed', 'accepted']);
    assert.ok(db.val<boolean>(`select 'auto_closed' = any(flags) and resolved_at is not null from return_requests where id = '${due}'`));
    // nothing held for the closed return any more: the sale (less our commission) can be paid; the other return still holds it
    const after1 = db.val<{ available_sar_minor: number; held_sar_minor: number }>(`select private.ledger_available('${s.A}')`);
    assert.equal(after1.available_sar_minor - before.available_sar_minor, 0, 'the parcel still has the 29-day return open');
    // the customer (email and in the app, both languages) and the seller are told; the closure is in the audit log
    assert.equal(told('return_autoclosed', due), 2);
    assert.ok(db.val<boolean>(`select bool_and(subject_ar <> '' and body_ar ~ '[ء-ي]' and body_en ~ '30 days') from notification_outbox
      where template_key = 'return_autoclosed' and payload ->> 'return_id' = '${due}'`));
    assert.ok(told('seller_return_autoclosed', due) > 0);
    assert.equal(closures(due), 1);
    assert.equal(closures(notYet) + told('return_autoclosed', notYet), 0);
    // a day later the other one closes too, and then the parcel's sale is free
    svc(`update return_requests set accepted_at = accepted_at - interval '1 day' where id = '${notYet}'`);
    assert.deepEqual((await finishPending()).body.returns_closed, [notYet]);
    const after2 = db.val<{ available_sar_minor: number; held_sar_minor: number }>(`select private.ledger_available('${s.A}')`);
    assert.equal(after2.available_sar_minor - before.available_sar_minor, 50000 - 12500, 'the oud sale less our commission');
  });

  test('a second run, or two at once, change nothing more: closed once, told once, logged once', async () => {
    const o = deliveredLongAgo();
    const due = acceptedReturn(o, '45 days');
    const both = await Promise.all([finishPending(), finishPending()]);
    assert.deepEqual(both.map((r) => r.status), [200, 200]);
    assert.deepEqual(both.flatMap((r) => r.body.returns_closed), [due]);
    const again = await finishPending();
    assert.deepEqual(again.body.returns_closed, []);
    assert.equal(statusOf(due), 'closed');
    assert.equal(closures(due), 1);
    assert.equal(told('return_autoclosed', due), 2);
  });

  test('never touches a return the customer has sent back (in transit), nor one in any other state', async () => {
    const o = deliveredLongAgo();
    const sent = acceptedReturn(o, '40 days');
    // the customer says they sent it back, with the courier's tracking number
    const r = await invoke('after-sale', { action: 'return_action', returnId: sent, do: 'sent_back', note: 'Aramex 7712345678, sent on Sunday' }, { as: ids.customer });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.sent_back_at, JSON.stringify(r.body));
    assert.ok(db.val<number>(`select count(*)::int from notification_outbox where template_key = 'seller_return_sent_back' and payload ->> 'return_id' = '${sent}'`) > 0);
    const others = ['requested', 'escalated', 'approved', 'declined'].map((st) => acceptedReturn(o, '40 days', st));
    const run = await finishPending();
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.deepEqual(run.body.returns_closed, []);
    assert.equal(statusOf(sent), 'accepted');
    assert.deepEqual(others.map(statusOf), ['requested', 'escalated', 'approved', 'declined']);
    assert.equal([sent, ...others].reduce((n, x) => n + closures(x), 0), 0);
  });

  test('"I have sent it back": the customer (or our team for them), only while the return waits for the items, once', async () => {
    const o = deliveredLongAgo();
    const rid = acceptedReturn(o, '3 days');
    const act = (who: string, note: string | null = null) =>
      db.error(`select mp_return_action('${who}', '${rid}', 'sent_back', ${note === null ? 'null' : lit(note)})`, 'service');
    assert.match(act(ids.sellerA) ?? 'marked', /Not allowed/);
    assert.match(act(ids.customer2) ?? 'marked', /Not allowed/);
    assert.equal(act(ids.customer), null);
    assert.match(act(ids.customer) ?? 'marked', /already/i);
    const requested = acceptedReturn(o, '3 days', 'requested');
    assert.match(db.error(`select mp_return_action('${ids.customer}', '${requested}', 'sent_back')`, 'service') ?? 'marked', /accepted/i);
    const forThem = acceptedReturn(o, '3 days');
    assert.equal(db.error(`select mp_return_action('${ids.support}', '${forThem}', 'sent_back', 'The customer called: SMSA 290012345678')`, 'service'), null);
    // the seller sees when, and what the customer wrote; the customer sees the date to send it by while it waits
    const seen = db.val<Record<string, unknown>>(`select private.return_json('${rid}', 'seller')`);
    assert.ok(seen.sent_back_at);
    const waiting = acceptedReturn(o, '3 days');
    const mine = db.val<Record<string, unknown>>(`select private.return_json('${waiting}', 'customer')`);
    assert.equal(String(mine.send_back_by).slice(0, 10), db.val<string>(`select ((accepted_at + interval '30 days') at time zone 'Asia/Riyadh')::date::text from return_requests where id = '${waiting}'`));
  });

  test('the number of days is the owner\'s setting', async () => {
    const o = deliveredLongAgo();
    const rid = acceptedReturn(o, '40 days');
    db.exec(`update mp_settings set return_autoclose_days = 45 where id = 1`, user('owner'));
    try {
      assert.deepEqual((await finishPending()).body.returns_closed, []);
      assert.equal(statusOf(rid), 'accepted');
    } finally {
      db.exec(`update mp_settings set return_autoclose_days = 30 where id = 1`, user('owner'));
    }
    assert.deepEqual((await finishPending()).body.returns_closed, [rid]);
  });
});

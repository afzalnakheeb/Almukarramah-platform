// The seventh independent review (REVIEW-7), each finding reproduced as it was found, before the fix:
// R7-1 the courier exception of the sixth pass applied to every text: "SMSA receipt 0501234567", "Aramex tracking +966
//      50 123 4567", "ارامكس رقم الشحنة ٠٥٠١٢٣٤٥٦٧" or "Aramex receipt zero five zero one..." readable in messages, accepted
//      in listings, passed by the database. Only the customer's sent-back note may read a courier's tracking number, and
//      even there every full phone shape stays masked (a mobile without its 0 right after a courier's name may stay:
//      Afzal, 31 October);
// R7-2 with decision Z, a refund that counted goodwill credited its full lines, so the goodwill was on our credit notes
//      twice (20 of goodwill, 230 refunded, a credit note of 250);
// R7-3 a return escalated and accepted again kept its old send-back date (and could close at once) and no second notice;
// R7-4 no cap on goodwill per parcel (600 on a 530 parcel), and a return the goodwill already covered left the seller's
//      sale standing (refused, "close the return instead");
// and the review's information items: "Settle by hand" checked goodwill across the order only; the staff guide said a
// closed return "holds nothing".
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts } from '../functions/_shared/contact.ts';
import { textChecks } from '../functions/_shared/screening.ts';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import {
  CONTACT_PROBES, EVERYDAY, EXTRA_PROBES, LISTING_TEXTS, ORDINARY, R4_NATURAL, R4_ORDINARY, R4_PROBES, R5_GULF_MASK, R5_GULF_STAY, R5_LISTINGS, R5_RANGES,
  R6_COURIER_PHONES, R6_NOTES, R7_BARE_MASK, R7_BARE_STAY, R7_CONTACT_ROUND_MASK, R7_CONTACT_UNIT_STAY, R8_COURIER_MASK, R8_NOTE_BARE, R8_NOTE_KEEP,
  R8_NOTE_MASK, R8_NOTES_MASKED_ELSEWHERE,
} from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
/** The database's check: everywhere (a shop page), or the customer's sent-back note. */
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);
const hintNote = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)}, true)`);
const clean = (t: string, note = false) => cleanText(t, 2000, note ? { sentBackNote: true } : {});
const masked = (t: string, note = false) => clean(t, note).flags.includes('contact_phone');
const untouched = (t: string, note = false) => { const c = clean(t, note); return c.text === t && c.flags.length === 0; };
/** Digits still readable (Arabic-Indic too): a masked phone number leaves none of its own. */
const digitsLeft = (t: string) => (t.match(/[0-9٠-٩]/g) ?? []).length;
const listingBlocked = (t: string) => textChecks({ name_en: 'Oud oil', name_ar: 'دهن عود', description_en: t, description_ar: 'دهن عود' }, []).length > 0;

before(() => {
  db = freshDb('review8');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
  env.REFUND_RECONCILE_GRACE_MINUTES = '15';
});

// ================================================================ R7-1: couriers' numbers, in the sent-back note only
describe('R7-1: a courier\'s name keeps no number readable, except a tracking number in the customer\'s sent-back note', () => {
  test('outside the note, every one of the review\'s courier texts is masked in a message, refused in a listing and found by the database', () => {
    assert.deepEqual(R8_COURIER_MASK.filter((t) => !masked(t) || digitsLeft(clean(t).text) > 0).map((t) => `${t} => ${clean(t).text}`), []);
    assert.deepEqual(R8_COURIER_MASK.filter((t) => !listingBlocked(t)), []);
    assert.deepEqual(R8_COURIER_MASK.filter((t) => hint(t) !== 'phone').map((t) => `${t} => ${hint(t)}`), []);
  });

  test('outside the note, couriers\' numbers are read as they were before the sixth pass; earlier sets hold; server and database agree', () => {
    // the sixth pass's notes: what was masked before it is masked again, the rest stays as written
    assert.deepEqual(R6_NOTES.filter((n) => masked(n) !== R8_NOTES_MASKED_ELSEWHERE.includes(n)).map((n) => `${n} => ${clean(n).text}`), []);
    assert.deepEqual(R8_NOTES_MASKED_ELSEWHERE.filter((n) => hint(n) !== 'phone'), []);
    assert.deepEqual(R6_NOTES.filter((n) => !R8_NOTES_MASKED_ELSEWHERE.includes(n) && !untouched(n)), []);
    // every earlier disguise set is masked, everyday texts untouched
    assert.deepEqual(R4_PROBES.filter((p) => !clean(p).flags.some((f) => f.startsWith('contact_'))), []);
    assert.deepEqual([...R5_GULF_MASK, ...R6_COURIER_PHONES, ...R7_BARE_MASK, ...R7_CONTACT_ROUND_MASK].filter((t) => !masked(t)), []);
    assert.deepEqual(R4_NATURAL.filter(([p, want]) => clean(p).text !== want).map(([p]) => p), []);
    assert.deepEqual([...R4_ORDINARY, ...EVERYDAY, ...ORDINARY, ...R5_GULF_STAY, ...R7_BARE_STAY, ...R5_RANGES, ...R5_LISTINGS].filter((t) => !untouched(t)), []);
    for (const [p, leak] of [...CONTACT_PROBES, ...EXTRA_PROBES]) assert.doesNotMatch(clean(p).text, leak, p);
    const texts = [...R8_COURIER_MASK, ...R8_NOTE_MASK, ...R8_NOTE_KEEP, ...R6_NOTES, ...R6_COURIER_PHONES, ...R7_BARE_MASK, ...R7_BARE_STAY,
      ...R7_CONTACT_ROUND_MASK, ...R7_CONTACT_UNIT_STAY, ...R5_RANGES, ...R5_LISTINGS, ...R5_GULF_MASK, ...R5_GULF_STAY, ...R4_PROBES, ...R4_ORDINARY,
      ...EVERYDAY, ...LISTING_TEXTS];
    const bank = (t: string) => detectContacts(t).some((h) => h.kind === 'bank' || h.kind === 'card');
    const differ = texts.filter((t) => (!bank(t) && detectContacts(t).some((h) => h.kind === 'phone') !== (hint(t) === 'phone'))
      || (detectContacts(t).length > 0) !== (hint(t) !== null));
    assert.deepEqual(differ, []);
  });

  test('in the sent-back note, couriers\' tracking numbers are kept, and a mobile without its 0 right after a courier\'s name', () => {
    assert.deepEqual(R8_NOTE_KEEP.filter((n) => !untouched(n, true)).map((n) => `${n} => ${clean(n, true).text}`), []);
    assert.deepEqual(R8_NOTE_KEEP.filter((n) => hintNote(n) !== null).map((n) => `${n} => ${hintNote(n)}`), []);
    assert.ok(R8_NOTE_BARE.every((n) => R8_NOTE_KEEP.includes(n)));
  });

  test('in the note too, a full phone shape is masked: 05..., +966, 00966 or 966..., the Gulf codes and mobiles, spelled out, spaced, after a contact word', () => {
    assert.deepEqual(R8_NOTE_MASK.filter((t) => !masked(t, true)).map((t) => `${t} => ${clean(t, true).text}`), []);
    assert.deepEqual(R8_NOTE_MASK.filter((t) => hintNote(t) !== 'phone').map((t) => `${t} => ${hintNote(t)}`), []);
    // the reviewer's four, word for word
    for (const t of ['SMSA receipt 0501234567', 'Aramex tracking +966 50 123 4567', 'ارامكس رقم الشحنة ٠٥٠١٢٣٤٥٦٧', 'Aramex receipt zero five zero one two three four five six seven']) {
      assert.equal(digitsLeft(clean(t, true).text), 0, t);
      assert.doesNotMatch(clean(t, true).text, /zero|five/, t);
    }
    // server and database agree on the note too
    const differ = [...R8_NOTE_MASK, ...R8_NOTE_KEEP, ...R6_NOTES, ...R6_COURIER_PHONES, ...R8_COURIER_MASK]
      .filter((t) => masked(t, true) !== (hintNote(t) === 'phone'));
    assert.deepEqual(differ, []);
  });

  test('the after-sale function reads them so only in the customer\'s "I have sent it back" note', async () => {
    const o = deliveredRecently();
    const sent = acceptedNow(o, o.a, o.items.a);
    const r = await invoke('after-sale', { action: 'return_action', returnId: sent, do: 'sent_back', note: 'Naqel 501234567' }, { as: ids.customer });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(db.val(`select sent_back_note from return_requests where id = '${sent}'`), 'Naqel 501234567');
    // a whole number in the note: masked
    const other = acceptedNow(o, o.b, o.items.b);
    const r2 = await invoke('after-sale', { action: 'return_action', returnId: other, do: 'sent_back', note: 'SMSA receipt 0501234567' }, { as: ids.customer });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(db.val(`select sent_back_note from return_requests where id = '${other}'`), 'SMSA receipt •••');
    // anywhere else: a message, another note on a return
    const m = await invoke('after-sale', { action: 'message', subOrderId: o.a, body: 'Naqel 501234567' }, { as: ids.customer });
    assert.equal(m.status, 200, JSON.stringify(m.body));
    assert.equal(db.val(`select body from messages where id = ${m.body.message_id}`), 'Naqel •••');
    const third = askReturn(o.h, o.items.h, 1);
    const n = await invoke('after-sale', { action: 'return_action', returnId: third, do: 'reject', note: 'Send it with SMSA receipt 0501234567' }, { as: ids.support });
    assert.equal(n.status, 200, JSON.stringify(n.body));
    assert.equal(db.val(`select staff_note from return_requests where id = '${third}'`), 'Send it with SMSA receipt •••');
  });
});

// ================================================================ the money (Moyasar mocked)
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
const recordGoodwill = (o: Order, pay: Pay, key: string, amount: number, subOrderId?: string) => {
  pay.refunded += amount;
  return invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, goodwill: true, reference: 'Moyasar dashboard, 31 Oct',
    reason: 'Goodwill: the parcel was late', ...(subOrderId ? { subOrderId } : {}) }, { as: ids.finance });
};
async function goodwill(o: Order, pay: Pay, key: string, amount: number, subOrderId?: string) {
  const r = await recordGoodwill(o, pay, key, amount, subOrderId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const preview = (o: Order, what: Record<string, unknown>) => invoke('refund-order', { action: 'preview', orderId: o.o, ...what }, { as: ids.finance });
const refund = (o: Order, key: string, what: Record<string, unknown>) => invoke('refund-order', { orderId: o.o, reason: 'Came back to us', key, ...what }, { as: ids.finance });
const oneOud = (o: Order) => ({ lines: [{ orderItemId: o.items.a, quantity: 1 }] });
/** Each refund that went through: the money, its credit note, the goodwill it counted. */
const refundsOf = (o: Order) => db.rows<{ amount: number; note: number | null; deducted: number; goodwill: number; platform: number; key: string }>(
  `select f.amount_minor as amount, (select i.total_incl_vat_minor from invoices i where i.id = f.credit_note_id) as note, f.goodwill_deducted_minor as deducted,
          f.goodwill_minor as goodwill, f.platform_minor as platform, f.idempotency_key as key
   from refunds f where f.order_id = '${o.o}' and f.status = 'succeeded' order by f.created_at`);
/** Our invoice, our credit notes, the payment and what went back (refunds and goodwill). */
const books = (o: Order) => db.one<{ invoice: number; notes: number; paid: number; back: number }>(`select
    (select total_incl_vat_minor from invoices where order_id = o.id and doc = 'invoice') as invoice,
    (select coalesce(sum(total_incl_vat_minor), 0)::int from invoices where order_id = o.id and doc = 'credit_note') as notes,
    o.total_minor as paid, o.refunded_minor as back from orders o where o.id = '${o.o}'`);
/** Every refund's credit note is the money it paid back, and our invoice less our credit notes is the payment less what went back. */
function creditNotesMatchTheMoney(o: Order, pay: Pay) {
  const rows = refundsOf(o);
  assert.deepEqual(rows.filter((x) => (x.note ?? 0) !== x.amount).map((x) => `${x.key}: credit note ${x.note} for ${x.amount} (goodwill counted ${x.deducted})`), []);
  const b = books(o);
  assert.equal(b.back, pay.refunded, 'what we recorded is what Moyasar paid back');
  assert.equal(b.invoice - b.notes, b.paid - b.back, `invoice ${b.invoice} less credit notes ${b.notes} = payments ${b.paid} less refunds and goodwill ${b.back}`);
}
const failNextRefund = () => moyasar.next.push({ op: 'refund', do: '5xx' });
async function reconcileFailed(refundId: string) {
  env.REFUND_RECONCILE_GRACE_MINUTES = '0';
  try {
    const r = await invoke('refund-order', { action: 'reconcile', refundId }, { as: ids.finance });
    assert.equal(r.body.state, 'failed', JSON.stringify(r.body));
  } finally {
    env.REFUND_RECONCILE_GRACE_MINUTES = '15';
  }
}
const refundId = (key: string) => db.val<string>(`select id from refunds where idempotency_key = '${key}'`);
const settleLate = (id: string) => invoke('refund-order', { action: 'resolve', refundId: id, outcome: 'succeeded', reason: 'Moyasar shows it refunded on the 31st' }, { as: ids.finance });

describe('R7-2: with decision Z, each refund\'s credit note is the money it paid back', () => {
  test('partial refunds: 20 of goodwill on parcel A, then its two ouds and its delivery one by one (230, 250, 30)', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8cn-gw-00001', 2000, o.a);
    const first = await refund(o, 'r8cn-oud-0001', oneOud(o));
    assert.deepEqual([first.status, first.body.amount, first.body.goodwillDeducted], [200, 23000, 2000], JSON.stringify(first.body));
    assert.equal((await refund(o, 'r8cn-oud-0002', oneOud(o))).body.amount, 25000);
    assert.equal((await refund(o, 'r8cn-shp-0001', { shipping: [o.a] })).body.amount, 3000);
    creditNotesMatchTheMoney(o, pay);
    assert.equal(books(o).notes, 53000, 'goodwill 20, then 230, 250 and 30: the parcel once');
    // the goodwill is taken off the oud's own line on its credit note, not one "price reduction" line
    const xml = db.val<string>(`select i.xml from refunds f join invoices i on i.id = f.credit_note_id where f.idempotency_key = 'r8cn-oud-0001'`);
    assert.match(xml, /Royal oud/);
    assert.match(xml, /<cbc:RoundingAmount currencyID="SAR">230\.00<\/cbc:RoundingAmount>/);
    assert.doesNotMatch(xml, /Price reduction/);
  });

  test('several parcels: goodwill on A and on B, then each parcel refunded whole', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8cn-gw-00002', 2000, o.a);
    await goodwill(o, pay, 'r8cn-gw-00003', 1000, o.b);
    assert.equal((await refund(o, 'r8cn-par-a001', { subOrderId: o.a })).body.amount, 51000);
    assert.equal((await refund(o, 'r8cn-par-b001', { subOrderId: o.b })).body.amount, 52000);
    assert.equal((await refund(o, 'r8cn-par-h001', { subOrderId: o.h })).body.amount, 9000);
    creditNotesMatchTheMoney(o, pay);
    const xml = db.val<string>(`select i.xml from refunds f join invoices i on i.id = f.credit_note_id where f.idempotency_key = 'r8cn-par-a001'`);
    assert.doesNotMatch(xml, /Price reduction/);
    assert.match(xml, /<cbc:TaxInclusiveAmount currencyID="SAR">510\.00<\/cbc:TaxInclusiveAmount>/);
  });

  test('the R5-2 payment cut: goodwill on A and on the order, then B, A and the dates (cut by the order\'s 10)', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8cn-gw-00004', 2000, o.a);
    await goodwill(o, pay, 'r8cn-gw-00005', 1000);
    assert.equal((await refund(o, 'r8cn-cut-b001', { subOrderId: o.b })).body.amount, 53000);
    assert.equal((await refund(o, 'r8cn-cut-a001', { subOrderId: o.a })).body.amount, 51000);
    const h = await refund(o, 'r8cn-cut-h001', { subOrderId: o.h });
    assert.deepEqual([h.status, h.body.amount, h.body.goodwillDeducted], [200, 8000, 1000], JSON.stringify(h.body));
    creditNotesMatchTheMoney(o, pay);
    assert.equal(books(o).notes, books(o).invoice, 'everything went back: the invoice is credited in full, never more');
  });

  test('late completion: a refund that counted goodwill fails, then Moyasar shows it made after all ("Settle by hand")', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8cn-gw-00006', 2000, o.a);
    failNextRefund();
    assert.equal((await refund(o, 'r8cn-late-001', oneOud(o))).status, 202);
    await reconcileFailed(refundId('r8cn-late-001'));
    pay.refunded += 23000;                                   // Moyasar completed it late
    const r = await settleLate(refundId('r8cn-late-001'));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    creditNotesMatchTheMoney(o, pay);
  });

  test('with Z off the old rule holds (each parcel in full), and the credit notes still equal the money', async () => {
    db.exec(`update mp_settings set parcel_goodwill_deducted = false where id = 1`, user('owner'));
    try {
      const { o, pay } = await paidAndDelivered();
      await goodwill(o, pay, 'r8cn-gw-00007', 2000, o.a);
      assert.equal((await refund(o, 'r8cn-off-a001', oneOud(o))).body.amount, 25000);
      creditNotesMatchTheMoney(o, pay);
    } finally {
      db.exec(`update mp_settings set parcel_goodwill_deducted = true where id = 1`, user('owner'));
    }
  });

  test('credit notes stay gap-free and out of reach: numbered in order, never edited or deleted by staff', () => {
    const icv = db.one<{ n: number; lo: number; hi: number }>(`select count(*)::int as n, min(icv)::int as lo, max(icv)::int as hi from invoices`);
    assert.equal(icv.n, icv.hi - icv.lo + 1, 'no gap in the counter');
    const cn = db.val<string>(`select id from invoices where doc = 'credit_note' order by icv limit 1`);
    const was = db.one(`select number, total_incl_vat_minor, xml from invoices where id = '${cn}'`);
    for (const who of ['owner', 'manager', 'finance'] as const) {
      db.error(`update invoices set total_incl_vat_minor = 1 where id = '${cn}'`, user(who));
      db.error(`delete from invoices where id = '${cn}'`, user(who));
    }
    assert.deepEqual(db.one(`select number, total_incl_vat_minor, xml from invoices where id = '${cn}'`), was);
  });
});

// ================================================================ R7-3: accepted again
/** A paid order with recent deliveries (returns can be asked for), paid in SQL. */
function deliveredRecently(): Order {
  const o = unpaidOrder(db, s);
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() - interval '5 days' where id = '${o.o}';
       update sub_orders set status = 'delivered', shipped_at = now() - interval '3 days', delivered_at = now() - interval '2 days' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return o;
}
const askReturn = (sub: string, item: string, q = 1) => db.val<{ id: string }>(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: sub, reason: 'damaged',
  details: 'It arrived crushed in the box', lines: [{ order_item_id: item, quantity: q }] })})`, 'service').id;
const act = (who: string, rid: string, action: string, note: string | null = null, restock = false) =>
  db.error(`select mp_return_action('${who}', '${rid}', '${action}', ${note === null ? 'null' : lit(note)}, ${restock})`, 'service');
/** The parcel's seller (or our team for our own parcel) accepts a return of the item: the customer must send it back. */
function acceptedNow(o: Order, sub: string, item: string): string {
  const rid = askReturn(sub, item, 1);
  const who = sub === o.a ? ids.sellerA : sub === o.b ? ids.sellerB : ids.support;
  assert.equal(act(who, rid, 'accept', 'Please send it back in its box'), null);
  return rid;
}
const sendBackBy = (rid: string) => db.val<string>(`select send_back_by::text from return_requests where id = '${rid}'`);
const riyadhTodayPlus = (n: number) => db.val<string>(`select ((now() at time zone 'Asia/Riyadh')::date + ${n})::text`);
const statusOf = (rid: string) => db.val<string>(`select status from return_requests where id = '${rid}'`);
const acceptedNotices = (rid: string) => db.rows<{ subject_en: string; subject_ar: string; body_en: string; body_ar: string }>(`select subject_en, subject_ar, body_en, body_ar
  from notification_outbox where template_key = 'return_accepted' and channel = 'email' and payload ->> 'return_id' = '${rid}' order by id`);

describe('R7-3: a return accepted again gets a new send-back date and its own notice', () => {
  test('escalated 35 days after acceptance, then accepted again by our team: the date runs from today, with the days set now', () => {
    const o = deliveredRecently();
    const rid = acceptedNow(o, o.a, o.items.a);
    svc(`update return_requests set accepted_at = now() - interval '35 days', send_back_by = ((now() - interval '35 days') at time zone 'Asia/Riyadh')::date + 30
         where id = '${rid}'`);
    assert.equal(act(ids.customer, rid, 'escalate', 'The seller never sent the return label'), null);
    db.exec(`update mp_settings set return_autoclose_days = 45 where id = 1`, user('owner'));
    try {
      assert.equal(act(ids.support, rid, 'accept', 'Our team accepts: please send it back now'), null);
      assert.equal(sendBackBy(rid), riyadhTodayPlus(45));
      assert.equal(db.val(`select private.return_json('${rid}', 'customer') ->> 'send_back_by'`), riyadhTodayPlus(45));
      // told again, in both languages, with the new date
      const notices = acceptedNotices(rid);
      assert.equal(notices.length, 2, JSON.stringify(notices));
      const again = notices[1];
      assert.ok(again.body_en.includes(riyadhTodayPlus(45)) && again.body_ar.includes(riyadhTodayPlus(45)), JSON.stringify(again));
      assert.match(again.body_ar, /في موعد أقصاه/);
      assert.ok(again.subject_en && /[؀-ۿ]/.test(again.subject_ar));
      // the next finish-pending run leaves it alone
      assert.ok(!(db.val<string[]>(`select mp_autoclose_returns(50) -> 'closed'`, 'service') ?? []).includes(rid));
      assert.equal(statusOf(rid), 'accepted');
    } finally {
      db.exec(`update mp_settings set return_autoclose_days = 30 where id = 1`, user('owner'));
    }
  });

  test('the reviewer\'s variant: accepted 20 days ago, escalated, accepted again today: 30 days from today, not 10', () => {
    const o = deliveredRecently();
    const rid = acceptedNow(o, o.a, o.items.a);
    svc(`update return_requests set accepted_at = now() - interval '20 days', send_back_by = ((now() - interval '20 days') at time zone 'Asia/Riyadh')::date + 30
         where id = '${rid}'`);
    assert.equal(act(ids.customer, rid, 'escalate', 'The seller never sent the return label'), null);
    assert.equal(act(ids.support, rid, 'accept', 'Our team accepts: please send it back now'), null);
    assert.equal(sendBackBy(rid), riyadhTodayPlus(30));
    assert.equal(acceptedNotices(rid).length, 2);
  });
});

// ================================================================ R7-4: goodwill per parcel, and a return it covered
describe('R7-4: goodwill on a parcel is capped; a return it already covered is finished as a zero refund', () => {
  test('600 SAR of goodwill on a 530 SAR parcel is refused, in English and Arabic; the cap is what was paid for it less what went back', async () => {
    const { o, pay } = await paidAndDelivered();
    const r = await recordGoodwill(o, pay, 'r8cap-gw-0001', 60000, o.a);
    pay.refunded -= 60000;
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body.error), /530\.00/);
    assert.match(String(r.body.error_ar), /[؀-ۿ]/);
    assert.match(String(r.body.error_ar), /530\.00/);
    // one oud (250) refunded: 280 is left on the parcel
    assert.equal((await refund(o, 'r8cap-oud-001', oneOud(o))).body.amount, 25000);
    const over = await recordGoodwill(o, pay, 'r8cap-gw-0002', 28001, o.a);
    pay.refunded -= 28001;
    assert.equal(over.status, 409, JSON.stringify(over.body));
    assert.match(String(over.body.error), /280\.00/);
    await goodwill(o, pay, 'r8cap-gw-0003', 28000, o.a);
    assert.equal(books(o).back, pay.refunded);
  });

  test('a return the goodwill already covered: no Moyasar call, no credit note; the seller\'s sale reversed, stock back, audited, the customer told', async () => {
    const { o, pay } = await paidAndDelivered();
    assert.equal(db.val(`select count(*)::int from seller_ledger where sub_order_id = '${o.a}' and kind = 'sale'`), 1, 'the sale is booked on delivery');
    await goodwill(o, pay, 'r8zero-gw-001', 53000, o.a);            // the whole parcel, in the dashboard
    const rid = askReturn(o.a, o.items.a, 2);
    assert.equal(act(ids.support, rid, 'approve', 'Approved: both bottles came back unopened', true), null);
    const stock = db.val<number>(`select stock from product_variants where id = '${s.variant}'`);
    const pv = await preview(o, { returnId: rid });
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.deepEqual([pv.body.amount_minor, pv.body.goodwill_deducted_minor, pv.body.platform_minor, pv.body.settled_by_goodwill], [0, 53000, 0, true]);
    const calls = moyasar.calls.filter((c) => c.op === 'refund').length;
    const notes = books(o).notes;
    const r = await refund(o, 'r8zero-ret-01', { returnId: rid, expectedAmount: 0 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.amount, r.body.goodwillDeducted, r.body.creditNote, r.body.settledByGoodwill], [0, 53000, null, true]);
    assert.equal(moyasar.calls.filter((c) => c.op === 'refund').length, calls, 'Moyasar is not asked');
    assert.equal(pay.refunded, 53000);
    assert.equal(books(o).notes, notes, 'no other credit note');
    const f = db.one<{ id: string; status: string; amount_minor: number; platform_minor: number; credit_note_status: string }>(
      `select id, status, amount_minor, platform_minor, credit_note_status from refunds where idempotency_key = 'r8zero-ret-01'`);
    assert.deepEqual([f.status, f.amount_minor, f.platform_minor, f.credit_note_status], ['succeeded', 0, 0, 'not_needed']);
    assert.equal(statusOf(rid), 'refunded');
    // the seller's sale is reversed as for any return (goodwill is ours: decision T); the stock comes back
    const ledger = db.rows<{ kind: string; amount_minor: number }>(`select kind, amount_minor from seller_ledger where refund_id = '${f.id}' order by kind`);
    assert.deepEqual(ledger.map((x) => [x.kind, x.amount_minor]), [['commission_refund', 12500], ['refund', -50000]]);
    assert.equal(db.val<number>(`select stock from product_variants where id = '${s.variant}'`), stock + 2);
    // in the audit log, and the customer is told the return is finished, never "refunded 0.00"
    assert.ok(db.val<number>(`select count(*)::int from audit_log where table_name = 'refunds' and row_id = '${f.id}'`) >= 1);
    assert.equal(db.val<number>(`select count(*)::int from audit_log where action = 'REFUND' and new_data ->> 'refund' = '${f.id}' and (new_data ->> 'amount_minor')::int = 0`), 1);
    assert.equal(db.val<number>(`select count(*)::int from notification_outbox where template_key = 'refund_issued' and dedupe_key = 'refund:${f.id}'`), 0);
    const told = db.rows<{ body_en: string; body_ar: string }>(`select body_en, body_ar from notification_outbox where template_key = 'return_settled' and payload ->> 'return_id' = '${rid}'`);
    assert.ok(told.length > 0 && told.every((x) => x.body_en.includes('530.00') && /[؀-ۿ]/.test(x.body_ar)), JSON.stringify(told));
    // and it is refunded once
    assert.equal((await refund(o, 'r8zero-ret-02', { returnId: rid })).status, 409);
  });

  test('...also when the goodwill given took back the whole payment: the order shows refunded, and the return still finishes', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8zero-gw-002', 53000, o.a);
    await goodwill(o, pay, 'r8zero-gw-003', 53000, o.b);
    await goodwill(o, pay, 'r8zero-gw-004', 9000, o.h);
    assert.equal(db.val(`select status from orders where id = '${o.o}'`), 'refunded');
    const rid = askReturn(o.a, o.items.a, 2);
    assert.equal(act(ids.support, rid, 'approve', 'Approved: both bottles came back', true), null);
    const r = await refund(o, 'r8zero-ret-03', { returnId: rid });
    assert.deepEqual([r.status, r.body.amount], [200, 0], JSON.stringify(r.body));
    assert.equal(statusOf(rid), 'refunded');
    creditNotesMatchTheMoney(o, pay);
  });

  test('a refund by line the goodwill covered is still refused, saying so (only a return is finished at zero)', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8zero-gw-005', 25000, o.a);
    const r = await refund(o, 'r8zero-lin-01', oneOud(o));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(String(r.body.error), /goodwill already given/);
    assert.match(String(r.body.error_ar), /[؀-ۿ]/);
  });
});

// ================================================================ the review's information items
describe('REVIEW-7 information: "Settle by hand" checks goodwill parcel by parcel; the staff guide', () => {
  test('a late completion after a retry cannot count one parcel\'s goodwill twice (goodwill on two parcels)', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r8inf-gw-0001', 2000, o.a);
    await goodwill(o, pay, 'r8inf-gw-0002', 2000, o.b);
    failNextRefund();
    assert.equal((await refund(o, 'r8inf-oud-001', oneOud(o))).status, 202);
    await reconcileFailed(refundId('r8inf-oud-001'));
    const retry = await refund(o, 'r8inf-oud-002', oneOud(o));          // the same oud again: counts A's 20 again, rightly
    assert.deepEqual([retry.status, retry.body.amount, retry.body.goodwillDeducted], [200, 23000, 2000]);
    pay.refunded += 23000;                                           // then Moyasar shows the first one made after all
    const late = await settleLate(refundId('r8inf-oud-001'));
    assert.equal(late.status, 409, JSON.stringify(late.body));
    assert.match(String(late.body.error), /counted goodwill that a later refund has counted since/);
    // what is left of A's goodwill: none counted twice, B's untouched
    assert.deepEqual(db.val(`select jsonb_agg(x order by x ->> 'free') from jsonb_array_elements(private.goodwill_free('${o.o}', '[]')) x`),
      [{ sub_order_id: o.b, free: 2000, mine: 0 }]);
  });

  test('the staff guide says what a closed return holds', () => {
    const guide = readFileSync(new URL('../../docs/run-from-claude.md', import.meta.url), 'utf8');
    assert.doesNotMatch(guide, /holds\s+nothing/);
    assert.match(guide, /closed[^.]*keeps its (?:items|units)/i);
    assert.match(guide, /zero refund|no money moves|nothing is paid back/i);
  });
});

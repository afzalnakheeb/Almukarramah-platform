// The fifth independent review (REVIEW-5), each finding reproduced as it was found, before the fix:
// R5-1 two numbers of four digits side by side ("my budget is 5000 - 7000", "3500 - 3900 knots", "6500 / 7500 g")
//      taken for a Gulf mobile written 4+4: masked in messages, refused on a shop page and blocked in listings (in the
//      server and the database);
// R5-2 after goodwill given on an order, its last refund refused as "more than what is left of the payment" (a return,
//      the whole order, a line), a line in an open return refused without saying what to do, and no way for our team to
//      close an approved return.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts } from '../functions/_shared/contact.ts';
import { textChecks } from '../functions/_shared/screening.ts';
import { type Db, freshDb, ids } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import {
  CONTACT_PROBES, EVERYDAY, EXTRA_PROBES, LISTING_TEXTS, R4_NATURAL, R4_ORDINARY, R4_PROBES, R5_CONTACT_RANGES, R5_GULF_MASK, R5_GULF_STAY, R5_LISTINGS,
  R5_RANGES,
} from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);
const untouched = (t: string) => { const c = cleanText(t, 2000); return c.text === t && c.flags.length === 0; };

before(() => {
  db = freshDb('review5');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
  env.REFUND_RECONCILE_GRACE_MINUTES = '15';
});

// ================================================================ R5-1: masking
describe('R5-1: a range of numbers is not a phone number; the Gulf mobiles still are', () => {
  test('ranges in messages and on a shop page are left alone (server) and accepted (database)', () => {
    assert.deepEqual(R5_RANGES.filter((t) => !untouched(t)).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(R5_RANGES.filter((t) => hint(t) !== null).map((t) => `${t} => ${hint(t)}`), []);
  });

  test('listings with ranges (knots, stitches, a weight) are not blocked', () => {
    const blocked = R5_LISTINGS.flatMap((d) => textChecks({ name_en: 'Rug', name_ar: 'سجادة', description_en: d, description_ar: 'سجادة' }, [])
      .map((h) => `${d}: ${h.kind} ${h.match}`));
    assert.deepEqual(blocked, []);
    assert.deepEqual(R5_LISTINGS.filter((t) => hint(t) !== null), []);
  });

  test('after a contact word, a range of round numbers or with a unit is still not a phone number', () => {
    assert.deepEqual(R5_CONTACT_RANGES.filter((t) => detectContacts(t).some((h) => h.kind === 'phone')), []);
    assert.deepEqual(R5_CONTACT_RANGES.filter((t) => hint(t) === 'phone'), []);
  });

  test('Gulf mobiles stay masked (one run of eight; 4+4 after a contact word, with a space, dash or slash); codes, orders and dates stay', () => {
    assert.deepEqual(R5_GULF_MASK.filter((t) => !cleanText(t, 2000).flags.includes('contact_phone')).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(R5_GULF_MASK.filter((t) => hint(t) !== 'phone').map((t) => `${t} => ${hint(t)}`), []);
    assert.deepEqual(R5_GULF_STAY.filter((t) => !untouched(t)), []);
    assert.deepEqual(R5_GULF_STAY.filter((t) => hint(t) !== null), []);
  });

  test('no earlier case reopens, and the server and the database agree on every text', () => {
    assert.deepEqual(R4_PROBES.filter((p) => !cleanText(p, 2000).flags.some((f) => f.startsWith('contact_'))), []);
    assert.deepEqual(R4_PROBES.filter((p) => hint(p) === null), []);
    assert.deepEqual(R4_NATURAL.filter(([p, want]) => cleanText(p, 2000).text !== want).map(([p]) => p), []);
    assert.deepEqual([...R4_ORDINARY, ...EVERYDAY].filter((t) => !untouched(t)), []);
    for (const [p, leak] of [...CONTACT_PROBES, ...EXTRA_PROBES]) assert.doesNotMatch(cleanText(p, 2000).text, leak, p);
    const texts = [...R5_RANGES, ...R5_LISTINGS, ...R5_CONTACT_RANGES, ...R5_GULF_MASK, ...R5_GULF_STAY, ...R4_PROBES, ...R4_ORDINARY, ...EVERYDAY, ...LISTING_TEXTS,
      ...CONTACT_PROBES.map(([p]) => p), ...EXTRA_PROBES.map(([p]) => p)];
    // found by both or by neither; and a phone number for both, unless it is bank details (the database reads an
    // account number's digits before its IBAN check: "SA٠٣٨٠..." is refused as a phone number there, as bank details here)
    const phone = (t: string) => detectContacts(t).some((h) => h.kind === 'phone');
    const bank = (t: string) => detectContacts(t).some((h) => h.kind === 'bank' || h.kind === 'card');
    const differ = texts.filter((t) => (!bank(t) && phone(t) !== (hint(t) === 'phone')) || (detectContacts(t).length > 0) !== (hint(t) !== null))
      .map((t) => `${t}: server ${detectContacts(t).map((h) => h.kind).join(',') || '-'}, database ${hint(t) ?? '-'}`);
    assert.deepEqual(differ, []);
  });
});

// ================================================================ R5-2: the functions (Moyasar mocked)
type Pay = { id: string; refunded: number; amount: number };
const order = (id: string) => db.one<{ status: string; refunded_minor: number }>(`select status::text, refunded_minor from orders where id = '${id}'`);
const credited = (id: string) => db.val<number>(`select coalesce(sum(total_incl_vat_minor), 0)::int from invoices where order_id = '${id}' and doc = 'credit_note'`);
const invoiced = (id: string) => db.val<number>(`select total_incl_vat_minor from invoices where order_id = '${id}' and doc = 'invoice'`);
const parcels = (id: string) => db.rows<{ refunded_minor: number }>(`select refunded_minor from sub_orders where order_id = '${id}' order by seq`).map((x) => x.refunded_minor);

/** Paid through the webhook (with its tax invoice) and delivered: seller A's oud (530), seller B's thobe (530), our dates (90). */
async function paidAndDelivered(): Promise<{ o: Order; pay: Pay }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef }) as Pay;
  const r = await invoke('moyasar-webhook', moyasarEvent(pay));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 day' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return { o, pay };
}
const refund = (o: Order, key: string, what: Record<string, unknown> = {}, as = ids.finance) =>
  invoke('refund-order', { orderId: o.o, reason: 'Came back to us', key, ...what }, { as });
const preview = (o: Order, what: Record<string, unknown> = {}, as = ids.finance) => invoke('refund-order', { action: 'preview', orderId: o.o, ...what }, { as });
/** Money given back in Moyasar's dashboard, recorded as goodwill (for a parcel, or for the order). */
async function goodwill(o: Order, pay: Pay, key: string, amount: number, subOrderId?: string) {
  pay.refunded += amount;
  const r = await invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, goodwill: true, reference: 'Moyasar dashboard, 31 Oct',
    reason: 'Goodwill: the box was dented', ...(subOrderId ? { subOrderId } : {}) }, { as: ids.finance });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
/** The two seller parcels refunded (a seller cancelled each, say): 1,060 of the 1,150 back. */
async function refundSellerParcels(o: Order, tag: string) {
  for (const [k, sub] of [[`${tag}-pa-0001`, o.a], [`${tag}-pb-0001`, o.b]] as const) {
    const r = await refund(o, k, { subOrderId: sub });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
}
const askReturn = (sub: string, item: string, q = 1) => db.val<{ id: string }>(`select mp_return_request('${ids.customer}', ${j({ sub_order_id: sub, reason: 'damaged',
  details: 'It arrived crushed in the box', lines: [{ order_item_id: item, quantity: q }] })})`, 'service').id;
const returnAction = (who: string, rid: string, action: string, note: string | null = null) =>
  db.error(`select mp_return_action('${who}', '${rid}', '${action}', ${note === null ? 'null' : lit(note)}, false)`, 'service');
const approved = (sub: string, item: string) => {
  const rid = askReturn(sub, item);
  assert.equal(returnAction(ids.support, rid, 'approve', 'Approved: crushed in transit'), null);
  return rid;
};
const returnNumber = (rid: string) => db.val<string>(`select format('R-%s-%s', o.number, r.seq) from return_requests r join orders o on o.id = r.order_id where r.id = '${rid}'`);

describe('R5-2: after goodwill, the last refund on an order is what is left of the payment', () => {
  test('"Refund this return": the items and delivery less the goodwill already given; staff see the amount before refunding', async () => {
    const { o, pay } = await paidAndDelivered();
    await refundSellerParcels(o, 'r5a');
    await goodwill(o, pay, 'r5a-gw-000001', 2000, o.h);   // 20 SAR for the dented box of dates
    const rid = approved(o.h, o.items.h);                 // then the dates come back: 60 + 30 delivery, with 70 left of the payment

    const pv = await preview(o, { returnId: rid });
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.deepEqual([pv.body.amount_minor, pv.body.lines_minor, pv.body.goodwill_deducted_minor, pv.body.payment_left_minor], [7000, 9000, 2000, 7000]);
    assert.equal(pay.refunded, 108000, 'a preview refunds nothing');

    const r = await refund(o, 'r5a-ret-00001', { returnId: rid });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.amount, r.body.goodwillDeducted], [7000, 2000]);
    // the whole payment back once: Moyasar, the order and the credit notes agree
    assert.equal(pay.refunded, o.total);
    assert.deepEqual(order(o.o), { status: 'refunded', refunded_minor: o.total });
    assert.equal(credited(o.o), invoiced(o.o));
    assert.equal(db.val(`select status from return_requests where id = '${rid}'`), 'refunded');
    assert.deepEqual(db.one(`select refunded_quantity, refunded_minor from order_items where id = '${o.items.h}'`), { refunded_quantity: 1, refunded_minor: 6000 });
    assert.deepEqual(parcels(o.o), [53000, 53000, 9000], 'the dates parcel: 20 of goodwill, then 70');
    // and never again
    const again = await refund(o, 'r5a-ret-00002', { returnId: rid });
    assert.ok(again.status >= 400, JSON.stringify(again.body));
    assert.equal(pay.refunded, o.total);
  });

  test('"Refund the order": everything left of the payment, the goodwill on the order counted', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r5b-gw-000001', 2000);        // every parcel ours, no duties: goodwill for the order
    const pv = await preview(o);
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    assert.deepEqual([pv.body.amount_minor, pv.body.goodwill_deducted_minor], [o.total - 2000, 2000]);
    const r = await refund(o, 'r5b-all-00001');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.amount, r.body.goodwillDeducted], [o.total - 2000, 2000]);
    assert.equal(pay.refunded, o.total);
    assert.deepEqual(order(o.o), { status: 'refunded', refunded_minor: o.total });
    assert.equal(credited(o.o), invoiced(o.o));
    assert.deepEqual(parcels(o.o), [53000, 53000, 9000], 'each parcel shows what was paid for it');
  });

  test('a line refund after goodwill larger than the delivery: cut the same way', async () => {
    const { o, pay } = await paidAndDelivered();
    await refundSellerParcels(o, 'r5c');
    await goodwill(o, pay, 'r5c-gw-000001', 5000, o.h);   // 50 left of the payment, the dates are 60
    const r = await refund(o, 'r5c-line-0001', { lines: [{ orderItemId: o.items.h, quantity: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.amount, r.body.goodwillDeducted], [4000, 2000]);
    assert.equal(pay.refunded, o.total);
    assert.deepEqual(order(o.o), { status: 'refunded', refunded_minor: o.total });
    assert.equal(credited(o.o), invoiced(o.o));
  });

  test('a refund that fits what is left is never cut', async () => {
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r5d-gw-000001', 2000, o.h);
    const r = await refund(o, 'r5d-par-00001', { subOrderId: o.a });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.amount, r.body.goodwillDeducted ?? 0], [53000, 0]);
  });

  test('two people refunding the same return at once, after goodwill: it is refunded once', async () => {
    const { o, pay } = await paidAndDelivered();
    await refundSellerParcels(o, 'r5e');
    await goodwill(o, pay, 'r5e-gw-000001', 2000, o.h);
    const rid = approved(o.h, o.items.h);
    const both = await Promise.all([refund(o, 'r5e-ret-a-001', { returnId: rid }), refund(o, 'r5e-ret-b-001', { returnId: rid }, ids.manager)]);
    assert.equal(both.filter((r) => r.status === 200).length, 1, JSON.stringify(both.map((r) => [r.status, r.body])));
    assert.ok(both.some((r) => r.status >= 400));
    assert.equal(pay.refunded, o.total);
    assert.deepEqual(order(o.o), { status: 'refunded', refunded_minor: o.total });
  });

  test('a preview needs a staff member who may refund, and an unknown action refunds nothing', async () => {
    const { o, pay } = await paidAndDelivered();
    assert.equal((await preview(o, {}, ids.customer)).status, 403);
    assert.equal((await preview(o, {}, ids.marketing)).status, 403);
    const bogus = await invoke('refund-order', { action: 'refund_everything', orderId: o.o, reason: 'Not a real action', key: 'r5f-bogus-0001' }, { as: ids.finance });
    assert.equal(bogus.status, 400, JSON.stringify(bogus.body));
    assert.equal(pay.refunded, 0);
    assert.equal(order(o.o).refunded_minor, 0);
  });
});

describe('R5-2: an item in an open return, and closing an approved return', () => {
  test('a line in an open return: the refusal names the return and says how to refund or close it', async () => {
    const { o } = await paidAndDelivered();
    const waiting = askReturn(o.a, o.items.a);
    const r1 = await refund(o, 'r5g-line-0001', { lines: [{ orderItemId: o.items.a, quantity: 1 }] });
    assert.equal(r1.status, 409, JSON.stringify(r1.body));
    assert.match(String(r1.body.error), new RegExp(`${returnNumber(waiting)}.*(approve|reject)`, 'i'));
    assert.match(String(r1.body.error_ar ?? r1.body.detail ?? ''), /طلب الإرجاع/);

    const ok = approved(o.h, o.items.h);
    const r2 = await refund(o, 'r5g-line-0002', { lines: [{ orderItemId: o.items.h, quantity: 1 }] });
    assert.equal(r2.status, 409, JSON.stringify(r2.body));
    assert.match(String(r2.body.error), new RegExp(returnNumber(ok)));
    assert.match(String(r2.body.error), /Refund this return/);
    assert.match(String(r2.body.error), /Close return/);
  });

  test('our team closes an approved return with a reason: the customer and the seller are told, and it holds nothing any more', async () => {
    const { o, pay } = await paidAndDelivered();
    const rid = approved(o.a, o.items.a);
    const reason = 'Settled with the customer: they kept the bottle with 20 SAR goodwill';
    assert.match(returnAction(ids.customer, rid, 'close', reason) ?? 'closed', /Not allowed/);
    assert.match(returnAction(ids.sellerA, rid, 'close', reason) ?? 'closed', /Not allowed/);
    assert.match(returnAction(ids.operations, rid, 'close', reason) ?? 'closed', /Not allowed/);
    assert.match(returnAction(ids.finance, rid, 'close', 'short') ?? 'closed', /reason/i);
    const pending = askReturn(o.h, o.items.h);
    assert.match(returnAction(ids.finance, pending, 'close', reason) ?? 'closed', /approved/i);

    assert.equal(returnAction(ids.finance, rid, 'close', reason), null);
    assert.deepEqual(db.one(`select status, staff_note, resolved_at is not null as resolved from return_requests where id = '${rid}'`),
      { status: 'closed', staff_note: reason, resolved: true });
    assert.ok(db.val<number>(`select count(*)::int from notification_outbox where template_key = 'return_closed' and order_id = '${o.o}'`) > 0, 'the customer is told');
    assert.ok(db.val<number>(`select count(*)::int from notification_outbox where template_key = 'seller_return_decided' and seller_id = '${s.A}'
      and dedupe_key like '%:closed%'`) > 0, 'the seller is told');
    assert.match(returnAction(ids.finance, rid, 'close', reason) ?? 'closed', /approved/i);
    // closed: it is not refunded through the return, and the item is no longer held by it
    const viaReturn = await refund(o, 'r5h-ret-00001', { returnId: rid });
    assert.ok(viaReturn.status >= 400, JSON.stringify(viaReturn.body));
    assert.equal(db.val(`select private.open_return_on('${o.items.a}')`), null);
    const line = await refund(o, 'r5h-line-0001', { lines: [{ orderItemId: o.items.a, quantity: 1 }] });
    assert.equal(line.status, 200, JSON.stringify(line.body));
    assert.equal(pay.refunded, 25000);
  });

  test('a return whose refund is waiting for Moyasar cannot be closed', async () => {
    const { o } = await paidAndDelivered();
    const rid = approved(o.h, o.items.h);
    // the payment read before refunding answers; the refund's answer is lost, and so is the read back after it
    moyasar.next.push({ op: 'get', do: 'ok' }, { op: 'refund', do: 'timeout' }, { op: 'get', do: 'timeout' });
    const r = await refund(o, 'r5i-ret-00001', { returnId: rid });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.match(returnAction(ids.finance, rid, 'close', 'Closing it while the refund is out') ?? 'closed', /Moyasar/);
  });
});

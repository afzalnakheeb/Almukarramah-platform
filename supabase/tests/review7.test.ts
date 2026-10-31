// Afzal's decisions on the open items of REVIEW-6 (31 October 2026), each written as a test before the change:
// * trade-off 1, "hide them again": a Gulf mobile written 4+4 (from 3, 5, 6, 7 or 9) is masked with no contact word,
//   unless both halves end in 0 or a unit or currency follows; code words and dates still exclude it;
// * trade-off 2: after a contact word, a round range is a phone number unless a unit or currency follows;
// * decision Z, "yes, deduct it": goodwill already given on a parcel comes off a later refund of that parcel, by default
//   (the switch stays owner only).
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts } from '../functions/_shared/contact.ts';
import { textChecks } from '../functions/_shared/screening.ts';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import {
  CONTACT_PROBES, EVERYDAY, EXTRA_PROBES, LISTING_TEXTS, ORDINARY, R4_NATURAL, R4_ORDINARY, R4_PROBES, R5_GULF_MASK, R5_GULF_STAY, R5_LISTINGS, R5_RANGES,
  R6_COURIER_PHONES, R6_NOTES, R7_BARE_MASK, R7_BARE_STAY, R7_CONTACT_ROUND_MASK, R7_CONTACT_UNIT_STAY,
} from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);
const masked = (t: string) => cleanText(t, 2000).flags.includes('contact_phone');
const untouched = (t: string) => { const c = cleanText(t, 2000); return c.text === t && c.flags.length === 0; };

before(() => {
  db = freshDb('review7');
  fake.db = db.name;
  s = seedShop(db);
});
after(() => db.drop());
beforeEach(() => {
  fake.reset();
  moyasar.reset();
  env.REFUND_RECONCILE_GRACE_MINUTES = '15';
});

describe('Trade-off 1 (Afzal, 31 Oct): a Gulf mobile written 4+4 is masked again, unless it is round or has a unit', () => {
  test('masked with no contact word, in the server and the database', () => {
    assert.deepEqual(R7_BARE_MASK.filter((t) => !masked(t)).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(R7_BARE_MASK.filter((t) => hint(t) !== 'phone').map((t) => `${t} => ${hint(t)}`), []);
  });

  test('round halves, a unit or currency, a code word or a date keep it readable; the R5-1 ranges and listings too', () => {
    const stay = [...R7_BARE_STAY, ...R5_RANGES, ...R5_LISTINGS];
    assert.deepEqual(stay.filter((t) => !untouched(t)).map((t) => `${t} => ${cleanText(t, 2000).text}`), []);
    assert.deepEqual(stay.filter((t) => hint(t) !== null).map((t) => `${t} => ${hint(t)}`), []);
    assert.deepEqual(R5_LISTINGS.flatMap((d) => textChecks({ name_en: 'Rug', name_ar: 'سجادة', description_en: d, description_ar: 'سجادة' }, []).map((h) => h.match)), []);
  });
});

describe('Trade-off 2 (Afzal, 31 Oct): after a contact word, a round range needs a unit or currency to stay readable', () => {
  test('"call 9910-3450" is masked; "whatsapp 5000 - 7000 riyals" is not a phone number', () => {
    assert.deepEqual(R7_CONTACT_ROUND_MASK.filter((t) => !masked(t)), []);
    assert.deepEqual(R7_CONTACT_ROUND_MASK.filter((t) => hint(t) !== 'phone'), []);
    assert.deepEqual(R7_CONTACT_UNIT_STAY.filter((t) => detectContacts(t).some((h) => h.kind === 'phone')), []);
    assert.deepEqual(R7_CONTACT_UNIT_STAY.filter((t) => hint(t) === 'phone'), []);
    // only the app's name is hidden: WhatsApp has no usernames, so the price range is not taken for one
    assert.equal(cleanText('whatsapp 5000 - 7000 riyals', 2000).text, '••• 5000 - 7000 riyals');
    assert.equal(cleanText('واتس ٥٠٠٠ - ٧٠٠٠ ريال', 2000).text, '••• ٥٠٠٠ - ٧٠٠٠ ريال');
  });

  test('every earlier set still holds, and the server and the database agree', () => {
    assert.deepEqual(R4_PROBES.filter((p) => !cleanText(p, 2000).flags.some((f) => f.startsWith('contact_'))), []);
    assert.deepEqual([...R5_GULF_MASK, ...R6_COURIER_PHONES].filter((t) => !masked(t)), []);
    assert.deepEqual(R4_NATURAL.filter(([p, want]) => cleanText(p, 2000).text !== want).map(([p]) => p), []);
    assert.deepEqual([...R4_ORDINARY, ...EVERYDAY, ...ORDINARY, ...R5_GULF_STAY].filter((t) => !untouched(t)), []);
    // the couriers' notes keep their numbers in the sent-back note only (REVIEW-7, R7-1), the "receipt 05..." one not even there
    assert.deepEqual(R6_NOTES.filter((n) => !/receipt 05/.test(n) && cleanText(n, 1000, { sentBackNote: true }).text !== n), []);
    for (const [p, leak] of [...CONTACT_PROBES, ...EXTRA_PROBES]) assert.doesNotMatch(cleanText(p, 2000).text, leak, p);
    const texts = [...R7_BARE_MASK, ...R7_BARE_STAY, ...R7_CONTACT_ROUND_MASK, ...R7_CONTACT_UNIT_STAY, ...R5_RANGES, ...R5_LISTINGS, ...R5_GULF_MASK, ...R5_GULF_STAY,
      ...R4_PROBES, ...R4_ORDINARY, ...EVERYDAY, ...LISTING_TEXTS, ...R6_NOTES, ...R6_COURIER_PHONES];
    const bank = (t: string) => detectContacts(t).some((h) => h.kind === 'bank' || h.kind === 'card');
    const differ = texts.filter((t) => (!bank(t) && detectContacts(t).some((h) => h.kind === 'phone') !== (hint(t) === 'phone'))
      || (detectContacts(t).length > 0) !== (hint(t) !== null));
    assert.deepEqual(differ, []);
  });
});

// ================================================================ decision Z (Moyasar mocked)
type Pay = { id: string; refunded: number; amount: number };
async function paidAndDelivered(): Promise<{ o: Order; pay: Pay }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef }) as Pay;
  assert.equal((await invoke('moyasar-webhook', moyasarEvent(pay))).status, 200);
  svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '2 days', delivered_at = now() - interval '1 day' where order_id = '${o.o}';
       update orders set status = 'delivered' where id = '${o.o}'`);
  return { o, pay };
}
async function goodwill(o: Order, pay: Pay, key: string, amount: number, subOrderId: string) {
  pay.refunded += amount;
  const r = await invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, goodwill: true, reference: 'Moyasar dashboard, 31 Oct',
    reason: 'Goodwill: the parcel was late', subOrderId }, { as: ids.finance });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const refundParcel = (o: Order, key: string, subOrderId: string) =>
  invoke('refund-order', { orderId: o.o, reason: 'The seller cancelled the parcel', key, subOrderId }, { as: ids.finance });

describe('Decision Z (Afzal, 31 Oct): goodwill on a parcel comes off a later refund of that parcel, by default', () => {
  test('on by default: 20 of goodwill on seller A\'s parcel, then refunding that parcel refunds 510 of its 530', async () => {
    assert.equal(db.val(`select parcel_goodwill_deducted from mp_settings where id = 1`), true);
    const { o, pay } = await paidAndDelivered();
    await goodwill(o, pay, 'r7z-gw-000001', 2000, o.a);
    const pv = await invoke('refund-order', { action: 'preview', orderId: o.o, subOrderId: o.a }, { as: ids.finance });
    assert.deepEqual([pv.body.amount_minor, pv.body.goodwill_deducted_minor, pv.body.goodwill_on_parcels_minor], [51000, 2000, 2000]);
    const r = await refundParcel(o, 'r7z-par-a-001', o.a);
    assert.deepEqual([r.status, r.body.amount, r.body.goodwillDeducted], [200, 51000, 2000]);
    assert.equal((await refundParcel(o, 'r7z-par-b-001', o.b)).body.amount, 53000, 'another parcel: in full');
    assert.equal(pay.refunded, 2000 + 51000 + 53000);
  });

  test('the switch stays owner only, and off it refunds the parcel in full', async () => {
    assert.match(db.error(`update mp_settings set parcel_goodwill_deducted = false where id = 1`, user('manager')) ?? 'changed', /owner/);
    db.exec(`update mp_settings set parcel_goodwill_deducted = false where id = 1`, user('owner'));
    try {
      const { o, pay } = await paidAndDelivered();
      await goodwill(o, pay, 'r7z-gw-000002', 2000, o.a);
      const r = await refundParcel(o, 'r7z-par-a-002', o.a);
      assert.deepEqual([r.status, r.body.amount, r.body.goodwillDeducted], [200, 53000, 0]);
    } finally {
      db.exec(`update mp_settings set parcel_goodwill_deducted = true where id = 1`, user('owner'));
    }
  });
});

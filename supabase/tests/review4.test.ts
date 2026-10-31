// The fourth independent review (REVIEW-4), each finding reproduced as it was found, before the fix:
// R4-1 recording a refund made in Moyasar, or settling a late one, twice when two people act at the same moment;
// R4-2 a phone number next to another number (an order or room number), or through a date, time or amount, or grouped
//      like a list, no longer masked (in the server and the database);
// R4-3 a goodwill credit note larger than what is left on our invoice;
// R4-4 the 8-digit mobiles of Kuwait, Qatar, Bahrain and Oman, and "501 234 567" after a contact word;
// R4-5 the carrier contract: one classifier for carrier answers, and every adapter answering a repeat with its label;
// R4-6 Moyasar's last-read figure never going back, and "(2 bottles)" not swallowed into a masked number.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { cleanText } from '../functions/_shared/aftersale.ts';
import { detectContacts } from '../functions/_shared/contact.ts';
import { type Db, freshDb, ids, user } from './lib/db.ts';
import { env, fake, invoke, moyasar, moyasarEvent } from './lib/edge.ts';
import { type Order, type Shop, seedShop, unpaidOrder } from './lib/market.ts';
import { CONTACT_PROBES, EVERYDAY, EXTRA_PROBES, LISTING_TEXTS, R4_NATURAL, R4_ORDINARY, R4_PROBES } from './lib/probes.ts';

let db: Db;
let s: Shop;
const svc = (sql: string) => db.exec(sql, 'service');
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const hint = (text: string) => db.val<string | null>(`select private.contact_hint(${lit(text)})`);

before(() => {
  db = freshDb('review4');
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

// ================================================================ R4-2, R4-4: masking
describe('R4-2, R4-4: a phone number is masked wherever it sits; everyday text is still left alone', () => {
  test('the review\'s 37 disguises and the Gulf ones are masked and flagged (server)', () => {
    const missed = R4_PROBES.filter((p) => !cleanText(p, 2000).flags.some((f) => f.startsWith('contact_')));
    assert.deepEqual(missed, []);
  });

  test('...and refused by the database check', () => {
    assert.deepEqual(R4_PROBES.filter((p) => hint(p) === null), []);
  });

  test('next to an order, room or booking number, only the phone number is masked (also "(2 bottles)" stays)', () => {
    const wrong = R4_NATURAL.map(([p, want]) => ({ p, want, got: cleanText(p, 2000).text })).filter((x) => x.got !== x.want).map((x) => `${x.p} => ${x.got}`);
    assert.deepEqual(wrong, []);
  });

  test('order numbers, codes and dates of eight digits are not taken for a Gulf mobile', () => {
    assert.deepEqual(R4_ORDINARY.filter((t) => { const c = cleanText(t, 2000); return c.text !== t || c.flags.length > 0; }), []);
    assert.deepEqual(R4_ORDINARY.filter((t) => hint(t) !== null), []);
  });

  test('everything that had to stay untouched still is, and every earlier disguise is still caught; server and database agree', () => {
    assert.deepEqual(EVERYDAY.filter((t) => { const c = cleanText(t, 2000); return c.text !== t || c.flags.length > 0; }), []);
    assert.deepEqual([...EVERYDAY, ...LISTING_TEXTS].filter((t) => hint(t) !== null), []);
    for (const [p, leak] of [...CONTACT_PROBES, ...EXTRA_PROBES]) assert.doesNotMatch(cleanText(p, 2000).text, leak, p);
    const texts = [...R4_PROBES, ...R4_NATURAL.map(([p]) => p), ...R4_ORDINARY, ...EVERYDAY, ...LISTING_TEXTS];
    const differ = texts.filter((t) => (detectContacts(t).length > 0) !== (hint(t) !== null))
      .map((t) => `${t}: server ${detectContacts(t).map((h) => h.kind).join(',') || '-'}, database ${hint(t) ?? '-'}`);
    assert.deepEqual(differ, []);
  });
});

// ================================================================ the functions (Moyasar mocked)
const order = (id: string) => db.one<{ status: string; refunded_minor: number }>(`select status, refunded_minor from orders where id = '${id}'`);
const creditNotes = (id: string) => db.val<number>(`select count(*)::int from invoices where order_id = '${id}' and doc = 'credit_note'`);
async function paidThroughWebhook(): Promise<{ o: Order; payId: string }> {
  const o = unpaidOrder(db, s);
  const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
  const r = await invoke('moyasar-webhook', moyasarEvent(pay));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { o, payId: pay.id };
}
const refundDates = (o: Order, key: string) =>
  invoke('refund-order', { orderId: o.o, reason: 'Dates arrived crushed', key, lines: [{ orderItemId: o.items.h, quantity: 1 }] }, { as: ids.finance });
async function failedRefund(o: Order, key: string): Promise<string> {
  moyasar.next.push({ op: 'refund', do: '5xx' });
  await refundDates(o, key);
  const id = db.val<string>(`select id from refunds where idempotency_key = '${key}'`);
  env.REFUND_RECONCILE_GRACE_MINUTES = '0';
  try {
    const r = await invoke('refund-order', { action: 'reconcile', refundId: id }, { as: ids.finance });
    assert.equal(r.body.state, 'failed', JSON.stringify(r.body));
  } finally {
    env.REFUND_RECONCILE_GRACE_MINUTES = '15';
  }
  return id;
}

describe('R4-1: two people recording the same money at the same moment record it once', () => {
  test('"Record a refund made in Moyasar", pressed by two people at once', async () => {
    const { o, payId } = await paidThroughWebhook();
    moyasar.payments.get(payId)!.refunded = 2000;   // 20 SAR given back in Moyasar's dashboard
    const rec = (key: string, as: string) => invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount: 2000, goodwill: true,
      reference: 'Moyasar dashboard, 31 Oct', reason: 'Goodwill for the late delivery' }, { as });
    const both = await Promise.all([rec('r4-rec-a-000001', ids.finance), rec('r4-rec-b-000001', ids.manager)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], JSON.stringify(both.map((r) => r.body)));
    assert.equal(order(o.o).refunded_minor, 2000, 'what Moyasar refunded, once');
    assert.equal(creditNotes(o.o), 1);
  });

  test('"Settle by hand" on two failed refunds, of which Moyasar completed one, by two people at once', async () => {
    const { o, payId } = await paidThroughWebhook();
    const first = await failedRefund(o, 'r4-set-a-000001');
    const second = await failedRefund(o, 'r4-set-b-000001');
    moyasar.payments.get(payId)!.refunded = 6000;   // Moyasar completed one of them late
    const settle = (id: string, as: string) => invoke('refund-order', { action: 'resolve', refundId: id, outcome: 'succeeded', reason: 'Moyasar shows 60.00 refunded on the 31st' }, { as });
    const both = await Promise.all([settle(first, ids.finance), settle(second, ids.manager)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], JSON.stringify(both.map((r) => r.body)));
    assert.equal(order(o.o).refunded_minor, 6000);
    assert.equal(creditNotes(o.o), 1);
  });
});

describe('R4-3: credit notes never go past our invoice', () => {
  /** An order whose two seller parcels the sellers invoice: our invoice is the dates and their delivery (90.00). */
  async function sellerInvoiced(): Promise<{ o: Order; payId: string }> {
    const o = unpaidOrder(db, s);
    svc(`update sub_orders set invoicer = 'seller' where id in ('${o.a}', '${o.b}')`);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total, invoiceId: o.paymentRef });
    assert.equal((await invoke('moyasar-webhook', moyasarEvent(pay))).status, 200);
    return { o, payId: pay.id };
  }
  const goodwill = (o: Order, key: string, amount: number, subOrderId?: string) => invoke('refund-order', { action: 'record_moyasar', orderId: o.o, key, amount, goodwill: true,
    reference: 'Moyasar dashboard, 31 Oct', reason: 'Goodwill given in the dashboard', ...(subOrderId ? { subOrderId } : {}) }, { as: ids.finance });

  test('goodwill on an order with parcels the sellers invoice must name its parcel', async () => {
    const { o, payId } = await sellerInvoiced();
    assert.equal(db.val(`select total_incl_vat_minor from invoices where order_id = '${o.o}' and doc = 'invoice'`), 9000);
    moyasar.payments.get(payId)!.refunded = 50000;
    const r = await goodwill(o, 'r4-gw-000001', 50000);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body.error), /parcel/i);
    // for a seller's parcel: nothing on our invoice, so no credit note of ours
    assert.equal((await goodwill(o, 'r4-gw-000002', 40000, o.a)).status, 200);
    assert.equal(creditNotes(o.o), 0);
    // for our parcel: on our credit note, never more than is left on our invoice (90.00)
    assert.equal((await goodwill(o, 'r4-gw-000003', 10000, o.h)).status, 200);
    assert.equal(db.val(`select total_incl_vat_minor from invoices where order_id = '${o.o}' and doc = 'credit_note'`), 9000);
  });

  test('goodwill on an order with duties must name its parcel', async () => {
    const o = unpaidOrder(db, s);
    svc(`update sub_orders set duties_minor = 2000, duties_mode = 'ddp' where id = '${o.b}'; update orders set total_minor = total_minor + 2000 where id = '${o.o}'`);
    const pay = moyasar.pay({ orderId: o.o, amount: o.total + 2000, invoiceId: o.paymentRef });
    assert.equal((await invoke('moyasar-webhook', moyasarEvent(pay))).status, 200);
    pay.refunded = 2000;
    assert.equal((await goodwill(o, 'r4-gw-000004', 2000)).status, 409);
  });

  test('the database refuses a credit note that would take the credits on an invoice past its total', () => {
    const o = unpaidOrder(db, s);
    svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() where id = '${o.o}'`);
    const inv = db.val<{ id: string }>(`select mp_issue_document(${lit(JSON.stringify({ doc: 'invoice', order_id: o.o, currency: 'SAR', total_excl_vat_minor: 7826, vat_minor: 1174,
      total_incl_vat_minor: 9000, total_sar_incl_vat_minor: 9000, vat_sar_minor: 1174, vat_rate_bp: 1500, fx_per_sar: 1, qr_base64: 'qr', xml: '<x/>' }))}::jsonb)`, 'service');
    const refund = (key: string, amount: number) => db.val<string>(`insert into refunds (order_id, currency, amount_minor, goodwill_minor, platform_minor, reason, idempotency_key, status, credit_note_status)
      values ('${o.o}', 'SAR', ${amount}, ${amount}, ${amount}, 'Goodwill given', '${key}', 'succeeded', 'pending') returning id`, 'service');
    const note = (rid: string, total: number) => db.error(`select mp_issue_document(${lit(JSON.stringify({ doc: 'credit_note', order_id: o.o, refund_id: rid, original_invoice_id: inv.id,
      currency: 'SAR', total_excl_vat_minor: Math.round(total / 1.15), vat_minor: total - Math.round(total / 1.15), total_incl_vat_minor: total, total_sar_incl_vat_minor: total,
      vat_sar_minor: total - Math.round(total / 1.15), vat_rate_bp: 1500, fx_per_sar: 1, qr_base64: 'qr', xml: '<x/>' }))}::jsonb)`, 'service');
    assert.equal(note(refund('r4-cn-000001', 6000), 6000), null);
    assert.match(note(refund('r4-cn-000002', 5000), 5000) ?? 'issued', /past its total|more than/i);
    assert.equal(creditNotes(o.o), 1);
  });
});

describe('R4-5: the carrier contract', () => {
  test('one classifier for carrier answers: only a refusal (a 4xx with the carrier\'s answer) is definite', async () => {
    const { carrierCall } = await import('../functions/_shared/carriers/http.ts');
    const { CarrierError } = await import('../functions/_shared/carriers/types.ts');
    const real = globalThis.fetch;
    const answer = (r: () => Promise<Response>) => { globalThis.fetch = (() => r()) as typeof fetch; };
    const outcome = async () => {
      try {
        await carrierCall('https://carrier.test/shipments', { method: 'POST', body: '{}' });
        return 'ok';
      } catch (e) {
        assert.ok(e instanceof CarrierError, String(e));
        return (e as InstanceType<typeof CarrierError>).definite ? 'definite' : 'unknown';
      }
    };
    const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    try {
      const cases: [string, () => Promise<Response>][] = [
        ['ok', json(201, { tracking_number: 'X1' })],
        ['definite', json(422, { error: 'address refused' })],
        ['definite', json(400, { error: 'weight' })],
        ['unknown', json(409, { error: 'duplicate key' })],
        ['unknown', json(503, { error: 'busy' })],
        ['unknown', async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })],
        ['unknown', async () => new Response('<html>400</html>', { status: 400 })],
        ['unknown', async () => { throw new DOMException('timeout', 'TimeoutError'); }],
        ['unknown', async () => { throw new TypeError('fetch failed'); }],
      ];
      for (const [want, r] of cases) {
        answer(r);
        assert.equal(await outcome(), want);
      }
    } finally {
      globalThis.fetch = real;
    }
  });

  test('every adapter: a repeat with the same key answers with the same label, and what it throws is a CarrierError', async () => {
    const carriers = await import('../functions/_shared/carriers/index.ts');
    await import('./lib/edge-carrier.ts');
    const { CarrierError, NotConnected } = await import('../functions/_shared/carriers/types.ts');
    const req = (key: string) => ({ idempotency_key: key, reference: 'AM-1', service_code: 'road', from: { name: 'A', phone: '+966500000000', country: 'SA', city: 'Madinah', line1: 'x' },
      to: { name: 'B', phone: '+966500000001', country: 'SA', city: 'Riyadh', line1: 'y' }, parcel: { weight_g: 500 }, ddp: false, declared_value_minor: 1000, currency: 'SAR',
      customs: [], pickup_window: null });
    const ids2 = carriers.registeredProviders();
    assert.ok(ids2.includes('sandbox') && ids2.includes('mockcarrier'), ids2.join(','));
    for (const id of ids2) {
      const a = carriers.adapterFor(id, () => 'secret');
      const one = await a.createShipment(req(`contract-${id}-1`));
      const again = await a.createShipment(req(`contract-${id}-1`));
      assert.deepEqual([again.tracking_number, again.provider_ref], [one.tracking_number, one.provider_ref], id);
      assert.notEqual((await a.createShipment(req(`contract-${id}-2`))).tracking_number, one.tracking_number, id);
    }
    // whatever an adapter throws reaches create-shipment as a CarrierError: unknown unless it is a refusal
    carriers.registerAdapter('throwing', () => ({ ...carriers.adapterFor('sandbox', () => ''), id: 'throwing', createShipment: () => Promise.reject(new TypeError('socket hang up')) }));
    const thrown = await carriers.adapterFor('throwing', () => '').createShipment(req('t-1')).catch((e) => e);
    assert.ok(thrown instanceof CarrierError && thrown.definite === false, String(thrown));
    const none = await carriers.adapterFor('not-there', () => '').createShipment(req('t-2')).catch((e) => e);
    assert.ok((none instanceof CarrierError && none.definite) || none instanceof NotConnected, String(none));
  });
});

describe('R4-6: the last figure read from Moyasar never goes back', () => {
  test('an older, lower reading does not replace a newer, higher one', () => {
    const o = unpaidOrder(db, s);
    db.exec(`select mp_note_moyasar_refunded('${o.o}', 6000)`, 'service');
    db.exec(`select mp_note_moyasar_refunded('${o.o}', 2000)`, 'service');
    assert.equal(db.val(`select refunded_minor from moyasar_refund_checks where order_id = '${o.o}'`), 6000);
  });
});

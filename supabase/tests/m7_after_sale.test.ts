// M7: after the sale. Notifications (queued, never sent), statements (the ledger, payouts, adjustments), refunds
// (staff only, worked out on the server, idempotent, partial), returns and disputes, verified-purchase reviews with
// moderation and replies, messages, seller performance; and who can read or write each new table.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type As, type Db, freshDb, ids, seedPeople, seedSellers, staffRoles, user } from './lib/db.ts';

let db: Db;
let A = '';
let B = '';
let oud = '';        // seller A, with a 12 ml option, unopened only, 7 days
let variant = '';
let thobe = '';      // seller B, made to measure: faulty only
let dates = '';      // our own product
const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);
const svc = (sql: string) => db.exec(sql, 'service');
const asUser = (k: keyof typeof ids) => user(k);
const finance = ids.finance;

type Made = { o: string; a: string; b: string; h: string; items: { a: string; b: string; h: string } };

/** An order as create-payment writes it, paid and handed on (mp_order_paid), with its tax invoice. */
function makeOrder(customer: string | null, f: { invoice?: boolean; currency?: string; fx?: number } = {}): Made {
  const currency = f.currency ?? 'SAR';
  const o = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, idempotency_key, fx_per_sar)
    values (${customer ? `'${customer}'` : 'null'}, 'buyer@test.local', '${currency}', 106000, 9000, 115000, 15000,
            '{"kind": "home", "recipient_name": "Maryam Al Harbi", "phone": "+966500000009", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}',
            'idem-' || substr(md5(random()::text), 1, 12), ${f.fx ?? 1}) returning id`, 'service');
  const sub = (seq: number, seller: string | null, kind: string, items: number, commission: number) => db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, currency, items_minor,
      shipping_minor, invoicer, vat_mode, duties_mode, from_country, to_country, handling_days, production_days, days_min, days_max, commission_minor)
    values ('${o}', ${seq}, ${seller ? `'${seller}'` : 'null'}, '${kind}', '${currency}', ${items}, 3000, 'platform', 'origin', 'none', 'SA', 'SA', 2, 0, 3, 5, ${commission}) returning id`, 'service');
  const a = sub(1, A, 'marketplace', 50000, 12500);
  const b = sub(2, B, 'marketplace', 50000, 12500);
  const h = sub(3, null, 'house', 6000, 0);
  const line = (s: string, product: string, v: string | null, name: string, unit: number, q: number, seller: string | null, comm: number | null, policy: string, window: number) =>
    db.val<string>(`insert into order_items (order_id, sub_order_id, product_id, variant_id, variant_label, name_en, name_ar, unit_price_minor, quantity, line_total_minor,
        seller_id, commission_bps, commission_minor, return_policy, return_window_days, vat_rate_bp, custom)
      values ('${o}', '${s}', '${product}', ${v ? `'${v}'` : 'null'}, ${v ? `'12 ml / ١٢ مل'` : 'null'}, '${name}', '${name} ar', ${unit}, ${q}, ${unit * q},
              ${seller ? `'${seller}'` : 'null'}, ${comm === null ? 'null' : 2500}, ${comm === null ? 'null' : comm}, '${policy}', ${window}, 1500,
              ${policy === 'faulty_only' && seller ? `'{"measurements": {"chest": 104}}'` : 'null'}) returning id`, 'service');
  const items = {
    a: line(a, oud, variant, 'Royal oud', 25000, 2, A, 12500, 'unopened_only', 7),
    b: line(b, thobe, null, 'Thobe', 50000, 1, B, 12500, 'faulty_only', 14),
    h: line(h, dates, null, 'Ajwa dates', 6000, 1, null, null, 'standard', 14),
  };
  svc(`update orders set status = 'paid', payment_id = 'pay_' || substr(md5(random()::text), 1, 10), paid_at = now() where id = '${o}'`);
  svc(`select mp_order_paid('${o}')`);
  if (f.invoice !== false) {
    svc(`insert into invoices (number, icv, order_id, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
         values ('INV-T-' || substr(md5(random()::text), 1, 8), (select coalesce(max(icv), 0) + 1 from invoices), '${o}', '${currency}', 100000, 15000, 115000, 115000, 15000, 'qr')`);
  }
  return { o, a, b, h, items };
}

/** Delivered (days ago): the sub-order trigger books the seller's sale and queues the notifications. */
function deliver(sub: string, daysAgo = 0) {
  svc(`update sub_orders set status = 'delivered', shipped_at = now() - interval '${daysAgo + 1} days', delivered_at = now() - interval '${daysAgo} days' where id = '${sub}'`);
}
const prepare = (order: string, p: Record<string, unknown>, who = finance) =>
  db.val<Record<string, any>>(`select mp_prepare_refund('${order}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb, '${who}')`, 'service');
const complete = (refund: string, ok = true) => db.val<Record<string, any>>(`select mp_complete_refund('${refund}', ${ok}, 'moyasar:test', ${ok ? 'null' : `'card expired'`})`, 'service');
const returnRequest = (who: string, p: Record<string, unknown>) =>
  db.val<Record<string, any>>(`select mp_return_request('${who}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`, 'service');
const returnAction = (who: string, r: string, action: string, note?: string, restock?: boolean) =>
  db.val<Record<string, any>>(`select mp_return_action('${who}', '${r}', '${action}', ${note ? `'${note}'` : 'null'}, ${restock === undefined ? 'null' : restock})`, 'service');
const review = (who: string, p: Record<string, unknown>) =>
  db.val<Record<string, any>>(`select mp_submit_review('${who}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`, 'service');
const post = (who: string, p: Record<string, unknown>) =>
  db.val<{ thread_id: string; message_id: number }>(`select mp_post_message('${who}', '${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`, 'service');
const outbox = (where: string) => db.rows<{ template_key: string; channel: string; subject_en: string; subject_ar: string; body_en: string; body_ar: string; lang: string }>(
  `select template_key, channel, subject_en, subject_ar, body_en, body_ar, lang from notification_outbox where ${where} order by id`);

let first: Made;

before(() => {
  db = freshDb('m7');
  seedPeople(db);
  ({ A, B } = seedSellers(db));
  db.exec(`insert into seller_categories (seller_id, category_id, status) values ('${B}', '${cat('thobes')}', 'approved')`, 'service');
  oud = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('royal-oud', 'Royal oud', 'دهن عود ملكي', 25000, '${A}', '${cat('oud-oils')}') returning id`, user('sellerA'));
  variant = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${oud}', '12 ml', '١٢ مل', 10) returning id`, user('sellerA'));
  thobe = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, made_to_measure, stock) values ('thobe', 'Thobe', 'ثوب', 50000, '${B}', '${cat('thobes')}', true, 0) returning id`, user('sellerB'));
  db.exec(`update products set listing_status = 'approved', is_active = true where id in ('${oud}', '${thobe}')`, 'service');
  dates = db.val<string>(`select id from products where slug = 'ajwa-dates-1kg'`);
  svc(`update profiles set full_name = 'Maryam Al Harbi', language = 'en' where id = '${ids.customer}';
       update profiles set language = 'ar' where id = '${ids.sellerA}';
       update seller_private set iban = 'SA0380000000608010167519' where seller_id = '${A}'`);
  first = makeOrder(ids.customer);
});
after(() => db.drop());

describe('notifications (queued, never sent)', () => {
  test('payment: the customer is told (email and in the app) and each seller has a new order, in English and Arabic', () => {
    const conf = outbox(`template_key = 'order_confirmed' and order_id = '${first.o}'`);
    assert.deepEqual(conf.map((x) => x.channel), ['email', 'in_app']);
    assert.match(conf[0].subject_en, /^Your order AM-\d+ is confirmed$/);
    assert.match(conf[0].subject_ar, /^تم تأكيد طلبك AM-\d+$/);
    assert.match(conf[0].body_en, /SAR 1,150\.00/);
    assert.match(conf[0].body_ar, /1,150\.00 ر\.س/);
    assert.equal(conf[0].lang, 'en', 'the customer\'s language');
    assert.doesNotMatch(conf[0].body_en + conf[0].body_ar, /\{\{/, 'every placeholder filled');
    const forA = outbox(`template_key = 'seller_new_order' and seller_id = '${A}'`);
    assert.deepEqual(forA.map((x) => x.channel), ['email', 'push', 'in_app']);
    assert.match(forA[0].body_en, /Riyadh ordered 2 × Royal oud\. .*You receive SAR 375\.00 after commission/);
    assert.match(forA[0].body_ar, /2 × Royal oud ar/);
    assert.equal(forA[0].lang, 'ar');
    assert.equal(outbox(`template_key = 'seller_new_order' and seller_id = '${B}'`).length, 3);
    assert.equal(db.val(`select count(*)::int from notification_outbox where status <> 'queued'`), 0, 'nothing is sent');
  });

  test('in-app notifications: each recipient reads their own; our team reads the outbox', () => {
    const mine = db.val<{ unread: number; items: { key: string }[] }>(`select my_notifications()`, asUser('customer'));
    assert.ok(mine.items.some((x) => x.key === 'order_confirmed'));
    assert.equal(db.val<{ items: unknown[] }>(`select my_notifications()`, asUser('customer2')).items.length, 0);
    assert.ok(db.val<{ items: { key: string }[] }>(`select my_notifications('${A}')`, asUser('sellerA')).items.some((x) => x.key === 'seller_new_order'));
    assert.match(db.error(`select my_notifications('${A}')`, asUser('sellerB')) ?? '', /Not allowed/);
    assert.equal(db.rows(`select id from notification_outbox where channel = 'email'`, asUser('customer')).length, 0, 'emails are not the customer\'s to read');
    assert.equal(db.rows(`select id from notification_outbox where seller_id = '${A}'`, asUser('sellerB')).length, 0);
    assert.ok(db.rows(`select id from notification_outbox`, asUser('support')).length > 5);
    assert.equal(db.rows(`select id from notification_outbox where audience <> 'staff'`, asUser('marketing')).length, 0);
    assert.match(db.error(`select 1 from notification_outbox`, 'anon') ?? '', /permission denied/);
    const n = db.val<number>(`select mp_mark_notifications_read()`, asUser('customer'));
    assert.ok(n >= 1);
    assert.equal(db.val<{ unread: number }>(`select my_notifications()`, asUser('customer')).unread, 0);
  });

  test('a guest order is told by email only; the same event never queues twice', () => {
    const g = makeOrder(null);
    assert.deepEqual(outbox(`template_key = 'order_confirmed' and order_id = '${g.o}'`).map((x) => x.channel), ['email']);
    svc(`update orders set status = 'pending_payment' where id = '${g.o}'; update orders set status = 'paid' where id = '${g.o}'`);
    assert.equal(outbox(`template_key = 'order_confirmed' and order_id = '${g.o}'`).length, 1);
  });

  test('templates: service messages only; owner and manager change the wording, never the key', () => {
    assert.match(db.error(`insert into notification_templates (key, audience, channels, purpose, subject_en, subject_ar, body_en, body_ar)
      values ('eid_sale', 'customer', '{email}', 'marketing', 'Eid offers', 'عروض العيد', 'Our Eid offers', 'عروض العيد')`) ?? '', /check/);
    assert.equal(db.count(`update notification_templates set subject_en = 'Your parcel {{number}} is on the way' where key = 'parcel_shipped'`, asUser('manager')), 1);
    assert.equal(db.count(`update notification_templates set subject_en = 'x' where key = 'parcel_shipped'`, asUser('support')), 0);
    assert.match(db.error(`update notification_templates set key = 'other' where key = 'parcel_shipped'`, asUser('owner')) ?? '', /Only the wording/);
    assert.match(db.error(`insert into notification_outbox (template_key, channel, audience, user_id, subject_en, subject_ar, body_en, body_ar)
      values ('parcel_shipped', 'in_app', 'customer', '${ids.customer}', 'x', 'x', 'x', 'x')`, asUser('customer')) ?? '', /permission denied/);
    assert.equal(db.rows(`select key from notification_templates`, asUser('customer')).length, 0);
    for (const k of db.rows<{ key: string; subject_ar: string; body_ar: string }>(`select key, subject_ar, body_ar from notification_templates`)) {
      assert.match(k.subject_ar + k.body_ar, /[؀-ۿ]/, `${k.key} has Arabic`);
    }
  });
});

describe('statements', () => {
  test('delivery books the sale less commission, payable after the return window and the hold', () => {
    deliver(first.a);
    const rows = db.rows<{ kind: string; amount_sar_minor: number; available_in: number }>(`select kind, amount_sar_minor,
      available_on - (now() at time zone 'Asia/Riyadh')::date as available_in from seller_ledger where sub_order_id = '${first.a}' order by id`);
    assert.deepEqual(rows, [{ kind: 'sale', amount_sar_minor: 50000, available_in: 10 }, { kind: 'commission', amount_sar_minor: -12500, available_in: 10 }],
      '7-day window + 3 days hold');
    deliver(first.a);
    assert.equal(db.val(`select count(*)::int from seller_ledger where sub_order_id = '${first.a}'`), 2, 'booked once');
    const bal = db.val<{ balance_sar_minor: number; available_sar_minor: number; held_sar_minor: number }>(`select seller_balance('${A}')`, asUser('sellerA'));
    assert.deepEqual([bal.balance_sar_minor, bal.available_sar_minor, bal.held_sar_minor], [37500, 0, 37500]);
    assert.equal(db.rows(`select 1 from seller_ledger where seller_id = '${A}'`, asUser('sellerB')).length, 0);
    assert.match(db.error(`select seller_balance('${A}')`, asUser('sellerB')) ?? '', /Not allowed/);
    assert.match(db.error(`select seller_balance('${A}')`, asUser('support')) ?? '', /Not allowed/);
    assert.match(db.error(`update seller_ledger set amount_minor = 1`, 'service') ?? '', /never edited/);
    const parcel = outbox(`template_key = 'parcel_delivered' and order_id = '${first.o}'`);
    assert.equal(parcel.length, 2);
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'review_invite' and send_after > now() + interval '2 days'`), 1, 'one invitation per item, later');
  });

  test('a sale in another currency is booked in SAR at the checkout rate', () => {
    const gbp = makeOrder(ids.customer2, { currency: 'GBP', fx: 0.21 });
    deliver(gbp.b);
    assert.deepEqual(db.rows(`select kind, currency, amount_minor, amount_sar_minor from seller_ledger where sub_order_id = '${gbp.b}' order by id`),
      [{ kind: 'sale', currency: 'GBP', amount_minor: 50000, amount_sar_minor: 238095 }, { kind: 'commission', currency: 'GBP', amount_minor: -12500, amount_sar_minor: -59524 }]);
  });

  test('payouts are recorded by finance, never more than is available; adjustments need a reason; a returned transfer is owed again', () => {
    const old = makeOrder(ids.customer2);
    deliver(old.a, 20);                              // past its window and hold
    const before = db.val<{ available_sar_minor: number }>(`select seller_balance('${A}')`, asUser('finance'));
    assert.equal(before.available_sar_minor, 37500);
    assert.match(db.error(`select mp_record_payout('${A}', 40000, 'TRX-1001', current_date)`, asUser('finance')) ?? '', /Only 37500 halalas/);
    assert.match(db.error(`select mp_record_payout('${A}', 30000, 'TRX-1001', current_date)`, asUser('sellerA')) ?? '', /Not allowed/);
    assert.match(db.error(`select mp_record_payout('${A}', 30000, 'TRX-1001', current_date)`, asUser('support')) ?? '', /Not allowed/);
    assert.match(db.error(`select mp_record_payout('${A}', 30000, 'TRX-1001', current_date - 60)`, asUser('finance')) ?? '', /last 31 days/);
    const paid = db.val<{ id: string; available_sar_minor: number }>(`select mp_record_payout('${A}', 30000, 'TRX-1001', (now() at time zone 'Asia/Riyadh')::date, 'October')`, asUser('finance'));
    assert.equal(paid.available_sar_minor, 7500);
    assert.deepEqual(db.one(`select iban_last4, status from seller_payouts where id = '${paid.id}'`), { iban_last4: '7519', status: 'paid' });
    assert.match(outbox(`template_key = 'seller_payout_recorded' and seller_id = '${A}'`)[0].body_en, /SAR 300\.00 to your account ending 7519 .*TRX-1001/);
    assert.match(db.error(`update seller_payouts set amount_sar_minor = 1 where id = '${paid.id}'`, 'service') ?? '', /never changes/);
    assert.match(db.error(`select mp_ledger_adjust('${A}', -500, 'x')`, asUser('finance')) ?? '', /reason/);
    db.exec(`select mp_ledger_adjust('${A}', -500, 'Packaging supplies we sent, October')`, asUser('finance'));
    db.exec(`select mp_reverse_payout('${paid.id}', 'The bank returned the transfer: account closed')`, asUser('finance'));
    assert.match(db.error(`select mp_reverse_payout('${paid.id}', 'again please')`, asUser('finance')) ?? '', /already reversed/);
    type St = { opening_sar_minor: number; closing_sar_minor: number; totals: Record<string, number>; entries: { kind: string }[]; payouts: unknown[]; months: string[] };
    const now = db.val<St>(`select seller_statement('${A}')`, asUser('sellerA'));
    assert.equal(now.closing_sar_minor, 74500, 'the balance');
    assert.equal(now.opening_sar_minor + now.totals.net, now.closing_sar_minor);
    // the months so far (the older sale may fall in the month before), added up
    const all = now.months.map((m) => db.val<St>(`select seller_statement('${A}', '${m}')`, asUser('sellerA')));
    const sum = (k: string) => all.reduce((n, x) => n + x.totals[k], 0);
    assert.deepEqual(['sales', 'commission', 'refunds', 'adjustments', 'payouts', 'net', 'orders'].map(sum), [100000, -25000, 0, -500, 0, 74500, 2]);
    assert.deepEqual(all.flatMap((x) => x.entries.map((e) => e.kind)).sort(), ['adjustment', 'commission', 'commission', 'payout', 'payout_reversal', 'sale', 'sale']);
    assert.equal(all.reduce((n, x) => n + x.payouts.length, 0), 1);
    const months = db.rows<{ seller_id: string; closing_sar_minor: number }>(`select seller_id, closing_sar_minor from seller_statement_months order by month desc`, asUser('sellerA'));
    assert.deepEqual(months[0], { seller_id: A, closing_sar_minor: 74500 });
    assert.ok(months.every((m) => m.seller_id === A));
    assert.equal(db.rows(`select 1 from seller_statement_months`, asUser('customer')).length, 0);
    assert.ok(db.rows<{ seller_id: string }>(`select seller_id from seller_statement_months`, asUser('finance')).some((m) => m.seller_id === B), 'finance sees every seller');
  });
});

describe('refunds (staff only, worked out on the server)', () => {
  test('who may refund; the tax invoice must exist for what we invoiced', () => {
    assert.match(db.error(`select mp_prepare_refund('${first.o}', '{"key": "rf-test-0001", "reason": "test"}'::jsonb, '${ids.marketing}')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_prepare_refund('${first.o}', '{"key": "rf-test-0001", "reason": "test"}'::jsonb, '${finance}')`, asUser('finance')) ?? '', /permission denied/);
    const noInvoice = makeOrder(ids.customer2, { invoice: false });
    assert.match(db.error(`select mp_prepare_refund('${noInvoice.o}', '{"key": "rf-test-0002", "reason": "Customer asked"}'::jsonb, '${finance}')`, 'service') ?? '', /tax invoice .* not been issued/);
  });

  test('a partial refund: the amounts come from the lines; the same key never refunds twice; a failure frees the amount', () => {
    const o = makeOrder(ids.customer2);
    const r1 = prepare(o.o, { key: 'rf-partial-0001', reason: 'One bottle leaked', lines: [{ order_item_id: o.items.a, quantity: 1 }] });
    assert.equal(r1.amount_minor, 25000);
    assert.equal(r1.platform_minor, 25000);
    assert.equal(r1.duplicate, false);
    assert.equal(prepare(o.o, { key: 'rf-partial-0001', reason: 'One bottle leaked', lines: [{ order_item_id: o.items.a, quantity: 1 }] }).duplicate, true);
    // while it is processing, the bottle cannot be refunded again
    assert.match(db.error(`select mp_prepare_refund('${o.o}', '{"key": "rf-partial-0002", "reason": "again", "lines": [{"order_item_id": "${o.items.a}", "quantity": 2}]}'::jsonb, '${finance}')`, 'service') ?? '', /Only 1 of that item/);
    complete(r1.id, false);
    assert.equal(db.val(`select status from refunds where id = '${r1.id}'`), 'failed');
    const r2 = prepare(o.o, { key: 'rf-partial-0003', reason: 'Both bottles leaked', lines: [{ order_item_id: o.items.a, quantity: 2 }] });
    assert.equal(r2.amount_minor, 50000);
    const done = complete(r2.id);
    assert.equal(done.status, 'succeeded');
    assert.equal(done.credit_note_status, 'pending');
    assert.deepEqual(db.one(`select refunded_minor, status::text from orders where id = '${o.o}'`), { refunded_minor: 50000, status: 'paid' });
    assert.deepEqual(db.one(`select refunded_quantity, refunded_minor from order_items where id = '${o.items.a}'`), { refunded_quantity: 2, refunded_minor: 50000 });
    assert.deepEqual(complete(r2.id).status, 'succeeded', 'completing twice changes nothing');
    assert.equal(db.val(`select refunded_minor from orders where id = '${o.o}'`), 50000);
    assert.match(outbox(`template_key = 'refund_issued' and order_id = '${o.o}'`)[0].body_en, /refunded SAR 500\.00 for order AM-\d+/);
    assert.match(db.error(`update refunds set amount_minor = 1 where id = '${r2.id}'`, 'service') ?? '', /never change/);
    assert.match(db.error(`delete from refunds where id = '${r2.id}'`, 'service') ?? '', /never deleted/);
    assert.match(db.error(`update refund_lines set amount_minor = 1 where refund_id = '${r2.id}'`, 'service') ?? '', /never edited/);
    // the credit note is attached once issued
    const cn = db.val<string>(`insert into invoices (number, icv, order_id, doc, original_invoice_id, reason, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
      values ('CN-T-1', 9001, '${o.o}', 'credit_note', (select id from invoices where order_id = '${o.o}' and doc = 'invoice'), 'Both bottles leaked', 'SAR', 43478, 6522, 50000, 50000, 6522, 'qr') returning id`, 'service');
    db.exec(`select mp_attach_credit_note('${r2.id}', '${cn}')`, 'service');
    assert.equal(db.val(`select credit_note_status from refunds where id = '${r2.id}'`), 'issued');
    assert.match(db.error(`select mp_attach_credit_note('${r2.id}', '${cn}')`, 'service') ?? '', /not attached/);
  });

  test('a cancelled parcel: everything on it, delivery and duties included; then nothing is left', () => {
    const o = makeOrder(ids.customer2);
    db.exec(`select seller_cancel_sub_order('${o.b}', 'The tailor is unwell this month, sorry.')`, asUser('sellerB'));
    assert.match(outbox(`template_key = 'parcel_cancelled' and order_id = '${o.o}'`)[0].body_en, /could not fulfil AM-\d+-2: The tailor is unwell/);
    assert.equal(db.val<{ cancelled: unknown[] }>(`select admin_refund_queue()`, asUser('finance')).cancelled.length >= 1, true);
    const r = prepare(o.o, { key: 'rf-cancel-0001', reason: 'Seller cancelled', sub_order_id: o.b });
    assert.equal(r.amount_minor, 53000, 'thobe 500 + delivery 30');
    complete(r.id);
    assert.equal(db.val(`select needs_refund from sub_orders where id = '${o.b}'`), false);
    assert.equal(db.val(`select count(*)::int from seller_ledger where sub_order_id = '${o.b}'`), 0, 'never delivered: nothing on the statement');
    assert.match(db.error(`select mp_prepare_refund('${o.o}', '{"key": "rf-cancel-0002", "reason": "again", "sub_order_id": "${o.b}"}'::jsonb, '${finance}')`, 'service') ?? '', /Nothing left/);
  });

  test('everything left on the order; a refund after delivery comes off the seller\'s statement with the commission given back', () => {
    const o = makeOrder(ids.customer2);
    deliver(o.a);
    const r = prepare(o.o, { key: 'rf-full-0001', reason: 'Order cancelled by agreement' });
    assert.equal(r.amount_minor, 115000);
    complete(r.id);
    assert.equal(db.val(`select status from orders where id = '${o.o}'`), 'refunded');
    assert.deepEqual(db.rows(`select kind, amount_sar_minor from seller_ledger where sub_order_id = '${o.a}' order by id`),
      [{ kind: 'sale', amount_sar_minor: 50000 }, { kind: 'commission', amount_sar_minor: -12500 }, { kind: 'refund', amount_sar_minor: -50000 }, { kind: 'commission_refund', amount_sar_minor: 12500 }]);
    assert.match(db.error(`select mp_prepare_refund('${o.o}', '{"key": "rf-full-0002", "reason": "again"}'::jsonb, '${finance}')`, 'service') ?? '', /Already refunded/);
  });
});

describe('returns and disputes', () => {
  let ret = '';
  test('when a return can be asked for: delivered, within the policy and window, for what was bought', () => {
    const o = first;
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.b}", "reason": "faulty", "details": "The seam is open at the shoulder", "lines": [{"order_item_id": "${o.items.b}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /once the parcel has been delivered/);
    deliver(o.b);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.b}", "reason": "changed_mind", "lines": [{"order_item_id": "${o.items.b}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /only be returned if it is faulty/, 'made to measure');
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.b}", "reason": "faulty", "details": "bad", "lines": [{"order_item_id": "${o.items.b}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /what is wrong/);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.a}", "reason": "changed_mind", "lines": [{"order_item_id": "${o.items.a}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /only be returned unopened/);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.a}", "reason": "changed_mind", "unopened": true, "lines": [{"order_item_id": "${o.items.a}", "quantity": 3}]}'::jsonb)`, 'service') ?? '', /Only 2 of/);
    assert.match(db.error(`select mp_return_request('${ids.customer2}', '{"sub_order_id": "${o.a}", "reason": "faulty", "details": "Leaking cap on arrival", "lines": [{"order_item_id": "${o.items.a}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.a}", "reason": "faulty", "details": "Leaking cap on arrival", "photos": ["${ids.owner}"], "lines": [{"order_item_id": "${o.items.a}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /photo check/);
    const photo = db.val<string>(`insert into media_assets (user_id, kind, bucket, path, mime, bytes, sha256, status) values ('${ids.customer}', 'return_photo', 'customer-uploads',
      '${ids.customer}/media/leak.jpg', 'image/jpeg', 1000, repeat('a', 64), 'passed') returning id`, 'service');
    const r = returnRequest(ids.customer, { sub_order_id: o.a, reason: 'changed_mind', unopened: true, details: 'Call me on 0500000000', photos: [photo],
      lines: [{ order_item_id: o.items.a, quantity: 1 }] });
    ret = r.id;
    assert.match(r.number, /^R-\d+-1$/);
    assert.equal(r.status, 'requested');
    assert.equal(r.kind, 'return');
    assert.equal(r.photos.length, 1);
    assert.equal(db.val(`select respond_by::date - current_date from return_requests where id = '${ret}'`), 3);
    assert.match(outbox(`template_key = 'seller_return_requested' and seller_id = '${A}'`)[0].body_en, /return items from AM-\d+-1 \(changed their mind\)\. Please answer by \d{4}-\d\d-\d\d/);
    assert.match(outbox(`template_key = 'return_requested' and order_id = '${o.o}'`)[0].body_ar, /سيرد Oud House A قبل/);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${o.a}", "reason": "changed_mind", "unopened": true, "lines": [{"order_item_id": "${o.items.a}", "quantity": 2}]}'::jsonb)`, 'service') ?? '', /Only 1 of/, 'one is already in a return');
  });

  test('who sees a return; the seller accepts, confirms it came back, and our team refunds it', () => {
    assert.equal(db.rows(`select id from return_requests where id = '${ret}'`, asUser('sellerA')).length, 1);
    assert.equal(db.rows(`select id from return_requests where id = '${ret}'`, asUser('sellerB')).length, 0);
    assert.equal(db.rows(`select id from return_requests where id = '${ret}'`, asUser('customer2')).length, 0);
    assert.equal(db.rows(`select order_item_id from return_lines where return_id = '${ret}'`, asUser('customer')).length, 1);
    assert.equal(db.rows(`select 1 from storage.objects`, asUser('sellerA')).length, 0);
    const forSeller = db.val<{ customer: string; photos: unknown[] }[]>(`select seller_returns('${A}')`, asUser('sellerA'));
    assert.equal(forSeller[0].customer, 'Maryam', 'first name only');
    assert.match(db.error(`select seller_returns('${A}')`, asUser('sellerB')) ?? '', /Not allowed/);
    assert.match(db.error(`select mp_return_action('${ids.sellerB}', '${ret}', 'accept')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_return_action('${ids.customer}', '${ret}', 'approve')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_return_action('${ids.sellerA}', '${ret}', 'received')`, 'service') ?? '', /This return is requested/);
    assert.equal(returnAction(ids.sellerA, ret, 'accept', 'Please send it back in its box').status, 'accepted');
    assert.match(db.error(`select mp_prepare_refund('${first.o}', '{"key": "rf-ret-0001", "reason": "Return", "return_id": "${ret}"}'::jsonb, '${finance}')`, 'service') ?? '', /Approve the return/);
    assert.equal(returnAction(ids.sellerA, ret, 'received', undefined, true).status, 'approved');
    assert.ok(outbox(`template_key = 'staff_refund_needed'`).length >= 1);
    const stock = db.val<number>(`select stock from product_variants where id = '${variant}'`);
    const r = prepare(first.o, { key: 'rf-ret-0001', reason: 'Return R-1', return_id: ret });
    assert.equal(r.amount_minor, 25000, 'one bottle; the rest of the parcel stays, so no delivery refund');
    assert.equal(r.restock, true);
    complete(r.id);
    assert.equal(db.val(`select status from return_requests where id = '${ret}'`), 'refunded');
    assert.equal(db.val(`select stock from product_variants where id = '${variant}'`), stock + 1, 'back in stock');
    assert.deepEqual(db.rows(`select kind, amount_sar_minor from seller_ledger where refund_id = '${r.id}' order by id`),
      [{ kind: 'refund', amount_sar_minor: -25000 }, { kind: 'commission_refund', amount_sar_minor: 6250 }]);
  });

  test('a dispute: the seller declines with a reason, the customer asks us, our team decides', () => {
    const o = makeOrder(ids.customer);
    deliver(o.b);
    const r = returnRequest(ids.customer, { sub_order_id: o.b, reason: 'not_as_described', details: 'The collar is not the one I chose', lines: [{ order_item_id: o.items.b, quantity: 1 }] });
    assert.match(db.error(`select mp_return_action('${ids.customer}', '${r.id}', 'escalate', 'I disagree completely')`, 'service') ?? '', /once the seller has answered/);
    assert.match(db.error(`select mp_return_action('${ids.sellerB}', '${r.id}', 'decline')`, 'service') ?? '', /Tell the customer why/);
    const d = returnAction(ids.sellerB, r.id, 'decline', 'The collar matches the band collar chosen at checkout');
    assert.equal(d.status, 'declined');
    assert.equal(d.can_escalate, true);
    assert.match(outbox(`template_key = 'return_declined' and order_id = '${o.o}'`)[0].body_en, /within 7 days/);
    const e = returnAction(ids.customer, r.id, 'escalate', 'I chose the classic collar, my screenshot shows it');
    assert.equal(e.status, 'escalated');
    assert.ok(outbox(`template_key = 'staff_return_escalated'`).length >= 1);
    assert.match(db.error(`select mp_return_action('${ids.sellerB}', '${r.id}', 'accept')`, 'service') ?? '', /This return is escalated/);
    assert.match(db.error(`select mp_return_action('${ids.marketing}', '${r.id}', 'approve')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_return_action('${ids.support}', '${r.id}', 'reject')`, 'service') ?? '', /Explain/);
    const a = returnAction(ids.support, r.id, 'approve', 'We checked the order: the classic collar was chosen.');
    assert.equal(a.status, 'approved');
    assert.match(outbox(`template_key = 'seller_return_decided' and seller_id = '${B}'`)[0].body_en, /has approved the return/);
    const admin = db.val<{ status: string; flags: unknown }[]>(`select admin_returns('approved')`, asUser('operations'));
    assert.ok(admin.some((x) => x.status === 'approved'));
    assert.match(db.error(`select admin_returns()`, asUser('marketing')) ?? '', /Not allowed/);
  });

  test('a parcel that never came: after its delivery window, a refund without sending anything back', () => {
    const o = makeOrder(ids.customer);
    svc(`update sub_orders set status = 'shipped', shipped_at = now() - interval '20 days', accepted_at = now() - interval '20 days' where id = '${o.h}'`);
    const r = returnRequest(ids.customer, { sub_order_id: o.h, reason: 'not_received', lines: [{ order_item_id: o.items.h, quantity: 1 }] });
    assert.equal(r.kind, 'refund_only');
    assert.equal(r.respond_by, null, 'our own products: our team answers');
    assert.ok(outbox(`template_key = 'staff_return_requested'`).length >= 1);
    assert.equal(returnAction(ids.operations, r.id, 'accept').status, 'approved', 'nothing to send back');
    const fresh = makeOrder(ids.customer);
    svc(`update sub_orders set status = 'shipped', shipped_at = now(), accepted_at = now() where id = '${fresh.h}'`);
    assert.match(db.error(`select mp_return_request('${ids.customer}', '{"sub_order_id": "${fresh.h}", "reason": "not_received", "lines": [{"order_item_id": "${fresh.items.h}", "quantity": 1}]}'::jsonb)`, 'service') ?? '', /still within its delivery time/);
    deliver(o.a);
    const w = returnRequest(ids.customer, { sub_order_id: o.a, reason: 'damaged', details: 'The box was crushed in transit', lines: [{ order_item_id: o.items.a, quantity: 1 }] });
    assert.equal(returnAction(ids.customer, w.id, 'withdraw').status, 'withdrawn');
    assert.match(db.error(`select mp_return_action('${ids.customer}', '${w.id}', 'escalate', 'changed my mind again')`, 'service') ?? '', /once the seller has answered/);
  });
});

describe('reviews', () => {
  test('verified purchases only: delivered, the customer\'s own item, once per item', () => {
    const o = makeOrder(ids.customer2);
    assert.match(db.error(`select mp_submit_review('${ids.customer2}', '{"order_item_id": "${o.items.a}", "rating": 5}'::jsonb)`, 'service') ?? '', /once it has been delivered/);
    assert.match(db.error(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${first.items.h}", "rating": 5}'::jsonb)`, 'service') ?? '', /once it has been delivered/);
    assert.match(db.error(`select mp_submit_review('${ids.customer2}', '{"order_item_id": "${first.items.a}", "rating": 5}'::jsonb)`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${first.items.a}", "rating": 6}'::jsonb)`, 'service') ?? '', /1 to 5/);
    const r = review(ids.customer, { order_item_id: first.items.a, rating: 4, title: 'Deep and warm', body: 'Lasts all day. Packed beautifully.', lang: 'en' });
    assert.equal(r.status, 'pending', 'our team reads every review first');
    assert.deepEqual(db.one(`select author_name, rating_count from product_reviews r join products p on p.id = r.product_id where r.id = '${r.id}'`), { author_name: 'Maryam H.', rating_count: 0 });
    assert.equal(db.val(`select product_reviews_public('${oud}') ->> 'count'`, 'anon'), '0');
    assert.equal(db.rows(`select id from product_reviews where id = '${r.id}'`, asUser('sellerA')).length, 0, 'not the seller\'s to see until published');
    assert.equal(db.rows(`select id from product_reviews where id = '${r.id}'`, asUser('customer')).length, 1);
    assert.match(db.error(`select user_id from product_reviews`, asUser('customer')) ?? '', /permission denied/);
    assert.match(db.error(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${first.items.a}", "rating": 5}'::jsonb)`, asUser('customer')) ?? '', /permission denied/);
  });

  test('moderation publishes it, the rating follows; the seller replies once; hiding takes it off again', () => {
    const id = db.val<string>(`select id from product_reviews where order_item_id = '${first.items.a}'`);
    assert.match(db.error(`select mp_moderate_review('${ids.finance}', '${id}', 'review', 'publish')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_moderate_review('${ids.support}', '${id}', 'review', 'publish', null, array['https://evil.example/x.jpg'])`, 'service') ?? '', /published by the after-sale function/);
    db.exec(`select mp_moderate_review('${ids.support}', '${id}', 'review', 'publish')`, 'service');
    assert.deepEqual(db.one(`select rating_avg::text, rating_count from products where id = '${oud}'`), { rating_avg: '4.00', rating_count: 1 });
    const pub = db.val<{ count: number; avg: number; stars: Record<string, number>; reviews: { author: string; variant: string; verified: boolean; reply: unknown }[] }>(`select product_reviews_public('${oud}')`, 'anon');
    assert.equal(pub.count, 1);
    assert.equal(pub.stars['4'], 1);
    assert.deepEqual([pub.reviews[0].author, pub.reviews[0].variant, pub.reviews[0].verified, pub.reviews[0].reply], ['Maryam H.', '12 ml / ١٢ مل', true, null]);
    assert.ok(outbox(`template_key = 'seller_review_new' and seller_id = '${A}'`).length === 1);
    assert.match(db.error(`select mp_reply_review('${ids.sellerB}', '${id}', 'Thank you')`, 'service') ?? '', /Not allowed/);
    assert.equal(db.val<{ status: string }>(`select mp_reply_review('${ids.sellerA}', '${id}', 'Thank you, Maryam. May it bring you barakah.')`, 'service').status, 'pending');
    assert.equal(db.val(`select product_reviews_public('${oud}') -> 'reviews' -> 0 -> 'reply'`, 'anon'), null, 'replies are read first too');
    db.exec(`select mp_moderate_review('${ids.marketing}', '${id}', 'reply', 'publish')`, 'service');
    assert.equal(db.val<{ by_en: string }>(`select product_reviews_public('${oud}') -> 'reviews' -> 0 -> 'reply'`, 'anon').by_en, 'Oud House A');
    assert.ok(outbox(`template_key = 'review_reply'`).length === 1);
    const seller = db.val<{ reply: { status: string } }[]>(`select seller_reviews('${A}')`, asUser('sellerA'));
    assert.equal(seller[0].reply.status, 'published');
    assert.match(db.error(`select mp_moderate_review('${ids.support}', '${id}', 'review', 'hide')`, 'service') ?? '', /short note/);
    db.exec(`select mp_moderate_review('${ids.support}', '${id}', 'review', 'hide', 'Mentions another shop by name')`, 'service');
    assert.deepEqual(db.one(`select rating_avg, rating_count from products where id = '${oud}'`), { rating_avg: null, rating_count: 0 });
    assert.match(db.error(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${first.items.a}", "rating": 5}'::jsonb)`, 'service') ?? '', /removed by our team/);
  });

  test('photos must be the customer\'s own, screened; auto-publishing (when switched on) skips anything flagged', () => {
    const o = makeOrder(ids.customer2);
    deliver(o.h);
    assert.match(db.error(`select mp_submit_review('${ids.customer2}', '{"order_item_id": "${o.items.h}", "rating": 5, "photos": ["${ids.owner}"]}'::jsonb)`, 'service') ?? '', /photo check/);
    svc(`update mp_settings set review_auto_publish = true`);
    assert.equal(review(ids.customer2, { order_item_id: o.items.h, rating: 5, body: 'Soft and fresh', flags: ['contact_phone'] }).status, 'pending');
    assert.equal(review(ids.customer2, { order_item_id: o.items.h, rating: 5, body: 'Soft and fresh' }).status, 'published');
    assert.equal(db.val(`select (product_reviews_public('${dates}') ->> 'count')::int`, 'anon'), 1);
    svc(`update mp_settings set review_auto_publish = false`);
  });
});

describe('messages', () => {
  test('a question before buying; the seller answers; nobody else reads it', () => {
    const t = post(ids.customer, { as: 'customer', product_id: oud, body: 'Is this oud from Assam or Cambodia?' });
    assert.equal(post(ids.customer, { as: 'customer', product_id: oud, body: 'And how strong is it?' }).thread_id, t.thread_id, 'the same conversation');
    assert.ok(outbox(`template_key = 'message_to_seller' and seller_id = '${A}'`).length === 2, 'email and in the app, once an hour');
    assert.match(db.error(`select mp_post_message('${ids.sellerB}', '{"as": "seller", "thread_id": "${t.thread_id}", "body": "Hello"}'::jsonb)`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_post_message('${ids.customer2}', '{"as": "customer", "thread_id": "${t.thread_id}", "body": "Hello"}'::jsonb)`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_post_message('${ids.marketing}', '{"as": "staff", "thread_id": "${t.thread_id}", "body": "Hello"}'::jsonb)`, 'service') ?? '', /Not allowed/);
    post(ids.sellerA, { as: 'seller', thread_id: t.thread_id, body: 'Cambodian, aged five years. Write to me on ••• for a discount', masked: 1, flags: ['contact_phone', 'solicit'] });
    assert.equal(db.val(`select flagged from message_threads where id = '${t.thread_id}'`), true);
    assert.equal(outbox(`template_key = 'staff_message_flagged'`).length, 1);
    const list = db.val<{ unread: boolean; seller: { name_en: string }; preview: string }[]>(`select mp_threads()`, asUser('customer'));
    assert.equal(list[0].unread, true);
    assert.match(list[0].preview, /•••/);
    db.exec(`select mp_mark_thread_read('${t.thread_id}')`, asUser('customer'));
    assert.equal(db.val<{ unread: boolean }[]>(`select mp_threads()`, asUser('customer'))[0].unread, false);
    const forSeller = db.val<{ customer: string }[]>(`select mp_threads('${A}')`, asUser('sellerA'));
    assert.equal(forSeller[0].customer, 'Maryam H.');
    assert.equal(db.rows(`select id from messages where thread_id = '${t.thread_id}'`, asUser('sellerA')).length, 3);
    assert.equal(db.rows(`select id from messages where thread_id = '${t.thread_id}'`, asUser('sellerB')).length, 0);
    assert.equal(db.rows(`select id from message_threads`, asUser('customer2')).length, 0);
    assert.match(db.error(`select flags from messages`, asUser('support')) ?? '', /permission denied/, 'flags through mp_thread only');
    const staffView = db.val<{ side: string; messages: { flags: string[] }[] }>(`select mp_thread('${t.thread_id}')`, asUser('support'));
    assert.equal(staffView.side, 'staff');
    assert.deepEqual(staffView.messages[2].flags, ['contact_phone', 'solicit']);
    assert.equal(db.val<{ messages: { flags: unknown }[] }>(`select mp_thread('${t.thread_id}')`, asUser('sellerA')).messages[2].flags, null);
    assert.match(db.error(`select mp_thread('${t.thread_id}')`, asUser('finance')) ?? '', /Not allowed/);
    assert.ok(db.val<unknown[]>(`select admin_threads(true)`, asUser('support')).length === 1);
    assert.match(db.error(`update messages set body = 'x'`, 'service') ?? '', /never edited/);
    assert.match(db.error(`insert into messages (thread_id, sender, body) values ('${t.thread_id}', 'customer', 'raw 0500000000')`, asUser('customer')) ?? '', /permission denied/);
  });

  test('about an order: the seller can write first; a guest order cannot be messaged; the hourly limit', () => {
    const t = post(ids.sellerB, { as: 'seller', sub_order_id: first.b, body: 'Your thobe is ready; we ship tomorrow.' });
    assert.equal(db.val(`select user_id from message_threads where id = '${t.thread_id}'`), ids.customer);
    assert.match(db.error(`select mp_post_message('${ids.sellerA}', '{"as": "seller", "sub_order_id": "${first.b}", "body": "Hello"}'::jsonb)`, 'service') ?? '', /Not allowed/);
    const g = makeOrder(null);
    assert.match(db.error(`select mp_post_message('${ids.sellerA}', '{"as": "seller", "sub_order_id": "${g.a}", "body": "Hello"}'::jsonb)`, 'service') ?? '', /without an account/);
    svc(`update mp_settings set messages_per_hour = 2`);
    assert.match(db.error(`select mp_post_message('${ids.customer}', '{"as": "customer", "thread_id": "${t.thread_id}", "body": "Thank you"}'::jsonb)`, 'service') ?? '', /a lot of messages/);
    svc(`update mp_settings set messages_per_hour = 30`);
    const q = post(ids.customer2, { as: 'customer', subject: 'Gift wrapping', body: 'Do you gift wrap for Eid?' });
    assert.equal(db.val(`select seller_id from message_threads where id = '${q.thread_id}'`), null);
    assert.ok(outbox(`template_key = 'message_to_staff'`).length === 1);
  });
});

describe('performance', () => {
  test('measures over the window; under the minimum number of orders a shop is new; warnings, and suspension only when switched on', () => {
    svc(`update mp_settings set perf_thresholds = jsonb_set(perf_thresholds, '{min_orders}', '1000')`);
    const p = db.val<{ status: string; orders: number; metrics: { cancellation: { count: number; status: string } } }>(`select mp_seller_performance('${B}')`, asUser('sellerB'));
    assert.equal(p.status, 'new', 'not enough orders to judge');
    assert.equal(p.metrics.cancellation.count, 1);
    assert.match(db.error(`select mp_seller_performance('${B}')`, asUser('sellerA')) ?? '', /Not allowed/);
    svc(`update mp_settings set perf_thresholds = jsonb_set(perf_thresholds, '{min_orders}', '2')`);
    const q = db.val<{ status: string; orders: number; metrics: Record<string, { status: string; bps: number; count: number; of: number }> }>(`select mp_seller_performance('${B}')`, asUser('owner'));
    const orders = db.val<number>(`select count(*)::int from sub_orders where seller_id = '${B}' and status <> 'pending_payment'`);
    assert.equal(q.orders, orders);
    assert.equal(q.metrics.cancellation.bps, Math.round(10000 / orders));
    const delivered = db.val<number>(`select count(*)::int from sub_orders where seller_id = '${B}' and delivered_at is not null`);
    assert.deepEqual([q.metrics.returns.count, q.metrics.returns.of], [1, delivered], 'the collar dispute (a change of mind would not count)');
    assert.equal(q.metrics.returns.status, 'suspend');
    assert.equal(q.status, 'suspend');
    assert.match(db.error(`select mp_performance_review()`, asUser('support')) ?? '', /Not allowed/);
    const r1 = db.val<{ warned: number; suspended: number }>(`select mp_performance_review()`, asUser('manager'));
    assert.equal(r1.suspended, 0, 'automatic suspension is off');
    assert.equal(db.val(`select status from sellers where id = '${B}'`), 'approved');
    assert.match(outbox(`template_key = 'seller_performance_warning' and seller_id = '${B}'`)[0].body_en, /Over the last 90 days: cancellations \d+\.\d%/);
    db.exec(`select mp_performance_review()`, asUser('manager'));
    assert.equal(outbox(`template_key = 'seller_performance_warning' and seller_id = '${B}'`).length, 2, 'once a week: email and in the app');
    svc(`update mp_settings set perf_auto_suspend = true`);
    db.exec(`select mp_performance_review()`, 'service');
    assert.equal(db.val(`select status from sellers where id = '${B}'`), 'suspended');
    assert.ok(outbox(`template_key = 'seller_suspended' and seller_id = '${B}'`).length >= 1);
    assert.ok(db.val<unknown[]>(`select admin_seller_performance()`, asUser('support')).length >= 2);
    svc(`update mp_settings set perf_auto_suspend = false, perf_thresholds = jsonb_set(perf_thresholds, '{min_orders}', '10'); update sellers set status = 'approved' where id = '${B}'`);
  });
});

describe('who reads and writes each new table', () => {
  const tables = ['notification_templates', 'notification_outbox', 'return_requests', 'return_lines', 'refunds', 'refund_lines', 'seller_payouts',
    'seller_ledger', 'product_reviews', 'review_replies', 'message_threads', 'messages'];
  // count a column every reader may read (count(*) needs the whole table, which the column grants do not give)
  const key: Record<string, string> = { notification_templates: 'key', return_lines: 'return_id', review_replies: 'review_id' };
  const count = (t: string, as: As) => db.val<number>(`select count(${key[t] ?? 'id'})::int from ${t}`, as);

  test('anon reads nothing and writes nothing', () => {
    for (const t of tables) {
      assert.match(db.error(`select count(${key[t] ?? 'id'}) from ${t}`, 'anon') ?? '', /permission denied/, t);
      assert.match(db.error(`delete from ${t}`, 'anon') ?? '', /permission denied/, t);
    }
  });

  test('signed-in people write nothing directly: every change goes through the functions', () => {
    for (const who of ['customer', 'sellerA', 'owner', 'finance'] as const) {
      for (const t of tables.filter((x) => x !== 'notification_templates')) {
        assert.match(db.error(`delete from ${t}`, asUser(who)) ?? '', /permission denied/, `${who} ${t}`);
      }
      assert.match(db.error(`insert into seller_ledger (seller_id, kind, currency, amount_minor, amount_sar_minor, available_on) values ('${A}', 'adjustment', 'SAR', 100000, 100000, current_date)`, asUser(who)) ?? '', /permission denied/);
    }
    assert.match(db.error(`delete from notification_templates`, asUser('owner')) ?? '', /permission denied/);
  });

  test('customers see their own; sellers theirs; each staff role what its work needs', () => {
    const c1 = Object.fromEntries(tables.map((t) => [t, count(t, asUser('customer'))]));
    const c2 = Object.fromEntries(tables.map((t) => [t, count(t, asUser('customer2'))]));
    assert.equal(c1.seller_ledger + c1.seller_payouts + c1.notification_templates, 0);
    assert.ok(c1.return_requests >= 3 && c1.refunds >= 1 && c1.product_reviews === 1 && c1.message_threads >= 2);
    assert.ok(c2.product_reviews === 1 && c2.return_requests === 0);
    const own = db.val<number>(`select count(*)::int from return_requests where user_id = '${ids.customer}'`);
    assert.equal(c1.return_requests, own);
    const sa = Object.fromEntries(tables.map((t) => [t, count(t, asUser('sellerA'))]));
    assert.equal(sa.seller_ledger, db.val(`select count(*)::int from seller_ledger where seller_id = '${A}'`));
    assert.equal(sa.return_requests, db.val(`select count(*)::int from return_requests where seller_id = '${A}'`));
    assert.equal(sa.refunds + sa.notification_templates, 0);
    assert.equal(count('seller_ledger', asUser('sellerB')), db.val(`select count(*)::int from seller_ledger where seller_id = '${B}'`));
    assert.equal(count('seller_ledger', asUser('applicant')), 0);
    const all = Object.fromEntries(tables.map((t) => [t, db.val<number>(`select count(${key[t] ?? 'id'})::int from ${t}`)]));
    const expect: Record<string, string[]> = {
      seller_ledger: ['owner', 'manager', 'finance'], seller_payouts: ['owner', 'manager', 'finance'],
      refunds: ['owner', 'manager', 'finance', 'support'], refund_lines: ['owner', 'manager', 'finance', 'support'],
      return_requests: ['owner', 'manager', 'support', 'operations', 'finance'], return_lines: ['owner', 'manager', 'support', 'operations', 'finance'],
      product_reviews: ['owner', 'manager', 'marketing', 'support'], review_replies: ['owner', 'manager', 'marketing', 'support'],
      message_threads: ['owner', 'manager', 'support', 'operations'], messages: ['owner', 'manager', 'support', 'operations'],
      notification_templates: [...staffRoles], notification_outbox: ['owner', 'manager', 'support', 'operations'],
    };
    for (const r of staffRoles) {
      for (const t of tables) {
        const n = count(t, asUser(r));
        if (expect[t].includes(r)) assert.equal(n, all[t], `${r} reads all of ${t}`);
        else assert.ok(n < all[t], `${r} does not read all of ${t} (${n} of ${all[t]})`);
      }
    }
  });
});

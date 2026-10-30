// The whole marketplace journey, scripted, against a fresh database with every migration: a maker applies, completes
// the file and is approved; lists a prayer mat; the automatic check (mocked AI answers) rejects it for a phone number,
// then passes it to our team, who approve it; a customer orders (every line planned by the real rulebook from the
// database tables, as create-payment does); the payment is confirmed; the seller accepts and prints the sandbox label;
// the sandbox courier's tracking moves it to delivered; the sale appears on the seller's statement, held for the return
// window; the customer reviews it; a payout is recorded once an earlier sale is payable.
// Only the HTTP layer and the real model are left out; the functions' own steps are run here in the same order.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sandboxAdapter } from '../functions/_shared/carriers/sandbox.ts';
import { serverQuality } from '../functions/_shared/media.ts';
import { plan, vatInside, type Line, type Tables } from '../functions/_shared/rules.ts';
import { screenListing, type ModelCall, type Rule } from '../functions/_shared/screening.ts';
import { type Db, freshDb, ids, seedPeople, user } from './lib/db.ts';

let db: Db;
let S = '';           // the new seller
let mat = '';         // the listing
let order = '';
let sub = '';
let item = '';
const maker = user('applicant');
const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);
const hash = (n: number) => n.toString(16).padStart(64, '0');
const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/** A screened photo of the seller's (as screen-image leaves it). */
function photo(n: number, kind = 'listing_photo') {
  const id = db.val<string>(`select gen_random_uuid()`);
  db.exec(`insert into media_assets (id, seller_id, kind, path, mime, bytes, width, height, sha256, status)
    values ('${id}', '${S}', '${kind}', '${S}/media/${id}.jpg', 'image/jpeg', 300000, 2400, 2400, '${hash(n)}', 'passed')`, 'service');
  return `${S}/media/${id}.jpg`;
}

/** The listing check as listing-check runs it (runListingCheck), with the model's answer mocked. */
async function listingCheck(answer: Record<string, unknown> | null) {
  db.exec(`select mp_begin_listing_check('${mat}', '${ids.applicant}')`, 'service');
  const c = db.val<Parameters<typeof serverQuality>[0]>(`select mp_listing_check_context('${mat}')`, 'service');
  const rules = db.rows<Rule>(`select code, level, severity, applies_to, title_en, title_ar, ai_instruction, keywords from policy_rules where active order by sort`);
  const calls: string[] = [];
  const call: ModelCall = async (model) => {
    calls.push(model);
    return { text: JSON.stringify({ verdict: 'pass', confidence: 0.96, rule_hits: [], category_ok: true, suggested_category: null, photos: [{ photo: 1, matches: true }],
      text_issues: [], quran_text_present: false, summary_en: 'A well presented prayer mat.', summary_ar: 'سجادة صلاة معروضة جيدًا.', draft: {}, ...answer }), model, latencyMs: 5 };
  };
  const p = c.product;
  const pol = (c.requirements?.policy ?? {}) as Record<string, unknown>;
  const { runs, decision } = await screenListing({
    listing: {
      name_en: String(p.name_en), name_ar: String(p.name_ar), description_en: String(p.description_en ?? ''), description_ar: String(p.description_ar ?? ''),
      category_path: ((pol.path as { name_en: string }[]) ?? []).map((x) => x.name_en), category_slug: String(pol.slug ?? ''),
      price_sar: (Number(p.base_price_sar) / 100).toFixed(2), attributes: (p.attributes ?? {}) as Record<string, unknown>, made_to_measure: false,
      seller_country: c.seller?.country ?? '', photo_count: c.photos.length,
    },
    images: c.photos.map((ph) => ({ position: ph.position, status: ph.asset?.status ?? 'pending', block: { type: 'image' } })),
    quality: serverQuality(c), rules, documents: [], alwaysReview: false, categories: c.categories,
    settings: { allow_modest_models_in_fashion: false, escalate_below_confidence: 0.85 }, models: { fast: 'fast', strong: 'strong' }, call,
  });
  const outcome = { verdict: decision.verdict, summary_en: decision.summary_en, summary_ar: decision.summary_ar, reasons: decision.reasons, draft: null,
    quality_score: decision.quality_score ?? null, strike: decision.strike ?? null, policy_code: decision.policy_code ?? null };
  const applied = db.val<{ applied: boolean; status: string }>(`select mp_record_listing_screening('${mat}', '${p.updated_at}', ${q(runs)}, ${q(outcome)})`, 'service');
  return { decision, applied, calls };
}

/** The rulebook's tables, read as checkout.ts loadTables reads them. */
function tables(): Tables {
  const rows = (sql: string) => db.rows(sql) as never;
  return {
    countries: rows(`select code, name_en, name_ar, currency, vat_rate_bp, import_duty_bp, de_minimis_sar, customs_union, import_tax_regime, import_tax_threshold_minor, platform_collects_import_tax from countries`),
    corridors: rows(`select id, scope, from_country, to_country, phase, status, invoicer, vat_mode, duties_mode, platform_collects_import_tax, pilot_seller_ids from corridors`),
    dutyRates: rows(`select country, hs_prefix, duty_bp from duty_rates`),
    permitRules: rows(`select to_country, permit_key, label_en, label_ar, hs_prefixes, ship_classes, category_slugs, imports_only, applies_to_house, active from permit_rules`),
    services: rows(`select id, provider_id, code, carrier_name, service_name, service_name_ar, from_countries, to_countries, domestic_only, dangerous_goods, ddp, days_min, days_max, active, sort from carrier_services`),
    prices: rows(`select id, from_country, to_country, service_id, first_kg_sar, extra_kg_sar, free_over_sar, active from delivery_prices`),
    zeroRateHouseExports: db.val<boolean>(`select zero_rate_exports from store_settings where id = 1`), houseCountry: 'SA',
  };
}

/** One bag line as cart.ts prices it (product, category chain, category policy, permits, seller). */
function bagLine(productId: string, quantity: number): Line & { commission_bps: number | null } {
  const r = db.val<{ p: Record<string, any>; chain: string[]; policy: Record<string, any>; permits: Line['permits']; seller: Line['seller']; commission: number | null }>(`
    select jsonb_build_object('p', to_jsonb(p),
      'chain', (with recursive c as (select id, slug, parent_id, 0 as d from categories where id = p.category_id
                                      union all select x.id, x.slug, x.parent_id, c.d + 1 from categories x join c on x.id = c.parent_id)
                select jsonb_agg(slug order by d desc) from c),
      'policy', mp_category_policy(p.category_id),
      'permits', (select coalesce(jsonb_agg(jsonb_build_object('permit_key', permit_key, 'status', status, 'expires_on', expires_on)), '[]'::jsonb) from product_permits where product_id = p.id),
      'seller', (select jsonb_build_object('id', s.id, 'kind', s.kind, 'country', s.country, 'handling_days', s.handling_days) from sellers s where s.id = p.seller_id),
      'commission', case when p.seller_id is not null then mp_commission_bps(p.seller_id, p.category_id) end)
    from products p where p.id = '${productId}'`, 'service');
  const p = r.p;
  return {
    key: `0:${productId}:`, product_id: productId, variant_id: null, name_en: p.name_en, name_ar: p.name_ar, quantity, unit_minor: p.base_price_sar,
    weight_g: p.weight_g ?? 500, ship_class: p.ship_class, dangerous_goods: !!p.dangerous_goods, hs_code: p.hs_code, origin_country: p.origin_country,
    category_slugs: r.chain, policy: { ship_domestic_only: r.policy.ship_domestic_only, ship_to_countries: r.policy.ship_to_countries, ship_from_countries: r.policy.ship_from_countries,
      return_policy: r.policy.return_policy, return_window_days: r.policy.return_window_days, mtm_return_policy: r.policy.mtm_return_policy },
    allowed_destinations: p.allowed_destinations, restricted_countries: p.restricted_countries, compliance_status: p.compliance_status,
    permits: r.permits, made_to_measure: !!p.made_to_measure, production_days: 0, seller: r.seller, commission_bps: r.commission,
  };
}

before(() => {
  db = freshDb('e2e');
  seedPeople(db);
});
after(() => db.drop());

describe('the marketplace journey', () => {
  test('1. a maker applies, completes the file and is approved', () => {
    S = db.val<string>(`select apply_as_seller(jsonb_build_object('agree', true, 'name_en', 'Rawdah Looms', 'name_ar', 'أنوال الروضة', 'country', 'SA', 'city', 'Madinah',
      'contact_name', 'Hamza', 'product_summary', 'Hand-woven prayer mats', 'relationship', 'maker', 'years_in_business', '9',
      'categories', jsonb_build_array('${cat('prayer-worship')}')))`, maker);
    const pics = [1, 2, 3].map((n) => photo(100 + n, 'portfolio'));
    db.exec(`update seller_applications set portfolio = array['${pics.join("','")}'],
               brand_story = '${'We weave prayer mats on wooden looms in Madinah, as our grandfather did, with wool from the same farms each year. '.repeat(2)}' where seller_id = '${S}'`, maker);
    db.exec(`update seller_private set legal_name = 'Rawdah Looms Est.', legal_entity_type = 'sole_proprietorship', registration_no = '4650099999',
               tax_registration_no = '300000000000003', iban = 'SA0380000000608010167519', bank_name = 'Al Rajhi Bank', account_holder = 'Rawdah Looms Est.' where seller_id = '${S}'`, maker);
    db.exec(`insert into seller_documents (seller_id, doc_type, path) values ('${S}', 'commercial_registration', '${S}/kyc/cr.pdf'), ('${S}', 'vat_certificate', '${S}/kyc/vat.pdf')`, maker);
    db.exec(`insert into seller_locations (seller_id, contact_name, phone, country, city, line1) values ('${S}', 'Workshop', '+966500000077', 'SA', 'Madinah', 'Quba Road 7')`, maker);
    assert.equal(db.val<{ complete: boolean }>(`select mp_application_checklist('${S}')`, maker).complete, true);
    db.exec(`select submit_seller_application('${S}')`, maker);
    assert.match(db.error(`select mp_review_seller('${S}', 'approve')`, user('manager')) ?? '', /KYC/, 'not before the KYC check');
    db.exec(`update seller_private set kyc_status = 'approved' where seller_id = '${S}'; update seller_applications set sample_status = 'passed', sample_note = 'Dense weave, clean edges.' where seller_id = '${S}'`, user('manager'));
    db.exec(`select mp_review_seller('${S}', 'approve', 'Welcome to Al Mukarramah.', array['${cat('prayer-worship')}']::uuid[])`, user('manager'));
    assert.equal(db.val(`select status from sellers where id = '${S}'`), 'approved');
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'seller_approved' and seller_id = '${S}'`), 2, 'email and in the app (queued)');
  });

  test('2. the listing: the automatic check rejects a phone number with the reason, then passes the corrected listing to our team, who approve it', async () => {
    const photos = [1, 2, 3].map((n) => photo(200 + n));
    mat = db.val<string>(`insert into products (slug, name_en, name_ar, description_en, description_ar, base_price_sar, seller_id, category_id, images, weight_g, stock, attributes)
      values ('rawdah-mihrab-mat', 'Mihrab prayer mat, hand-woven wool', 'سجادة صلاة محراب منسوجة يدويًا من الصوف',
              'Woven on wooden looms in Madinah. Order on WhatsApp 0551234567.', 'نُسجت على أنوال خشبية في المدينة المنورة من صوف طبيعي.',
              45000, '${S}', '${cat('prayer-mats')}', array['${photos.join("','")}'], 1200, 12,
              '{"brand": "Rawdah Looms", "brand_relationship": "own", "origin_country": "SA", "material": "Wool", "dimensions_cm": "70 x 115"}')
      returning id`, maker);
    const first = await listingCheck(null);
    assert.equal(first.decision.verdict, 'block');
    assert.deepEqual(first.calls, [], 'a fixable problem never reaches the model');
    assert.equal(first.applied.status, 'rejected');
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'seller_listing_rejected' and seller_id = '${S}'`), 2);
    db.exec(`update products set description_en = 'Woven on wooden looms in Madinah from natural wool. A geometric mihrab, no images of living beings.' where id = '${mat}'`, maker);
    const second = await listingCheck({});
    assert.equal(second.decision.verdict, 'pass');
    assert.equal(second.applied.status, 'pending_review', 'our team always approves');
    // review-listing: our team approves; the photos become public catalogue copies and the listing goes live
    const urls = (db.val<string[]>(`select images from products where id = '${mat}'`) ?? []).map((x) => `https://example.supabase.co/storage/v1/object/public/catalogue/${S}/${x.split('/').pop()}`);
    db.exec(`update products set images = array['${urls.join("','")}'], listing_status = 'approved', is_active = true, reviewed_at = now(), reviewed_by = '${ids.marketing}' where id = '${mat}'`, 'service');
    assert.equal(db.rows(`select id from products where id = '${mat}'`, 'anon').length, 1, 'public');
    assert.equal(db.val<{ total: number }>(`select mp_search('{"q": "محراب"}'::jsonb)`, 'anon').total, 1, 'found in Arabic search');
  });

  test('3. the order: planned by the rulebook from the tables, paid, handed on', () => {
    const line = bagLine(mat, 2);
    const p = plan(tables(), [line], 'SA');
    assert.deepEqual(p.blocked, []);
    assert.equal(p.subOrders.length, 1);
    const s = p.subOrders[0];
    assert.deepEqual([s.kind, s.seller_id, s.invoicer, s.vat_mode], ['marketplace', S, 'platform', 'origin']);
    assert.equal(s.lines[0].return_policy, 'standard');
    assert.equal(s.lines[0].vat_rate_bp, 1500);
    assert.equal(s.delivery.mode, 'price');
    const shipping = s.delivery.mode === 'price' ? s.delivery.amount_minor : 0;
    const items = s.items_minor;
    const commission = Math.round((items * (line.commission_bps ?? 0)) / 10000);
    assert.equal(items, 90000);
    // create-payment's inserts
    order = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, duties_minor, total_minor, vat_minor, ship_to, idempotency_key, fx_per_sar)
      values ('${ids.customer}', 'maryam@test.local', 'SAR', ${items}, ${shipping}, 0, ${items + shipping}, ${vatInside(items + shipping, 1500)},
              '{"kind": "home", "recipient_name": "Maryam Al Harbi", "phone": "+966500000009", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}', 'e2e-checkout-0001', 1) returning id`, 'service');
    sub = db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, currency, items_minor, shipping_minor, duties_minor, vat_minor, commission_minor, corridor_id,
        invoicer, vat_mode, duties_mode, import_tax_regime, import_tax_collected, from_country, to_country, service_id, delivery_price_id, weight_g, handling_days, production_days, days_min, days_max)
      values ('${order}', 1, '${S}', 'marketplace', 'SAR', ${items}, ${shipping}, 0, ${s.vat_minor + vatInside(shipping, 1500)}, ${commission}, '${s.corridor_id}', '${s.invoicer}', '${s.vat_mode}',
              '${s.duties_mode}', '${s.import_tax_regime}', ${s.import_tax_collected}, '${s.from_country}', '${s.to_country}', '${s.service_id}',
              '${s.delivery.mode === 'price' ? s.delivery.price_id : ''}', ${s.weight_g}, ${s.handling_days}, 0, ${s.days_min}, ${s.days_max}) returning id`, 'service');
    item = db.val<string>(`insert into order_items (order_id, sub_order_id, product_id, name_en, name_ar, unit_price_minor, quantity, line_total_minor, seller_id, commission_bps,
        commission_minor, vat_rate_bp, vat_minor, duty_bp, duty_minor, production_days, return_policy, return_window_days, hs_code, origin_country)
      values ('${order}', '${sub}', '${mat}', '${line.name_en}', '${line.name_ar}', ${line.unit_minor}, 2, ${items}, '${S}', ${line.commission_bps}, ${commission},
              1500, ${s.lines[0].vat_minor}, 0, 0, 0, '${s.lines[0].return_policy}', ${s.lines[0].return_window_days}, null, 'SA') returning id`, 'service');
    // moyasar-webhook: paid, handed on, our tax invoice (issueInvoice) for the parcel we invoice
    db.exec(`update orders set status = 'paid', payment_id = 'pay_e2e_1', paid_at = now() where id = '${order}'`, 'service');
    assert.deepEqual(db.val(`select mp_order_paid('${order}')`, 'service'), { applied: true, sub_orders: 1 });
    db.exec(`insert into invoices (number, icv, order_id, currency, total_excl_vat_minor, vat_minor, total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, qr_base64)
      values ('INV-2026-000001', 1, '${order}', 'SAR', ${items + shipping - vatInside(items + shipping, 1500)}, ${vatInside(items + shipping, 1500)}, ${items + shipping}, ${items + shipping}, ${vatInside(items + shipping, 1500)}, 'qr')`, 'service');
    assert.equal(db.val(`select stock from products where id = '${mat}'`), 10);
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'seller_new_order' and seller_id = '${S}'`), 3);
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'order_confirmed' and order_id = '${order}'`), 2);
  });

  test('4. the seller accepts and prints the sandbox label; the courier\'s tracking moves the parcel to delivered', async () => {
    db.exec(`select seller_accept_sub_order('${sub}')`, maker);
    const list = db.val<{ number: string; recipient: string }[]>(`select seller_sub_orders('${S}')`, maker);
    assert.equal(list[0].recipient, 'Maryam');
    // create-shipment: the label from the sandbox provider, then recorded
    const sbx = sandboxAdapter('e2e-secret');
    const ctx = db.val<{ order: { ship_to: Record<string, string> }; locations: { contact_name: string; phone: string; city: string; line1: string }[] }>(`select mp_shipment_context('${sub}')`, 'service');
    const label = await sbx.createShipment({
      idempotency_key: 'e2e-label-0001', reference: list[0].number, service_code: 'sandbox', ddp: false, declared_value_minor: 90000, currency: 'SAR',
      from: { name: 'Rawdah Looms', phone: ctx.locations[0].phone, country: 'SA', city: ctx.locations[0].city, line1: ctx.locations[0].line1 },
      to: { name: ctx.order.ship_to.recipient_name, phone: ctx.order.ship_to.phone, country: 'SA', city: ctx.order.ship_to.city, line1: ctx.order.ship_to.line1 },
      parcel: { weight_g: 2400, dangerous_goods: false }, customs: [],
    });
    assert.match(new TextDecoder().decode(label.label.bytes), /SAMPLE - NOT A REAL LABEL/);
    const rec = db.val<{ id: string }>(`select mp_record_shipment('${sub}', ${q({ provider_id: 'sandbox', tracking_number: label.tracking_number, tracking_url: label.tracking_url,
      label_path: `${sub}/e2e.pdf`, weight_g: 2400, idempotency_key: 'e2e-label-0001' })})`, 'service');
    assert.equal(db.val(`select status from sub_orders where id = '${sub}'`), 'ready_to_ship');
    // shipment-sync: the sandbox's events 31 hours after the label
    const created = db.val<string>(`select created_at from shipments where id = '${rec.id}'`);
    const events = await sbx.track({ tracking_number: label.tracking_number, created_at: created }, new Date(Date.parse(created) + 31 * 3_600_000));
    assert.deepEqual(events.map((e) => e.status), ['picked_up', 'in_transit', 'out_for_delivery', 'delivered']);
    db.exec(`select mp_record_shipment_event('${rec.id}', ${q(events.slice(0, 3).map((e) => ({ ...e, source: 'sandbox' })))})`, 'service');
    assert.equal(db.val(`select count(*)::int from notification_outbox where template_key = 'parcel_out_for_delivery' and order_id = '${order}'`), 2);
    db.exec(`select mp_record_shipment_event('${rec.id}', ${q(events.map((e) => ({ ...e, source: 'sandbox' })))})`, 'service');
    assert.deepEqual(db.one(`select s.status::text as sub, o.status::text as ord from sub_orders s join orders o on o.id = s.order_id where s.id = '${sub}'`), { sub: 'delivered', ord: 'delivered' });
    const track = db.val<{ sub_orders: { shipments: { events: unknown[] }[]; lines: { review: unknown; returnable_quantity: number }[] }[] }>(`select my_order_tracking('${order}')`, user('customer'));
    assert.equal(track.sub_orders[0].shipments[0].events.length, 5, 'label, collected, on the way, out for delivery, delivered');
    assert.equal(track.sub_orders[0].lines[0].returnable_quantity, 2);
  });

  test('5. the statement: the sale less commission, held for the return window; the customer\'s review goes live after moderation', () => {
    const st = db.val<{ totals: { sales: number; commission: number }; balance: { balance_sar_minor: number; available_sar_minor: number; next_available_on: string } }>(
      `select seller_statement('${S}')`, maker);
    assert.deepEqual([st.totals.sales, st.totals.commission], [90000, -22500]);
    assert.deepEqual([st.balance.balance_sar_minor, st.balance.available_sar_minor], [67500, 0]);
    assert.equal(db.val(`select '${st.balance.next_available_on}'::date - (now() at time zone 'Asia/Riyadh')::date`), 17, '14 days to return, 3 days\' hold');
    assert.match(db.error(`select mp_record_payout('${S}', 67500, 'TRX-E2E-1', (now() at time zone 'Asia/Riyadh')::date)`, user('finance')) ?? '', /Only 0 halalas/);
    const r = db.val<{ status: string; id: string }>(`select mp_submit_review('${ids.customer}', '{"order_item_id": "${item}", "rating": 5, "title": "Beautiful weave", "body": "Soft, dense and the mihrab is perfectly straight.", "lang": "en"}'::jsonb)`, 'service');
    assert.equal(r.status, 'pending');
    db.exec(`select mp_moderate_review('${ids.support}', '${r.id}', 'review', 'publish')`, 'service');
    const pub = db.val<{ count: number; avg: number }>(`select product_reviews_public('${mat}')`, 'anon');
    assert.deepEqual([pub.count, Number(pub.avg)], [1, 5]);
    assert.equal(db.val<{ rating_count: number }>(`select mp_storefront((select slug from sellers where id = '${S}'))`, 'anon').rating_count, 1);
  });

  test('6. later: an earlier sale is payable and finance records the transfer; the statement shows it', () => {
    // an earlier order, delivered 20 days ago (past its window and hold)
    const o = db.val<string>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, fx_per_sar, status, payment_id, paid_at)
      values ('${ids.customer2}', 'b@test.local', 'SAR', 45000, 3000, 48000, 6261, '{"kind": "home", "recipient_name": "Sara", "country": "SA", "city": "Jeddah", "line1": "x"}', 1, 'paid', 'pay_e2e_2', now() - interval '25 days') returning id`, 'service');
    const s = db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, status, currency, items_minor, shipping_minor, commission_minor, invoicer, vat_mode, duties_mode, from_country, to_country)
      values ('${o}', 1, '${S}', 'marketplace', 'shipped', 'SAR', 45000, 3000, 11250, 'platform', 'origin', 'none', 'SA', 'SA') returning id`, 'service');
    db.exec(`insert into order_items (order_id, sub_order_id, product_id, name_en, name_ar, unit_price_minor, quantity, line_total_minor, seller_id, commission_minor, return_policy, return_window_days)
      values ('${o}', '${s}', '${mat}', 'Mihrab prayer mat', 'سجادة صلاة محراب', 45000, 1, 45000, '${S}', 11250, 'standard', 14)`, 'service');
    db.exec(`update sub_orders set status = 'delivered', delivered_at = now() - interval '20 days' where id = '${s}'`, 'service');
    const bal = db.val<{ available_sar_minor: number }>(`select seller_balance('${S}')`, user('finance'));
    assert.equal(bal.available_sar_minor, 33750);
    db.exec(`select mp_record_payout('${S}', 33750, 'TRX-E2E-2', (now() at time zone 'Asia/Riyadh')::date)`, user('finance'));
    const months = db.val<string[]>(`select seller_statement('${S}') -> 'months'`, maker);
    const all = months.map((m) => db.val<{ totals: Record<string, number>; closing_sar_minor: number }>(`select seller_statement('${S}', '${m}')`, maker));
    assert.deepEqual(['sales', 'commission', 'payouts', 'orders'].map((k) => all.reduce((n, x) => n + x.totals[k], 0)), [135000, -33750, -33750, 2]);
    assert.equal(all[0].closing_sar_minor, 67500, 'what is left: the new sale, still held');
    assert.match(db.val<string>(`select body_en from notification_outbox where template_key = 'seller_payout_recorded' and seller_id = '${S}' and channel = 'email'`), /SAR 337\.50 to your account ending 7519/);
    assert.equal(db.val(`select count(*)::int from notification_outbox where status <> 'queued'`), 0, 'nothing was sent');
  });
});

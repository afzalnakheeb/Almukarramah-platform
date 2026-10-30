// The country rulebook (supabase/functions/_shared/rules.ts): allowed or not, invoicer and VAT, duties, import tax,
// permits, dangerous goods, carriers, delivery prices, made-to-measure time and returns.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { corridorFor, deliveryPrice, dutyBp, plan, vatInside, type Corridor, type Country, type Line, type Tables } from '../functions/_shared/rules.ts';

const c = (code: string, vat: number, f: Partial<Country> = {}): Country => ({
  code, name_en: code, name_ar: `ب-${code}`, currency: 'SAR', vat_rate_bp: vat, import_duty_bp: 500, de_minimis_sar: 0, customs_union: null,
  import_tax_regime: 'border', import_tax_threshold_minor: null, platform_collects_import_tax: false, ...f,
});
const k = (id: string, scope: Corridor['scope'], from: string, to: string, status: Corridor['status'], f: Partial<Corridor> = {}): Corridor => ({
  id, scope, from_country: from, to_country: to, phase: 1, status, invoicer: 'platform', vat_mode: 'origin', duties_mode: 'none',
  platform_collects_import_tax: false, pilot_seller_ids: [], ...f,
});
const svc = (id: string, from: string[], to: string[], f: Partial<Tables['services'][number]> = {}) => ({
  id, provider_id: 'sandbox', code: id, carrier_name: id, service_name: id, service_name_ar: null, from_countries: from, to_countries: to,
  domestic_only: false, dangerous_goods: false, ddp: false, days_min: 1, days_max: 3, active: true, sort: 1, ...f,
});
const tables = (patch: Partial<Tables> = {}): Tables => ({
  countries: [
    c('SA', 1500, { customs_union: 'GCC', de_minimis_sar: 100000 }), c('AE', 500, { customs_union: 'GCC' }), c('KW', 0, { customs_union: 'GCC' }),
    c('GB', 2000, { import_tax_regime: 'uk_low_value', import_tax_threshold_minor: 13500, platform_collects_import_tax: true, currency: 'GBP' }),
    c('US', 0), c('DE', 1900, { customs_union: 'EU', import_tax_regime: 'eu_ioss' }), c('IN', 0),
  ],
  corridors: [
    k('h-sa', 'house', 'SA', 'SA', 'open'), k('h-world', 'house', 'SA', '*', 'open', { duties_mode: 'dap' }),
    k('m-sa', 'marketplace', 'SA', 'SA', 'open'),
    k('m-ae-sa', 'marketplace', 'AE', 'SA', 'pilot', { vat_mode: 'destination', duties_mode: 'ddp', pilot_seller_ids: ['ae1'] }),
    k('m-sa-ae', 'marketplace', 'SA', 'AE', 'open', { vat_mode: 'destination', duties_mode: 'ddp' }),
    k('m-sa-gb', 'marketplace', 'SA', 'GB', 'closed', { vat_mode: 'destination', duties_mode: 'ddp', platform_collects_import_tax: true }),
    k('m-in-sa', 'marketplace', 'IN', 'SA', 'closed', { vat_mode: 'destination', duties_mode: 'ddp' }),
  ],
  dutyRates: [{ country: 'GB', hs_prefix: '3303', duty_bp: 0 }, { country: 'GB', hs_prefix: '33', duty_bp: 650 }, { country: 'SA', hs_prefix: '3303', duty_bp: 1000 }],
  permitRules: [{ to_country: 'SA', permit_key: 'sfda_ecosma', label_en: 'SFDA eCosma', label_ar: 'إيكوزما', hs_prefixes: ['3303'], ship_classes: ['perfume_spray', 'perfume_oil'],
    category_slugs: ['perfumes', 'oud-oils'], imports_only: false, applies_to_house: false, active: true }],
  services: [
    svc('sa-road', ['SA'], ['SA'], { domestic_only: true, dangerous_goods: true, days_min: 1, days_max: 3 }),
    svc('gcc-express', ['SA', 'AE', 'KW'], ['SA', 'AE', 'KW'], { ddp: true, days_min: 2, days_max: 5, sort: 2 }),
    svc('world', ['SA'], ['*'], { ddp: true, days_min: 3, days_max: 8, sort: 3 }),
  ],
  prices: [
    { id: 'p-sa', from_country: 'SA', to_country: 'SA', service_id: null, first_kg_sar: 3000, extra_kg_sar: 500, free_over_sar: 50000, active: true },
    { id: 'p-any', from_country: '*', to_country: '*', service_id: null, first_kg_sar: 6500, extra_kg_sar: 1500, free_over_sar: null, active: true },
    { id: 'p-off', from_country: 'SA', to_country: 'AE', service_id: null, first_kg_sar: 1, extra_kg_sar: 1, free_over_sar: null, active: false },
  ],
  zeroRateHouseExports: false,
  ...patch,
});
const sellerA = { id: 'a', kind: 'marketplace' as const, country: 'SA', handling_days: 2 };
const line = (key: string, f: Partial<Line> = {}): Line => ({
  key, product_id: key, name_en: `Item ${key}`, name_ar: `منتج ${key}`, quantity: 1, unit_minor: 11500, weight_g: 400, ship_class: 'standard', dangerous_goods: false,
  hs_code: null, origin_country: null, category_slugs: ['prayer-worship', 'prayer-mats'], policy: {}, permits: [], made_to_measure: false, production_days: 0,
  seller: sellerA, compliance_status: 'pending', ...f,
});

describe('corridors', () => {
  test('a Saudi seller to a Saudi customer: allowed, our invoice, Saudi VAT inside the price, no duties', () => {
    const p = plan(tables(), [line('mat', { quantity: 2 })], 'SA');
    assert.deepEqual(p.blocked, []);
    const s = p.subOrders[0];
    assert.equal(s.kind, 'marketplace');
    assert.equal(s.invoicer, 'platform');
    assert.equal(s.duties_mode, 'none');
    assert.equal(s.lines[0].vat_rate_bp, 1500);
    assert.equal(s.lines[0].vat_minor, 3000, '23000 incl. 15% = 20000 + 3000');
    assert.equal(s.duties_minor, 0);
    assert.equal(s.services[0].id, 'sa-road');
    assert.deepEqual(s.delivery, { mode: 'price', price_id: 'p-sa', amount_minor: 3000, free: false });
    assert.deepEqual([s.days_min, s.days_max], [3, 5], 'two days to pack, then the courier');
  });

  test('a closed corridor blocks the line, with the reason in English and Arabic', () => {
    const p = plan(tables(), [line('mat')], 'GB');
    assert.equal(p.subOrders.length, 0);
    assert.deepEqual(p.blocked, [{ key: 'mat', code: 'corridor_closed', en: 'Item mat can\'t be delivered to GB yet.', ar: 'لا يمكن توصيل منتج mat إلى ب-GB حاليًا.' }]);
    assert.equal(plan(tables(), [line('mat')], 'FR').blocked[0].code, 'corridor_closed', 'unknown destination');
    assert.equal(plan(tables(), [line('x', { seller: { id: 'in1', kind: 'marketplace', country: 'IN', handling_days: 3 } })], 'SA').blocked[0].code, 'corridor_closed');
  });

  test('a pilot corridor opens only for the sellers in it', () => {
    const t = tables();
    assert.equal(corridorFor(t, 'marketplace', 'AE', 'SA', 'ae1').corridor?.id, 'm-ae-sa');
    assert.equal(corridorFor(t, 'marketplace', 'AE', 'SA', 'ae2').corridor, null);
    assert.equal(corridorFor(t, 'marketplace', 'AE', 'SA', 'ae2').closed?.id, 'm-ae-sa');
  });

  test('our own products: domestic, then worldwide with duties on delivery; exports zero-rated only when switched on', () => {
    const own = (k2: string) => line(k2, { seller: null });
    const sa = plan(tables(), [own('dates')], 'SA').subOrders[0];
    assert.deepEqual([sa.kind, sa.delivery.mode, sa.lines[0].vat_rate_bp], ['house', 'zone', 1500]);
    const us = plan(tables(), [own('dates')], 'US').subOrders[0];
    assert.deepEqual([us.duties_mode, us.lines[0].vat_rate_bp, us.duties_minor], ['dap', 1500, 0]);
    assert.equal(plan(tables({ zeroRateHouseExports: true }), [own('dates')], 'US').subOrders[0].lines[0].vat_rate_bp, 0);
  });
});

describe('duties and import tax', () => {
  test('within the GCC customs union, Gulf-made goods pay no duty; others pay the destination rate', () => {
    const ae = { id: 'ae1', kind: 'marketplace' as const, country: 'AE', handling_days: 1 };
    const gulf = plan(tables(), [line('oud', { seller: ae, origin_country: 'AE', compliance_status: 'cleared', hs_code: '330129', category_slugs: ['x'] })], 'SA').subOrders[0];
    assert.deepEqual([gulf.vat_mode, gulf.lines[0].vat_rate_bp, gulf.duties_minor], ['destination', 1500, 0]);
    const imported = plan(tables({ countries: tables().countries.map((x) => (x.code === 'SA' ? { ...x, de_minimis_sar: 0 } : x)) }),
      [line('oud', { seller: ae, origin_country: 'IN', compliance_status: 'cleared', hs_code: '330300', category_slugs: ['x'], unit_minor: 11500, permits: [{ permit_key: 'sfda_ecosma', status: 'verified' }] })], 'SA').subOrders[0];
    assert.equal(imported.lines[0].duty_bp, 1000, 'SA 3303 prefix');
    assert.equal(imported.duties_minor, 1000, '10% of 10000 before VAT');
  });

  test('under the destination\'s de minimis no duty is due', () => {
    const ae = { id: 'ae1', kind: 'marketplace' as const, country: 'AE', handling_days: 1 };
    const s = plan(tables(), [line('oud', { seller: ae, origin_country: 'IN', compliance_status: 'cleared', hs_code: '330129', category_slugs: ['x'] })], 'SA').subOrders[0];
    assert.equal(s.duties_minor, 0, 'SA de minimis 1,000 SAR');
  });

  test('the longest HS prefix wins, else the country default', () => {
    const t = tables();
    const gb = t.countries.find((x) => x.code === 'GB')!;
    assert.equal(dutyBp(t, gb, '3303.00.10'), 0);
    assert.equal(dutyBp(t, gb, '330499'), 650);
    assert.equal(dutyBp(t, gb, '9403'), 500);
  });

  test('an open low-value route collects the destination VAT at checkout, with the rates from the tables', () => {
    const t = tables();
    t.corridors = t.corridors.map((x) => (x.id === 'm-sa-gb' ? { ...x, status: 'open' } : x));
    const s = plan(t, [line('rug', { compliance_status: 'cleared', hs_code: '570500' })], 'GB').subOrders[0];
    assert.deepEqual([s.vat_mode, s.lines[0].vat_rate_bp, s.import_tax_collected, s.duties_mode], ['destination', 2000, true, 'ddp']);
    assert.equal(s.services[0].id, 'world', 'a duties-paid service');
    assert.equal(s.lines[0].vat_minor, vatInside(11500, 2000));
  });
});

describe('the product and its category', () => {
  test('category routes: domestic-only categories and ship-to lists', () => {
    const spray = line('spray', { policy: { ship_domestic_only: true, ship_to_countries: ['SA'] }, ship_class: 'perfume_spray', dangerous_goods: true, category_slugs: ['x'],
      permits: [{ permit_key: 'sfda_ecosma', status: 'verified' }] });
    assert.equal(plan(tables(), [spray], 'AE').blocked[0].code, 'category_route');
    assert.equal(plan(tables(), [spray], 'SA').subOrders[0].services[0].id, 'sa-road', 'a courier that takes dangerous goods');
  });

  test('dangerous goods need a courier that takes them', () => {
    const spray = line('spray', { ship_class: 'perfume_spray', dangerous_goods: true, compliance_status: 'cleared', category_slugs: ['x'] });
    const p = plan(tables(), [spray], 'AE');
    assert.equal(p.blocked[0].code, 'dangerous_goods');
  });

  test('restricted countries, allowed destinations and customs clearance for cross-border sellers', () => {
    assert.equal(plan(tables(), [line('m', { restricted_countries: ['SA'] })], 'SA').blocked[0].code, 'restricted');
    assert.equal(plan(tables(), [line('m', { allowed_destinations: ['AE'] })], 'SA').blocked[0].code, 'restricted');
    assert.equal(plan(tables(), [line('m')], 'AE').blocked[0].code, 'compliance', 'abroad needs cleared customs data');
    assert.equal(plan(tables(), [line('m', { compliance_status: 'cleared' })], 'AE').subOrders.length, 1);
  });

  test('permits: perfume and oud need the SFDA listing to be sold in Saudi Arabia; ours are checked by our team', () => {
    const oud = (permits: Line['permits']) => line('oud', { ship_class: 'perfume_oil', category_slugs: ['fragrance-oud', 'oud-oils'], permits });
    const p = plan(tables(), [oud([])], 'SA');
    assert.equal(p.blocked[0].code, 'permit');
    assert.match(p.blocked[0].en, /SFDA eCosma/);
    assert.equal(plan(tables(), [oud([{ permit_key: 'sfda_ecosma', status: 'pending' }])], 'SA').blocked[0].code, 'permit');
    assert.equal(plan(tables(), [oud([{ permit_key: 'sfda_ecosma', status: 'verified', expires_on: '2020-01-01' }])], 'SA').blocked[0].code, 'permit', 'expired');
    assert.equal(plan(tables(), [oud([{ permit_key: 'sfda_ecosma', status: 'verified', expires_on: '2099-01-01' }])], 'SA').blocked.length, 0);
    assert.equal(plan(tables(), [{ ...oud([]), seller: null }], 'SA').blocked.length, 0);
  });
});

describe('sub-orders, delivery and made to measure', () => {
  test('one sub-order per seller and one for our own products', () => {
    const b = { id: 'b', kind: 'marketplace' as const, country: 'SA', handling_days: 1 };
    const p = plan(tables(), [line('1'), line('2'), line('3', { seller: b }), line('4', { seller: null })], 'SA');
    assert.deepEqual(p.subOrders.map((s) => [s.group, s.lines.length]), [['a', 2], ['b', 1], ['house', 1]]);
  });

  test('delivery: weight steps, the most specific price, free over a threshold', () => {
    const t = tables();
    assert.deepEqual(deliveryPrice(t, 'SA', 'SA', null, 2500, 10000), { price_id: 'p-sa', amount_minor: 4000, free: false });
    assert.deepEqual(deliveryPrice(t, 'SA', 'SA', null, 500, 60000), { price_id: 'p-sa', amount_minor: 0, free: true });
    assert.deepEqual(deliveryPrice(t, 'SA', 'AE', null, 900, 10000), { price_id: 'p-any', amount_minor: 6500, free: false }, 'an inactive row is ignored');
    assert.equal(deliveryPrice({ ...t, prices: [] }, 'SA', 'SA', null, 500, 0), null);
  });

  test('made to measure: production time before shipping, returns only if faulty', () => {
    const thobe = line('thobe', { made_to_measure: true, production_days: 12, policy: { return_policy: 'standard', return_window_days: 14, mtm_return_policy: 'faulty_only' } });
    const s = plan(tables(), [thobe, line('cap', { policy: { return_policy: 'standard', return_window_days: 14 } })], 'SA').subOrders[0];
    assert.equal(s.production_days, 12);
    assert.deepEqual([s.days_min, s.days_max], [15, 17]);
    assert.deepEqual(s.lines.map((l) => [l.key, l.return_policy, l.return_window_days]), [['thobe', 'faulty_only', 14], ['cap', 'standard', 14]]);
    assert.equal(plan(tables(), [line('x', { policy: { return_policy: 'none' } })], 'SA').subOrders[0].lines[0].return_window_days, 0);
  });
});

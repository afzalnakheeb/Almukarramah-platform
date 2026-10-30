// The country rulebook. Every order line is decided here, on the server, from the tables (countries, corridors,
// duty rates, permits, approved carrier services, delivery prices) and the product's own compliance data:
//   allowed or not (and why, in English and Arabic); which corridor, who invoices and under which VAT; duties paid
//   at checkout (DDP), on delivery (DAP) or none; whether the destination's import VAT/GST is collected at checkout;
//   which approved carrier services may carry the parcel; what the customer pays for delivery; when it can arrive
//   (including the production time of made-to-measure pieces); and the return policy that applies.
// Pure: no imports, no I/O, no rates in code. Unit-tested in supabase/tests/rules.test.ts.

export type Country = {
  code: string; name_en: string; name_ar: string; currency: string; vat_rate_bp: number; import_duty_bp: number; de_minimis_sar: number;
  customs_union: string | null; import_tax_regime: string; import_tax_threshold_minor: number | null; platform_collects_import_tax: boolean;
};
export type Corridor = {
  id: string; scope: 'house' | 'marketplace'; from_country: string; to_country: string; phase: number; status: 'closed' | 'pilot' | 'open';
  invoicer: 'platform' | 'seller'; vat_mode: 'origin' | 'destination' | 'zero'; duties_mode: 'none' | 'ddp' | 'dap';
  platform_collects_import_tax: boolean; pilot_seller_ids: string[];
};
export type DutyRate = { country: string; hs_prefix: string; duty_bp: number };
export type PermitRule = {
  to_country: string; permit_key: string; label_en: string; label_ar: string; hs_prefixes: string[]; ship_classes: string[]; category_slugs: string[];
  imports_only: boolean; applies_to_house: boolean; active: boolean;
};
export type CarrierService = {
  id: string; provider_id: string; code: string; carrier_name: string; service_name: string; service_name_ar: string | null;
  from_countries: string[]; to_countries: string[]; domestic_only: boolean; dangerous_goods: boolean; ddp: boolean;
  days_min: number; days_max: number; active: boolean; sort: number;
};
export type DeliveryPrice = { id: string; from_country: string; to_country: string; service_id: string | null; first_kg_sar: number; extra_kg_sar: number; free_over_sar: number | null; active: boolean };
export type Tables = {
  countries: Country[]; corridors: Corridor[]; dutyRates: DutyRate[]; permitRules: PermitRule[]; services: CarrierService[]; prices: DeliveryPrice[];
  /** store_settings.zero_rate_exports: our own exports zero-rated (only once the accountant confirms the evidence) */
  zeroRateHouseExports: boolean;
  /** the country our own products ship from */
  houseCountry?: string;
};

export type ReturnPolicy = 'standard' | 'unopened_only' | 'faulty_only' | 'none';
export type Line = {
  key: string; product_id: string; variant_id?: string | null; name_en: string; name_ar: string; quantity: number;
  /** price of one, in halalas, VAT included (options and design add-ons already added) */
  unit_minor: number; weight_g: number;
  ship_class: string; dangerous_goods: boolean; hs_code: string | null; origin_country: string | null; category_slugs: string[];
  policy: {
    ship_domestic_only?: boolean | null; ship_to_countries?: string[] | null; ship_from_countries?: string[] | null;
    return_policy?: ReturnPolicy | null; return_window_days?: number | null; mtm_return_policy?: ReturnPolicy | null;
  };
  allowed_destinations?: string[] | null; restricted_countries?: string[] | null; compliance_status?: string | null;
  permits: { permit_key: string; status: string; expires_on?: string | null }[];
  made_to_measure: boolean; production_days: number;
  seller: { id: string; kind: 'marketplace' | 'partner'; country: string; handling_days: number } | null;
};
export type Blocked = { key: string; code: string; en: string; ar: string };
export type PlannedLine = Line & {
  line_total_minor: number; vat_rate_bp: number; vat_minor: number; duty_bp: number; duty_minor: number;
  return_policy: ReturnPolicy; return_window_days: number;
};
export type SubOrderPlan = {
  group: string; seller_id: string | null; kind: 'house' | 'marketplace' | 'partner'; from_country: string; to_country: string;
  corridor_id: string; invoicer: Corridor['invoicer']; vat_mode: Corridor['vat_mode']; duties_mode: Corridor['duties_mode'];
  import_tax_regime: string; import_tax_collected: boolean;
  services: CarrierService[]; service_id: string | null; weight_g: number;
  delivery: { mode: 'zone' } | { mode: 'price'; price_id: string; amount_minor: number; free: boolean };
  handling_days: number; production_days: number; days_min: number; days_max: number;
  items_minor: number; vat_minor: number; duties_minor: number; lines: PlannedLine[];
};
export type Plan = { subOrders: SubOrderPlan[]; blocked: Blocked[] };

const LOW_VALUE = ['uk_low_value', 'eu_ioss', 'au_low_value', 'nz_low_value', 'ca_low_value'];

/** VAT inside a VAT-inclusive amount. */
export const vatInside = (gross: number, rateBp: number) => (rateBp <= 0 ? 0 : Math.round((gross * rateBp) / (10000 + rateBp)));

/** The corridor a line travels on, if it is open (or a pilot that includes the seller). */
export function corridorFor(t: Tables, scope: Corridor['scope'], from: string, to: string, sellerId: string | null): { corridor: Corridor | null; closed: Corridor | null } {
  const rows = t.corridors.filter((c) => c.scope === scope && c.from_country === from && (c.to_country === to || c.to_country === '*'))
    .sort((a, b) => Number(b.to_country === to) - Number(a.to_country === to));
  const best = rows[0] ?? null;
  if (!best) return { corridor: null, closed: null };
  const ok = best.status === 'open' || (best.status === 'pilot' && !!sellerId && best.pilot_seller_ids.includes(sellerId));
  return ok ? { corridor: best, closed: null } : { corridor: null, closed: best };
}

/** The customs duty rate for an HS code in a country: the longest matching prefix, else the country's default. */
export function dutyBp(t: Tables, country: Country, hs: string | null): number {
  const code = (hs ?? '').replace(/\D/g, '');
  const hit = t.dutyRates.filter((d) => d.country === country.code && code.startsWith(d.hs_prefix)).sort((a, b) => b.hs_prefix.length - a.hs_prefix.length)[0];
  return hit ? hit.duty_bp : country.import_duty_bp;
}

/** Permits the destination requires for this line (none when the line is our own and the rule does not cover ours). */
export function permitsNeeded(t: Tables, l: Line, from: string, to: string): PermitRule[] {
  const hs = (l.hs_code ?? '').replace(/\D/g, '');
  return t.permitRules.filter((r) => r.active && r.to_country === to
    && (!r.imports_only || from !== to) && (l.seller || r.applies_to_house)
    && (r.hs_prefixes.some((p) => hs.startsWith(p)) || r.ship_classes.includes(l.ship_class) || r.category_slugs.some((s) => l.category_slugs.includes(s))));
}

/** Approved services for a parcel on this route, best first. */
export function servicesFor(t: Tables, from: string, to: string, dangerous: boolean, ddp: boolean): CarrierService[] {
  return t.services.filter((s) => s.active
    && (s.from_countries.includes(from) || s.from_countries.includes('*'))
    && (s.to_countries.includes(to) || s.to_countries.includes('*'))
    && (!s.domestic_only || from === to)
    && (!dangerous || s.dangerous_goods)
    && (!ddp || from === to || s.ddp)).sort((a, b) => a.sort - b.sort);
}

/** What the customer pays for delivery: the most specific active price row (exact countries first, then the service). */
export function deliveryPrice(t: Tables, from: string, to: string, serviceId: string | null, weightG: number, goodsMinor: number) {
  const score = (p: DeliveryPrice) => (p.from_country === from ? 4 : 0) + (p.to_country === to ? 4 : 0) + (p.service_id && p.service_id === serviceId ? 1 : 0);
  const row = t.prices.filter((p) => p.active && (p.from_country === from || p.from_country === '*') && (p.to_country === to || p.to_country === '*')
    && (!p.service_id || p.service_id === serviceId)).sort((a, b) => score(b) - score(a))[0];
  if (!row) return null;
  const kg = Math.max(1, Math.ceil(weightG / 1000));
  const free = row.free_over_sar !== null && goodsMinor >= row.free_over_sar;
  return { price_id: row.id, amount_minor: free ? 0 : row.first_kg_sar + (kg - 1) * row.extra_kg_sar, free };
}

function returnsFor(l: Line): { return_policy: ReturnPolicy; return_window_days: number } {
  const policy = l.made_to_measure ? (l.policy.mtm_return_policy ?? 'faulty_only') : (l.policy.return_policy ?? 'standard');
  return { return_policy: policy, return_window_days: policy === 'none' ? 0 : Math.max(0, l.policy.return_window_days ?? 14) };
}

/** Decides every line and groups the allowed ones into one sub-order per seller (and one for our own products). */
export function plan(t: Tables, lines: Line[], to: string): Plan {
  const house = t.houseCountry ?? 'SA';
  const dest = to.toUpperCase();
  const country = (c: string) => t.countries.find((x) => x.code === c);
  const toC = country(dest);
  const blocked: Blocked[] = [];
  const name = (c: Country | undefined, code: string, lang: 'en' | 'ar') => (c ? (lang === 'ar' ? c.name_ar : c.name_en) : code);
  const block = (l: Line, code: string, en: string, ar: string) => blocked.push({ key: l.key, code, en, ar });
  type Ok = { l: Line; corridor: Corridor; from: string };
  const ok: Ok[] = [];

  for (const l of lines) {
    const from = l.seller?.country ?? house;
    const scope: Corridor['scope'] = l.seller?.kind === 'marketplace' ? 'marketplace' : 'house';
    const where = { en: name(toC, dest, 'en'), ar: name(toC, dest, 'ar') };
    const { corridor } = corridorFor(t, scope, from, dest, l.seller?.id ?? null);
    if (!toC || !corridor) { block(l, 'corridor_closed', `${l.name_en} can't be delivered to ${where.en} yet.`, `لا يمكن توصيل ${l.name_ar} إلى ${where.ar} حاليًا.`); continue; }
    const p = l.policy;
    if ((p.ship_domestic_only && from !== dest) || (p.ship_to_countries?.length && !p.ship_to_countries.includes(dest))
        || (p.ship_from_countries?.length && !p.ship_from_countries.includes(from))) {
      block(l, 'category_route', `${l.name_en} can only be delivered within ${name(country(from), from, 'en')}.`, `لا يمكن توصيل ${l.name_ar} إلا داخل ${name(country(from), from, 'ar')}.`);
      continue;
    }
    if (l.restricted_countries?.includes(dest) || (l.allowed_destinations?.length && !l.allowed_destinations.includes(dest))) {
      block(l, 'restricted', `${l.name_en} cannot be sent to ${where.en}.`, `لا يمكن إرسال ${l.name_ar} إلى ${where.ar}.`); continue;
    }
    if (from !== dest && l.seller && l.compliance_status !== 'cleared') {
      block(l, 'compliance', `${l.name_en} is not yet cleared for shipping abroad.`, `لم يُعتمد ${l.name_ar} بعد للشحن خارج بلده.`); continue;
    }
    const today = new Date().toISOString().slice(0, 10);
    const missing = permitsNeeded(t, l, from, dest).filter((r) => !l.permits.some((x) => x.permit_key === r.permit_key && x.status === 'verified' && (!x.expires_on || x.expires_on >= today)));
    if (missing.length) {
      block(l, 'permit', `${l.name_en} is not yet cleared for sale in ${where.en} (${missing.map((m) => m.label_en).join(', ')}).`,
        `لم يُعتمد ${l.name_ar} بعد للبيع في ${where.ar} (${missing.map((m) => m.label_ar).join('، ')}).`);
      continue;
    }
    ok.push({ l, corridor, from });
  }

  // one sub-order per seller (our own products together)
  const groups = new Map<string, Ok[]>();
  for (const x of ok) groups.set(x.l.seller?.id ?? 'house', [...(groups.get(x.l.seller?.id ?? 'house') ?? []), x]);
  const subOrders: SubOrderPlan[] = [];
  for (const [group, xs] of groups) {
    const { corridor, from } = xs[0];
    const seller = xs[0].l.seller;
    const kind: SubOrderPlan['kind'] = !seller ? 'house' : seller.kind === 'partner' ? 'partner' : 'marketplace';
    const fromC = country(from)!;
    const dangerous = xs.some((x) => x.l.dangerous_goods || x.l.ship_class === 'perfume_spray');
    const ddp = corridor.duties_mode === 'ddp' && from !== dest;
    const services = kind === 'house' ? [] : servicesFor(t, from, dest, dangerous, ddp);
    if (kind !== 'house' && !services.length) {
      for (const x of xs) {
        if (dangerous && (x.l.dangerous_goods || x.l.ship_class === 'perfume_spray')) {
          block(x.l, 'dangerous_goods', `${x.l.name_en} contains alcohol and cannot be carried to ${name(toC, dest, 'en')} by our couriers.`,
            `يحتوي ${x.l.name_ar} على كحول ولا يمكن لشركات الشحن لدينا نقله إلى ${name(toC, dest, 'ar')}.`);
        } else {
          block(x.l, 'no_carrier', `We have no courier for ${x.l.name_en} to ${name(toC, dest, 'en')} yet.`, `لا تتوفر لدينا شركة شحن لتوصيل ${x.l.name_ar} إلى ${name(toC, dest, 'ar')} حاليًا.`);
        }
      }
      continue;
    }

    // VAT, duties and import tax per line
    const vatRate = corridor.vat_mode === 'zero' ? 0
      : corridor.vat_mode === 'destination' ? toC!.vat_rate_bp
      : kind === 'house' && from !== dest && t.zeroRateHouseExports ? 0 : fromC.vat_rate_bp;
    const goods = xs.reduce((s, x) => s + x.l.unit_minor * x.l.quantity, 0);
    const union = fromC.customs_union && fromC.customs_union === toC!.customs_union ? fromC.customs_union : null;
    const underDeMinimis = goods < toC!.de_minimis_sar;
    const lowValue = LOW_VALUE.includes(toC!.import_tax_regime);
    const collect = corridor.platform_collects_import_tax && toC!.platform_collects_import_tax && lowValue
      && toC!.import_tax_threshold_minor !== null && corridor.vat_mode === 'destination';
    const planned: PlannedLine[] = xs.map(({ l }) => {
      const total = l.unit_minor * l.quantity;
      const vat = vatInside(total, vatRate);
      const fromUnion = !!union && (!l.origin_country || country(l.origin_country)?.customs_union === union);
      const bp = ddp && !fromUnion && !underDeMinimis ? dutyBp(t, toC!, l.hs_code) : 0;
      return { ...l, line_total_minor: total, vat_rate_bp: vatRate, vat_minor: vat, duty_bp: bp, duty_minor: Math.round(((total - vat) * bp) / 10000), ...returnsFor(l) };
    });

    const weight = xs.reduce((g, x) => g + Math.max(1, x.l.weight_g || 500) * x.l.quantity, 0);
    const service = services[0] ?? null;
    let delivery: SubOrderPlan['delivery'] = { mode: 'zone' };
    if (kind !== 'house') {
      const price = deliveryPrice(t, from, dest, service?.id ?? null, weight, goods);
      if (!price) {
        for (const x of xs) block(x.l, 'no_price', `Delivery of ${x.l.name_en} to ${name(toC, dest, 'en')} is not available yet.`, `توصيل ${x.l.name_ar} إلى ${name(toC, dest, 'ar')} غير متاح حاليًا.`);
        continue;
      }
      delivery = { mode: 'price', ...price };
    }
    const handling = seller?.handling_days ?? 1;
    const production = Math.max(0, ...planned.filter((x) => x.made_to_measure).map((x) => x.production_days || 0));
    subOrders.push({
      group, seller_id: seller?.id ?? null, kind, from_country: from, to_country: dest, corridor_id: corridor.id,
      invoicer: corridor.invoicer, vat_mode: corridor.vat_mode, duties_mode: from === dest ? 'none' : corridor.duties_mode,
      import_tax_regime: toC!.import_tax_regime, import_tax_collected: collect,
      services, service_id: service?.id ?? null, weight_g: weight, delivery,
      handling_days: handling, production_days: production,
      days_min: handling + production + (service?.days_min ?? 1), days_max: handling + production + (service?.days_max ?? 5),
      items_minor: goods, vat_minor: planned.reduce((s, x) => s + x.vat_minor, 0), duties_minor: planned.reduce((s, x) => s + x.duty_minor, 0), lines: planned,
    });
  }
  return { subOrders, blocked };
}

// The checkout on the server: the bag priced (cart.ts), every line decided by the rulebook (rules.ts) from the
// tables, delivery for each seller's parcel (the platform's price) and for our own products (the delivery zone the
// customer picks), duties when they are paid at checkout, and the totals in the shopper's currency.
import { priceCart, type CartItem, type PricedLine } from './cart.ts';
import { plan, vatInside, type Blocked, type SubOrderPlan, type Tables } from './rules.ts';
import { quotes, type Quote } from './shipping.ts';
import type { Db } from './util.ts';

export type ShipTo = { kind: string; recipient_name?: string; phone?: string; country: string; city: string; line1?: string; line2?: string; hotel_name?: string };

export async function loadTables(db: Db): Promise<Tables> {
  const [countries, corridors, dutyRates, permitRules, services, prices, settings] = await Promise.all([
    db.from('countries').select('code, name_en, name_ar, currency, vat_rate_bp, import_duty_bp, de_minimis_sar, customs_union, import_tax_regime, import_tax_threshold_minor, platform_collects_import_tax'),
    db.from('corridors').select('id, scope, from_country, to_country, phase, status, invoicer, vat_mode, duties_mode, platform_collects_import_tax, pilot_seller_ids'),
    db.from('duty_rates').select('country, hs_prefix, duty_bp'),
    db.from('permit_rules').select('to_country, permit_key, label_en, label_ar, hs_prefixes, ship_classes, category_slugs, imports_only, applies_to_house, active'),
    db.from('carrier_services').select('id, provider_id, code, carrier_name, service_name, service_name_ar, from_countries, to_countries, domestic_only, dangerous_goods, ddp, days_min, days_max, active, sort'),
    db.from('delivery_prices').select('id, from_country, to_country, service_id, first_kg_sar, extra_kg_sar, free_over_sar, active'),
    db.from('store_settings').select('zero_rate_exports').eq('id', 1).single(),
  ]);
  for (const r of [countries, corridors, dutyRates, permitRules, services, prices]) if (r.error) throw r.error;
  return {
    countries: countries.data as Tables['countries'], corridors: corridors.data as Tables['corridors'], dutyRates: dutyRates.data as Tables['dutyRates'],
    permitRules: permitRules.data as Tables['permitRules'], services: services.data as Tables['services'], prices: prices.data as Tables['prices'],
    zeroRateHouseExports: !!settings.data?.zero_rate_exports, houseCountry: 'SA',
  };
}

export type Checkout = {
  priced: PricedLine[]; subOrders: SubOrderPlan[]; blocked: Blocked[];
  /** delivery zones for our own products (null when the bag has none) */
  zones: Quote[] | null; houseSpray: boolean;
};

export async function planCheckout(db: Db, items: CartItem[], shipTo: ShipTo): Promise<Checkout> {
  if (!shipTo?.country || !/^[A-Za-z]{2}$/.test(shipTo.country)) throw new Error('Choose the country to deliver to');
  const priced = await priceCart(db, items);
  const tables = await loadTables(db);
  const p = plan(tables, priced.map((l) => l.rule), shipTo.country.toUpperCase());
  const house = p.subOrders.find((s) => s.kind === 'house');
  const houseSpray = !!house?.lines.some((l) => l.ship_class === 'perfume_spray');
  const zones = house ? await quotes(db, { country: shipTo.country, city: shipTo.city ?? '', kind: shipTo.kind }, house.weight_g, houseSpray) : null;
  return { priced, subOrders: p.subOrders, blocked: p.blocked, zones, houseSpray };
}

/** Amounts in the shopper's currency. A fixed price in that currency applies to plain items of ours (nothing added). */
export function inCurrency(c: Checkout, currency: string, perSar: number, zone: Quote | null) {
  const conv = (sar: number) => Math.round(sar * perSar);
  const byKey = new Map(c.priced.map((l) => [l.key, l]));
  const subOrders = c.subOrders.map((s) => {
    const lines = s.lines.map((pl) => {
      const l = byKey.get(pl.key)!;
      const fixed = !l.seller && !l.custom?.options && !l.variant ? l.product.product_prices.find((x) => x.currency === currency) : undefined;
      const unit = fixed ? fixed.amount_minor : conv(pl.unit_minor);
      const total = unit * pl.quantity;
      const commission = l.commissionBps === null ? null : Math.round((total * l.commissionBps) / 10000);
      return { pl, l, unit, total, vat: vatInside(total, pl.vat_rate_bp), duty: conv(pl.duty_minor), commission };
    });
    const shipping = s.delivery.mode === 'price' ? conv(s.delivery.amount_minor) : zone ? conv(zone.amountSar) : 0;
    const rate = s.lines[0]?.vat_rate_bp ?? 0;
    const items = lines.reduce((n, x) => n + x.total, 0);
    const duties = lines.reduce((n, x) => n + x.duty, 0);
    return {
      s, lines, items, shipping, duties, vat: lines.reduce((n, x) => n + x.vat, 0) + vatInside(shipping, rate),
      commission: lines.reduce((n, x) => n + (x.commission ?? 0), 0),
    };
  });
  const items = subOrders.reduce((n, x) => n + x.items, 0);
  const shipping = subOrders.reduce((n, x) => n + x.shipping, 0);
  const duties = subOrders.reduce((n, x) => n + x.duties, 0);
  return { subOrders, items, shipping, duties, vat: subOrders.reduce((n, x) => n + x.vat, 0), total: items + shipping + duties };
}

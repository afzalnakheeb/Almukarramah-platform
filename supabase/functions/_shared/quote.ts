// The checkout's delivery step, shared by shipping-quote (the website) and shipping-rates (older app versions).
import type { CartItem } from './cart.ts';
import { planCheckout, type ShipTo } from './checkout.ts';
import type { Db } from './util.ts';

export async function deliveryQuote(db: Db, items: CartItem[], shipTo: ShipTo) {
  const c = await planCheckout(db, items, shipTo);
  const sellerName = (group: string) => {
    const l = c.priced.find((x) => x.seller?.id === group);
    return !l?.seller || l.seller.kind === 'partner' ? { en: 'Al Mukarramah', ar: 'المكرّمة' } : { en: l.seller.name_en, ar: l.seller.name_ar ?? l.seller.name_en };
  };
  return {
    // lines that cannot be delivered here, with the reason (the key starts with the line's position in the bag)
    blocked: c.blocked.map((b) => ({ index: Number(b.key.split(':')[0]), code: b.code, en: b.en, ar: b.ar })),
    needsZone: !!c.zones,
    zones: c.zones ?? [],
    reason: c.zones && !c.zones.length && c.houseSpray ? 'perfume_spray' : null,
    parcels: c.subOrders.filter((s) => s.kind !== 'house').map((s) => ({
      group: s.group, name: sellerName(s.group), amountSar: s.delivery.mode === 'price' ? s.delivery.amount_minor : 0, free: s.delivery.mode === 'price' && s.delivery.free,
      daysMin: s.days_min, daysMax: s.days_max, handlingDays: s.handling_days, productionDays: s.production_days,
      dutiesMode: s.duties_mode, dutiesSar: s.duties_minor, service: s.services[0] ? { en: s.services[0].service_name, ar: s.services[0].service_name_ar ?? s.services[0].service_name } : null,
    })),
    house: c.subOrders.find((s) => s.kind === 'house') ? { dutiesMode: c.subOrders.find((s) => s.kind === 'house')!.duties_mode } : null,
  };
}

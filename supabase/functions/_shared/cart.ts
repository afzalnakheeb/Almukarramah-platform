// Prices a cart on the server (never trusting the app): products, sizes, tailoring add-ons and measurements,
// which seller ships what, each seller's delivery charge, and Al Mukarramah's margin per line.
// Al Mukarramah holds no stock: lines with a seller are shipped by that seller (marketplace seller or partner);
// lines without one are shipped through our own delivery zones.
import type { Db } from './util.ts';

export type CartItem = { productId: string; quantity: number; custom?: { size?: string; options?: Record<string, string>; measurements?: Record<string, number>; profileName?: string } };
type ShipTo = { country: string; city: string; kind: string };

type SellerRow = {
  id: string; name_en: string; country: string; kind: string; status: string; ships_to: string[]; handling_days: number;
  ship_home_minor: number; ship_intl_minor: number; ship_overrides: Record<string, number>; free_ship_over_minor: number | null; commission_bps: number;
};

export type PricedLine = {
  product: { id: string; name_en: string; name_ar: string; weight_g: number; ship_class: string; seller_id: string | null };
  quantity: number; unitSar: number; custom: CartItem['custom'] | null; seller: SellerRow | null;
};
export type SellerShipping = { sellerId: string; name: string; amountSar: number; handlingDays: number; partner: boolean };

const REQUIRED: Record<string, string[]> = {
  thobe: ['height', 'neck', 'shoulder', 'chest', 'waist', 'hips', 'sleeve', 'bicep', 'cuff', 'length'],
  abaya: ['height', 'shoulder', 'chest', 'waist', 'hips', 'sleeve', 'bicep', 'cuff', 'length'],
};

export async function priceCart(db: Db, items: CartItem[], shipTo: ShipTo) {
  if (!items.length) throw new Error('Your bag is empty');
  if (items.length > 50) throw new Error('Too many items');
  const { data: products, error } = await db.from('products')
    .select('id, name_en, name_ar, base_price_sar, stock, is_active, listing_status, weight_g, ship_class, restricted_countries, seller_id, made_to_measure, garment, sizes, tailoring, product_prices(currency, amount_minor)')
    .in('id', [...new Set(items.map((i) => i.productId))]);
  if (error) throw error;
  const sellerIds = [...new Set((products ?? []).map((p) => p.seller_id).filter(Boolean))] as string[];
  const { data: sellers } = sellerIds.length
    ? await db.from('sellers').select('id, name_en, country, kind, status, ships_to, handling_days, ship_home_minor, ship_intl_minor, ship_overrides, free_ship_over_minor, commission_bps').in('id', sellerIds)
    : { data: [] as SellerRow[] };
  const country = shipTo.country.toUpperCase();

  const lines: PricedLine[] = items.map((i) => {
    const p = products!.find((x) => x.id === i.productId);
    if (!p || !p.is_active || p.listing_status !== 'approved') throw new Error('A product is no longer available');
    const qty = Math.floor(Number(i.quantity));
    if (!(qty >= 1 && qty <= 99)) throw new Error('Invalid quantity');
    const seller = (sellers ?? []).find((s) => s.id === p.seller_id) as SellerRow | undefined;
    if (p.seller_id && seller?.status !== 'approved') throw new Error(`${p.name_en} is no longer available`);
    if (!p.made_to_measure && p.stock < qty) throw new Error(`Only ${p.stock} left of ${p.name_en}`);
    if ((p.restricted_countries as string[]).includes(country)) throw new Error(`${p.name_en} cannot be sent to ${country}`);

    let unitSar = p.base_price_sar as number;
    let custom: CartItem['custom'] | null = null;
    const sizes = (p.sizes as string[] | null) ?? [];
    if (!p.made_to_measure && sizes.length) {
      if (!i.custom?.size || !sizes.includes(i.custom.size)) throw new Error(`Please choose a size for ${p.name_en}`);
      custom = { size: i.custom.size };
    }
    if (p.made_to_measure) {
      const t = p.tailoring as { options?: { key: string; choices: { id: string; price_minor: number }[] }[] } | null;
      const chosen: Record<string, string> = {};
      for (const o of t?.options ?? []) {
        const pick = i.custom?.options?.[o.key];
        const c = o.choices.find((x) => x.id === pick);
        if (!c) throw new Error(`Please choose every design option for ${p.name_en}`);
        chosen[o.key] = c.id;
        unitSar += Math.max(0, Math.round(c.price_minor || 0));
      }
      const m = i.custom?.measurements ?? {};
      const need = REQUIRED[p.garment === 'abaya' ? 'abaya' : 'thobe'];
      const clean: Record<string, number> = {};
      for (const k of need) {
        const v = Number(m[k]);
        if (!(v >= 10 && v <= 250)) throw new Error(`Measurements for ${p.name_en} are incomplete`);
        clean[k] = Math.round(v * 10) / 10;
      }
      custom = { options: chosen, measurements: clean, profileName: i.custom?.profileName?.slice(0, 40) };
    }
    if (p.ship_class === 'perfume_spray' && seller && (country !== 'SA' || seller.country !== 'SA')) {
      throw new Error(`${p.name_en} is a perfume spray: it can only be delivered within Saudi Arabia from a seller in Saudi Arabia`);
    }
    return { product: p, quantity: qty, unitSar, custom, seller: seller ?? null };
  });

  // Delivery charged by each seller (they ship their own items).
  const bySeller = new Map<string, PricedLine[]>();
  for (const l of lines) if (l.seller) bySeller.set(l.seller.id, [...(bySeller.get(l.seller.id) ?? []), l]);
  const sellerShipping: SellerShipping[] = [];
  for (const [id, group] of bySeller) {
    const s = group[0].seller!;
    const ships = s.ships_to ?? ['*'];
    if (!ships.includes('*') && !ships.includes(country)) throw new Error(`${s.kind === 'partner' ? group[0].product.name_en : s.name_en} does not deliver to ${country} yet`);
    const groupSar = group.reduce((sum, l) => sum + l.unitSar * l.quantity, 0);
    let amount = s.ship_overrides?.[country] ?? (country === s.country ? s.ship_home_minor : s.ship_intl_minor);
    if (s.free_ship_over_minor && groupSar >= s.free_ship_over_minor) amount = 0;
    sellerShipping.push({ sellerId: id, name: s.kind === 'partner' ? 'Al Mukarramah' : s.name_en, amountSar: Math.max(0, Math.round(amount)), handlingDays: s.handling_days, partner: s.kind === 'partner' });
  }

  const house = lines.filter((l) => !l.seller);
  return {
    lines,
    sellerShipping,
    sellerShippingSar: sellerShipping.reduce((s, x) => s + x.amountSar, 0),
    needsZone: house.length > 0,
    houseWeightG: house.reduce((g, l) => g + (l.product.weight_g || 500) * l.quantity, 0),
    houseSpray: house.some((l) => l.product.ship_class === 'perfume_spray'),
  };
}

// Prices a bag on the server (never trusting the app): each product and its option (size, volume, colour), sizes,
// made-to-measure design options (price adjustments added here) and measurements (checked against what that listing
// asks for: no list of measurements is fixed in this code), and everything the rulebook needs about each line.
import type { Line } from './rules.ts';
import { UserError } from './errors.ts';
import type { Db } from './util.ts';

export type CartItem = {
  productId: string; variantId?: string | null; quantity: number;
  custom?: { size?: string; options?: Record<string, string>; measurements?: Record<string, number>; profileName?: string };
};
type Measure = { key: string; min_cm?: number; max_cm?: number; required?: boolean };
type ProductRow = {
  id: string; name_en: string; name_ar: string; base_price_sar: number; stock: number; is_active: boolean; listing_status: string; weight_g: number | null;
  ship_class: string; dangerous_goods: boolean | null; restricted_countries: string[] | null; allowed_destinations: string[] | null; hs_code: string | null;
  origin_country: string | null; compliance_status: string | null; seller_id: string | null; category_id: string | null; made_to_measure: boolean | null;
  garment_style: string | null; sizes: string[] | null;
  tailoring: { production_days?: number; options?: { key: string; choices: { id: string; price_minor?: number }[] }[]; measurements?: Measure[]; style?: string } | null;
  product_prices: { currency: string; amount_minor: number }[];
  product_permits: { permit_key: string; status: string; expires_on: string | null }[];
};
type VariantRow = { id: string; product_id: string; label_en: string; label_ar: string; price_minor: number | null; stock: number; weight_g: number | null; is_active: boolean };
type SellerRow = { id: string; name_en: string; name_ar: string | null; country: string; kind: 'marketplace' | 'partner'; status: string; handling_days: number };
type CategoryRow = { id: string; slug: string; parent_id: string | null };

export type PricedLine = {
  key: string; item: CartItem; product: ProductRow; variant: VariantRow | null; quantity: number;
  /** SAR halalas, VAT included, with the option's price and design add-ons */
  unitSar: number; custom: CartItem['custom'] | null; seller: SellerRow | null; commissionBps: number | null; categoryId: string | null;
  rule: Line;
};

export async function priceCart(db: Db, items: CartItem[]): Promise<PricedLine[]> {
  if (!items.length) throw new UserError('Your bag is empty', 'حقيبتك فارغة');
  if (items.length > 50) throw new UserError('Too many items', 'عدد المنتجات كبير جدًا');
  // the marketplace switch (review M6): sellers' items are sold only once it is on
  const { data: sw } = await db.from('mp_settings').select('marketplace_open').eq('id', 1).maybeSingle();
  const marketOpen = sw?.marketplace_open === true;
  const ids = [...new Set(items.map((i) => i.productId))];
  const { data: products, error } = await db.from('products')
    .select('id, name_en, name_ar, base_price_sar, stock, is_active, listing_status, weight_g, ship_class, dangerous_goods, restricted_countries, allowed_destinations, hs_code, origin_country, compliance_status, seller_id, category_id, made_to_measure, garment_style, sizes, tailoring, product_prices(currency, amount_minor), product_permits(permit_key, status, expires_on)')
    .in('id', ids);
  if (error) throw error;
  const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean))] as string[];
  const { data: variants } = variantIds.length ? await db.from('product_variants').select('id, product_id, label_en, label_ar, price_minor, stock, weight_g, is_active').in('id', variantIds) : { data: [] };
  const sellerIds = [...new Set(((products ?? []) as ProductRow[]).map((p) => p.seller_id).filter(Boolean))] as string[];
  const { data: sellers } = sellerIds.length ? await db.from('sellers').select('id, name_en, name_ar, country, kind, status, handling_days').in('id', sellerIds) : { data: [] };
  const { data: cats } = await db.from('categories').select('id, slug, parent_id');
  const { data: hasVariants } = await db.from('product_variants').select('product_id').in('product_id', ids).eq('is_active', true);
  const withOptions = new Set(((hasVariants ?? []) as { product_id: string }[]).map((x) => x.product_id));
  const chain = (id: string | null) => {
    const out: string[] = [];
    let c = (cats as CategoryRow[] | null)?.find((x) => x.id === id);
    for (let d = 0; c && d < 8; d++) { out.unshift(c.slug); c = (cats as CategoryRow[]).find((x) => x.id === c!.parent_id); }
    return out;
  };
  const policies = new Map<string, Record<string, unknown> | null>();
  const policyOf = async (cat: string | null) => {
    if (!cat) return null;
    if (!policies.has(cat)) policies.set(cat, ((await db.rpc('mp_category_policy', { p_cat: cat })).data as Record<string, unknown> | null) ?? null);
    return policies.get(cat)!;
  };
  const styles = new Map<string, Measure[]>();
  const styleMeasures = async (code: string | null | undefined) => {
    if (!code) return [];
    if (!styles.has(code)) styles.set(code, (((await db.from('garment_styles').select('default_measurements').eq('code', code).maybeSingle()).data?.default_measurements) as Measure[] | null) ?? []);
    return styles.get(code)!;
  };

  const out: PricedLine[] = [];
  // stock is checked for the whole bag: two lines of the same option count together (review L6)
  const taken = new Map<string, number>();
  for (const [n, i] of items.entries()) {
    const p = (products as ProductRow[] | null)?.find((x) => x.id === i.productId);
    if (!p || !p.is_active || p.listing_status !== 'approved') throw new UserError('A product is no longer available', 'لم يعد أحد المنتجات متاحًا');
    const qty = Math.floor(Number(i.quantity));
    if (!(qty >= 1 && qty <= 99)) throw new UserError('Invalid quantity', 'الكمية غير صالحة');
    const seller = (sellers as SellerRow[] | null)?.find((s) => s.id === p.seller_id) ?? null;
    if (p.seller_id && (seller?.status !== 'approved' || !marketOpen)) throw new UserError(`${p.name_en} is no longer available`, `لم يعد «${p.name_ar}» متاحًا`);

    // the option (size, volume...) when the listing has options
    let variant: VariantRow | null = null;
    if (withOptions.has(p.id)) {
      variant = (variants as VariantRow[] | null)?.find((v) => v.id === i.variantId && v.product_id === p.id && v.is_active) ?? null;
      if (!variant) throw new UserError(`Please choose an option for ${p.name_en}`, `يُرجى اختيار أحد خيارات «${p.name_ar}»`);
      const want = (taken.get(variant.id) ?? 0) + qty;
      if (variant.stock < want) throw new UserError(`Only ${variant.stock} left of ${p.name_en} (${variant.label_en})`, `بقي ${variant.stock} فقط من «${p.name_ar}» (${variant.label_ar})`);
      taken.set(variant.id, want);
    } else if (!p.made_to_measure) {
      const want = (taken.get(p.id) ?? 0) + qty;
      if (p.stock < want) throw new UserError(`Only ${p.stock} left of ${p.name_en}`, `بقي ${p.stock} فقط من «${p.name_ar}»`);
      taken.set(p.id, want);
    }

    let unitSar = variant?.price_minor ?? p.base_price_sar;
    let custom: CartItem['custom'] | null = null;
    const sizes = p.sizes ?? [];
    if (!p.made_to_measure && sizes.length && !variant) {
      if (!i.custom?.size || !sizes.includes(i.custom.size)) throw new UserError(`Please choose a size for ${p.name_en}`, `يُرجى اختيار المقاس لـ«${p.name_ar}»`);
      custom = { size: i.custom.size };
    }
    if (p.made_to_measure) {
      const t = p.tailoring ?? {};
      const chosen: Record<string, string> = {};
      for (const o of t.options ?? []) {
        const c = o.choices.find((x) => x.id === i.custom?.options?.[o.key]);
        if (!c) throw new UserError(`Please choose every design option for ${p.name_en}`, `يُرجى اختيار كل خيارات التصميم لـ«${p.name_ar}»`);
        chosen[o.key] = c.id;
        unitSar += Math.max(0, Math.round(c.price_minor || 0));     // design add-ons are priced here, never by the app
      }
      // the measurements this listing asks for (else its style's), within the range the brand can make
      const asked = (t.measurements?.length ? t.measurements : await styleMeasures(p.garment_style ?? t.style)).filter((m) => m.key);
      const given = i.custom?.measurements ?? {};
      const clean: Record<string, number> = {};
      if (asked.length) {
        for (const m of asked) {
          const v = Number(given[m.key]);
          const lo = m.min_cm ?? 10;
          const hi = m.max_cm ?? 300;
          if (!(v >= lo && v <= hi)) {
            if (m.required === false && given[m.key] === undefined) continue;
            throw new UserError(`Measurements for ${p.name_en} are incomplete`, `قياسات «${p.name_ar}» غير مكتملة`);
          }
          clean[m.key] = Math.round(v * 10) / 10;
        }
      } else {
        for (const [k, v] of Object.entries(given).slice(0, 40)) {
          if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && Number(v) >= 10 && Number(v) <= 300) clean[k] = Math.round(Number(v) * 10) / 10;
        }
        if (!Object.keys(clean).length) throw new UserError(`Measurements for ${p.name_en} are incomplete`, `قياسات «${p.name_ar}» غير مكتملة`);
      }
      custom = { options: chosen, measurements: clean, profileName: i.custom?.profileName?.slice(0, 40) };
    }

    const policy = (await policyOf(p.category_id)) ?? {};
    const commission = seller && seller.kind === 'marketplace' && p.category_id
      ? Number((await db.rpc('mp_commission_bps', { p_seller: seller.id, p_cat: p.category_id })).data ?? 2500) : null;
    const key = `${n}:${p.id}:${variant?.id ?? ''}`;
    out.push({
      key, item: i, product: p, variant, quantity: qty, unitSar, custom, seller, commissionBps: commission, categoryId: p.category_id,
      rule: {
        key, product_id: p.id, variant_id: variant?.id ?? null, name_en: p.name_en, name_ar: p.name_ar, quantity: qty, unit_minor: unitSar,
        weight_g: variant?.weight_g ?? p.weight_g ?? 500, ship_class: p.ship_class, dangerous_goods: !!p.dangerous_goods,
        hs_code: p.hs_code, origin_country: p.origin_country, category_slugs: chain(p.category_id),
        policy: {
          ship_domestic_only: policy.ship_domestic_only as boolean | null, ship_to_countries: policy.ship_to_countries as string[] | null,
          ship_from_countries: policy.ship_from_countries as string[] | null, return_policy: policy.return_policy as Line['policy']['return_policy'],
          return_window_days: policy.return_window_days as number | null, mtm_return_policy: policy.mtm_return_policy as Line['policy']['mtm_return_policy'],
        },
        allowed_destinations: p.allowed_destinations, restricted_countries: p.restricted_countries, compliance_status: p.compliance_status,
        permits: p.product_permits ?? [], made_to_measure: !!p.made_to_measure, production_days: Math.max(0, Math.round(p.tailoring?.production_days ?? 0)),
        seller: seller ? { id: seller.id, kind: seller.kind, country: seller.country, handling_days: seller.handling_days } : null,
      },
    });
  }
  return out;
}

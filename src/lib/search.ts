// Search across our own products and the marketplace. Once the marketplace is switched on, the database does it
// (mp_search: one index for English and Arabic, filters, facets). Before that, and in the screenshot build, the same
// rules run here over the catalogue snapshot (and the example listings), so the page works the same either way.
import { normalizeForSearch, searchLocal, type SearchDoc, type SearchParams } from '../../supabase/functions/_shared/search';
import { MARKET_DEMO, MARKET_LIVE } from './flags';
import { attributesOf, pathOf, type Guidance } from './market';
import { DEMO_LISTINGS, DEMO_SELLER, demoListing } from './market-demo';
import { snapshot } from './snapshot';
import { fromDb, supabase } from './supabase';

export type { SearchParams };
export { normalizeForSearch };
type Named = { slug: string; name_en: string; name_ar: string };
export type SearchItem = {
  id: string; slug: string; name_en: string; name_ar: string; brand: string | null; images: string[]; base_price_sar: number; price_from: number;
  has_variants: boolean; stock: number; rating_avg: number | null; rating_count: number; made_to_measure: boolean; category: Named | null; seller: Named | null;
};
export type AttributeFacet = {
  key: string; label_en: string; label_ar: string; type: string; unit?: string | null;
  values: { value: string; count: number; en: string; ar: string }[] | { min: number | null; max: number | null } | null;
};
export type SearchResult = {
  total: number; page: number; page_size: number; sort: string; items: SearchItem[];
  facets: {
    price: { min: number | null; max: number | null }; categories: (Named & { count: number })[]; sellers: (Named & { count: number })[]; house: number;
    rating: { min: number; count: number }[]; attributes: AttributeFacet[];
  };
};

/** Our catalogue (and, in the screenshot build, the example listings) as search documents. */
function localDocs(g: Guidance): { docs: SearchDoc[]; items: Map<string, SearchItem> } {
  const bySlug = new Map(g.categories.map((c) => [c.slug, c]));
  const catId = (slug: string) => bySlug.get(slug)?.id ?? null;
  const pathSlugs = (slug: string | null | undefined) => {
    const c = slug ? bySlug.get(slug) : undefined;
    return c ? pathOf(g, c).map((x) => x.slug) : slug ? [slug] : [];
  };
  const docs: SearchDoc[] = [];
  const items = new Map<string, SearchItem>();
  for (const p of snapshot.products) {
    const cat = p.categories?.slug ?? null;
    const seller = p.sellers?.kind === 'marketplace' ? p.sellers : null;
    docs.push({ id: p.id, slug: p.slug, name_en: p.name_en, name_ar: p.name_ar, brand: p.brand, sku: p.sku, description_en: p.description_en, description_ar: p.description_ar,
      attributes: p.attributes ?? null, price: p.base_price_sar, category_slug: cat, category_path: pathSlugs(cat), seller_slug: seller?.slug ?? null,
      made_to_measure: !!p.made_to_measure, featured: p.is_featured, created_at: p.updated_at });
    items.set(p.id, { id: p.id, slug: p.slug, name_en: p.name_en, name_ar: p.name_ar, brand: p.brand ?? null, images: p.images.slice(0, 2), base_price_sar: p.base_price_sar,
      price_from: p.base_price_sar, has_variants: false, stock: p.stock, rating_avg: null, rating_count: 0, made_to_measure: !!p.made_to_measure,
      category: p.categories ? { slug: p.categories.slug, name_en: p.categories.name_en, name_ar: p.categories.name_ar } : null,
      seller: seller ? { slug: seller.slug, name_en: seller.name_en, name_ar: seller.name_ar ?? seller.name_en } : null });
  }
  if (MARKET_DEMO) {
    for (const l of DEMO_LISTINGS.filter((x) => x.listing_status === 'approved' || x.id === 'demo-queue-oud' || x.id === 'demo-review')) {
      const d = demoListing(l.id, catId)!;
      const c = g.categories.find((x) => x.id === d.category_id);
      const seller = { slug: DEMO_SELLER.seller.slug, name_en: DEMO_SELLER.seller.name_en, name_ar: DEMO_SELLER.seller.name_ar ?? DEMO_SELLER.seller.name_en };
      docs.push({ id: d.id, slug: d.slug, name_en: d.name_en, name_ar: d.name_ar, description_en: d.description_en, description_ar: d.description_ar, attributes: d.attributes,
        price: d.base_price_sar, category_slug: c?.slug ?? null, category_path: pathSlugs(c?.slug), seller_slug: seller.slug, rating_avg: d.id === 'demo-live' ? 4.8 : null,
        featured: d.id === 'demo-live', created_at: d.updated_at });
      items.set(d.id, { id: d.id, slug: d.slug, name_en: d.name_en, name_ar: d.name_ar, brand: String(d.attributes.brand ?? '') || null, images: d.images.slice(0, 2),
        base_price_sar: d.base_price_sar, price_from: d.base_price_sar, has_variants: false, stock: d.stock, rating_avg: d.id === 'demo-live' ? 4.8 : null,
        rating_count: d.id === 'demo-live' ? 23 : 0, made_to_measure: false, category: c ? { slug: c.slug, name_en: c.name_en, name_ar: c.name_ar } : null, seller });
    }
  }
  return { docs, items };
}

export async function searchListings(p: SearchParams, g: Guidance): Promise<SearchResult> {
  if (MARKET_LIVE) {
    const { data, error } = await supabase.rpc('mp_search', { p });
    if (error) throw fromDb(error);
    return data as SearchResult;
  }
  const { docs, items } = localDocs(g);
  const cat = p.category ? g.categories.find((c) => c.slug === p.category) : undefined;
  const attrs = cat ? attributesOf(g, cat).filter((a) => a.filterable && ['select', 'multiselect', 'boolean', 'country', 'number'].includes(a.type)) : [];
  const r = searchLocal(docs, p, attrs.map((a) => a.key));
  const named = (slug: string): Named => {
    const c = g.categories.find((x) => x.slug === slug);
    return { slug, name_en: c?.name_en ?? slug, name_ar: c?.name_ar ?? slug };
  };
  const sellerNamed = (slug: string): Named => {
    const it = [...items.values()].find((x) => x.seller?.slug === slug);
    return it?.seller ?? { slug, name_en: slug, name_ar: slug };
  };
  return {
    total: r.total, page: p.page ?? 1, page_size: p.page_size ?? 24, sort: p.sort ?? (p.q ? 'relevance' : 'featured'),
    items: r.items.map((d) => items.get(d.id)!).filter(Boolean),
    facets: {
      price: r.facets.price, house: r.facets.house,
      categories: r.facets.categories.map((x) => ({ ...named(x.value), count: x.count })),
      sellers: r.facets.sellers.map((x) => ({ ...sellerNamed(x.value), count: x.count })),
      rating: [4, 3].map((min) => ({ min, count: r.items.filter((d) => (d.rating_avg ?? 0) >= min).length })),
      attributes: attrs.map((a) => {
        const v = r.facets.attributes[a.key];
        return {
          key: a.key, label_en: a.label_en, label_ar: a.label_ar, type: a.type, unit: a.unit ?? null,
          values: Array.isArray(v) ? v.map((x) => {
            const o = a.options?.find((y) => y.value === x.value);
            return { value: x.value, count: x.count, en: o?.en ?? x.value, ar: o?.ar ?? x.value };
          }) : v ?? null,
        };
      }),
    },
  };
}

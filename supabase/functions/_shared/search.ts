// Search text normalisation and a small in-memory search, shared by the website (before the marketplace is switched
// on, and in the screenshot build) and the tests. No imports: the app imports this file directly.
// private.ar_normalize() in supabase/migrations/0017_listings_search.sql does exactly the same as normalizeForSearch;
// mp_search() is the server's version of searchLocal.

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
const FROM = 'إأآٱىةیک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const TO = 'اااايهيك01234567890123456789';
const MAP = new Map([...FROM].map((c, i) => [c, TO[i]]));

/** Lower case; Arabic diacritics and tatweel removed; letter variants unified; Arabic-Indic digits to 0-9. */
export function normalizeForSearch(s: string): string {
  return [...s.toLowerCase().replace(DIACRITICS, '')].map((c) => MAP.get(c) ?? c).join('').replace(/\s+/g, ' ').trim();
}

export type SearchDoc = {
  id: string; slug: string; name_en: string; name_ar: string; brand?: string | null; sku?: string | null;
  description_en?: string | null; description_ar?: string | null; attributes?: Record<string, unknown> | null;
  price: number; category_slug: string | null; category_path: string[]; seller_slug: string | null;
  rating_avg?: number | null; made_to_measure?: boolean; featured?: boolean; created_at?: string;
};
export type SearchParams = {
  q?: string; category?: string; seller?: string; min_price?: number; max_price?: number; rating_min?: number; made_to_measure?: boolean;
  attributes?: Record<string, unknown>; sort?: 'relevance' | 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'rating'; page?: number; page_size?: number;
};
export type FacetValue = { value: string; count: number };
export type LocalResult = {
  total: number; items: SearchDoc[];
  facets: { categories: FacetValue[]; sellers: FacetValue[]; house: number; price: { min: number | null; max: number | null }; attributes: Record<string, FacetValue[] | { min: number; max: number }> };
};

/** The text values of a listing's attributes (not their keys), as private.product_search_text() reads them. */
const attributeText = (a: Record<string, unknown> | null | undefined) =>
  Object.values(a ?? {}).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])).join(' ');
const textOf = (d: SearchDoc) => normalizeForSearch([d.name_en, d.name_ar, d.brand, d.sku, d.description_en, d.description_ar, attributeText(d.attributes)].filter(Boolean).join(' '));

function attrMatch(v: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return want.some((w) => (Array.isArray(v) ? v.map(String).includes(String(w)) : String(v) === String(w)));
  if (want && typeof want === 'object') {
    const n = Number(v);
    const { min, max } = want as { min?: number; max?: number };
    return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
  }
  return Array.isArray(v) ? v.map(String).includes(String(want)) : v === want || String(v) === String(want);
}

/** The same rules as mp_search: every word must match as a prefix (or the whole query as a substring). */
export function searchLocal(docs: SearchDoc[], p: SearchParams, facetKeys: string[] = []): LocalResult {
  const q = normalizeForSearch(p.q ?? '');
  const words = q.split(' ').filter(Boolean);
  const scored = docs.map((d) => {
    const text = textOf(d);
    const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const hit = !q || text.includes(q) || words.every((w) => tokens.some((t) => t.startsWith(w)));
    const rank = q ? words.filter((w) => tokens.some((t) => t === w)).length + (normalizeForSearch(`${d.name_en} ${d.name_ar}`).includes(q) ? 2 : 0) : 0;
    return { d, hit, rank };
  }).filter((x) => x.hit
    && (!p.category || x.d.category_path.includes(p.category))
    && (!p.seller || x.d.seller_slug === p.seller)
    && (p.rating_min === undefined || (x.d.rating_avg ?? 0) >= p.rating_min)
    && (p.made_to_measure === undefined || !!x.d.made_to_measure === p.made_to_measure)
    && Object.entries(p.attributes ?? {}).every(([k, want]) => attrMatch(x.d.attributes?.[k], want)));
  const prices = scored.map((x) => x.d.price);
  const priced = scored.filter((x) => (p.min_price === undefined || x.d.price >= p.min_price) && (p.max_price === undefined || x.d.price <= p.max_price));
  const sort = p.sort ?? (q ? 'relevance' : 'featured');
  priced.sort((a, b) =>
    (sort === 'price_asc' ? a.d.price - b.d.price : 0) || (sort === 'price_desc' ? b.d.price - a.d.price : 0)
    || (sort === 'rating' ? (b.d.rating_avg ?? 0) - (a.d.rating_avg ?? 0) : 0)
    || (sort === 'newest' ? String(b.d.created_at ?? '').localeCompare(String(a.d.created_at ?? '')) : 0)
    || (sort === 'relevance' ? b.rank - a.rank : 0)
    || Number(!!b.d.featured) - Number(!!a.d.featured) || String(b.d.created_at ?? '').localeCompare(String(a.d.created_at ?? '')));
  const count = (vals: (string | null | undefined)[]) => {
    const m = new Map<string, number>();
    vals.forEach((v) => { if (v) m.set(v, (m.get(v) ?? 0) + 1); });
    return [...m].map(([value, c]) => ({ value, count: c })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const attributes: LocalResult['facets']['attributes'] = {};
  for (const k of facetKeys) {
    const raw = priced.map((x) => x.d.attributes?.[k]).filter((v) => v !== undefined && v !== null && v !== '');
    if (raw.length && raw.every((v) => typeof v === 'number')) attributes[k] = { min: Math.min(...(raw as number[])), max: Math.max(...(raw as number[])) };
    else attributes[k] = count(raw.flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v)])));
  }
  const size = Math.min(48, Math.max(1, p.page_size ?? 24));
  const page = Math.max(1, p.page ?? 1);
  return {
    total: priced.length,
    items: priced.slice((page - 1) * size, page * size).map((x) => x.d),
    facets: {
      categories: count(priced.map((x) => x.d.category_slug)), sellers: count(priced.map((x) => x.d.seller_slug)),
      house: priced.filter((x) => !x.d.seller_slug).length,
      price: { min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null }, attributes,
    },
  };
}

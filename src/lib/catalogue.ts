import { demoPlans, demoProducts, demoTags } from './demo';
import { setRates } from './money';
import { isConfigured, supabase } from './supabase';
import type { Category, Plan, Product, Tag } from './types';

// Public columns only (review notes and AI check results stay with the seller and staff).
export const PRODUCT_COLUMNS = 'id, slug, sku, brand, category_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, is_active, is_featured, ships_international, restricted_countries, images, ship_class, seo_title_en, seo_title_ar, seo_description_en, seo_description_ar, created_at, updated_at, seller_id, listing_status, made_to_measure, garment, sizes, size_chart, tailoring';
const PRODUCT_FIELDS = `${PRODUCT_COLUMNS}, categories(slug, name_en, name_ar), sellers(slug, name_en, name_ar, country, kind), product_prices(currency, amount_minor), product_tags(tags(*))`;

export async function loadRates() {
  if (!isConfigured) return;
  const { data } = await supabase.from('fx_rates').select('currency, per_sar');
  if (data) setRates(Object.fromEntries(data.map((r) => [r.currency, Number(r.per_sar)])));
}

export async function getTags(kind: Tag['kind']): Promise<Tag[]> {
  if (!isConfigured) return demoTags.filter((t) => t.kind === kind);
  const { data, error } = await supabase.from('tags').select('*').eq('kind', kind).order('sort');
  if (error) throw error;
  return data as Tag[];
}

export async function getFeatured(): Promise<Product[]> {
  if (!isConfigured) return demoProducts.filter((p) => p.is_featured);
  const { data, error } = await supabase.from('products').select(PRODUCT_FIELDS).eq('is_featured', true).eq('is_active', true).eq('listing_status', 'approved').limit(8);
  if (error) throw error;
  return data as Product[];
}

export async function getCategories(): Promise<Category[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase.from('categories').select('*').eq('is_active', true).order('sort');
  if (error) throw error;
  return data as Category[];
}

export async function getProducts(filter: { tag?: string; category?: string; minSar?: number; maxSar?: number }): Promise<Product[]> {
  let rows: Product[];
  if (!isConfigured) {
    rows = demoProducts;
  } else {
    let q = supabase.from('products').select(PRODUCT_FIELDS).eq('is_active', true).eq('listing_status', 'approved').order('is_featured', { ascending: false }).order('created_at', { ascending: false });
    if (filter.minSar) q = q.gte('base_price_sar', filter.minSar);
    if (filter.maxSar) q = q.lt('base_price_sar', filter.maxSar);
    const { data, error } = await q;
    if (error) throw error;
    rows = data as Product[];
  }
  if (filter.category) rows = rows.filter((p) => p.categories?.slug === filter.category);
  if (filter.minSar) rows = rows.filter((p) => p.base_price_sar >= filter.minSar!);
  if (filter.maxSar) rows = rows.filter((p) => p.base_price_sar < filter.maxSar!);
  return filter.tag ? rows.filter((p) => p.product_tags?.some((pt) => pt.tags.slug === filter.tag)) : rows;
}

export async function getProduct(slug: string): Promise<Product | null> {
  if (!isConfigured) return demoProducts.find((p) => p.slug === slug) ?? null;
  const { data, error } = await supabase.from('products').select(PRODUCT_FIELDS).eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function getPlans(): Promise<Plan[]> {
  if (!isConfigured) return demoPlans;
  const { data, error } = await supabase.from('plans').select('*').eq('active', true).order('price_sar');
  if (error) throw error;
  return data as Plan[];
}

export async function getSettings() {
  if (!isConfigured) return { store_open: true, checkout_open: true, banner_en: 'Preview: demo catalogue', banner_ar: 'معاينة: كتالوج تجريبي' };
  const { data } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
  return data as { store_open: boolean; checkout_open: boolean; banner_en: string | null; banner_ar: string | null } | null;
}

export const SELLER_COLUMNS = 'id, slug, name_en, name_ar, tagline_en, tagline_ar, about_en, about_ar, country, city, logo, banner, website, ships_to, handling_days, ship_home_minor, ship_intl_minor, ship_overrides, free_ship_over_minor, returns_en, returns_ar, kind, status, created_at';

/** Approved marketplace sellers (partners are never listed). */
export async function getSellers(): Promise<import('./types').Seller[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase.from('sellers').select(SELLER_COLUMNS).eq('status', 'approved').eq('kind', 'marketplace').order('name_en');
  if (error) throw error;
  return data as import('./types').Seller[];
}

export async function getSellerBySlug(slug: string) {
  if (!isConfigured) return null;
  const { data } = await supabase.from('sellers').select(SELLER_COLUMNS).eq('slug', slug).eq('kind', 'marketplace').maybeSingle();
  return data as import('./types').Seller | null;
}

export async function getSellerProducts(sellerId: string): Promise<Product[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase.from('products').select(PRODUCT_FIELDS).eq('seller_id', sellerId).eq('is_active', true).eq('listing_status', 'approved').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Product[];
}

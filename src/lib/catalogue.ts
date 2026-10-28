import { demoPlans, demoProducts, demoTags } from './demo';
import { setRates } from './money';
import { isConfigured, supabase } from './supabase';
import type { Plan, Product, Tag } from './types';

const PRODUCT_FIELDS = '*, product_prices(currency, amount_minor), product_tags(tags(*))';

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
  const { data, error } = await supabase.from('products').select(PRODUCT_FIELDS).eq('is_featured', true).eq('is_active', true).limit(8);
  if (error) throw error;
  return data as Product[];
}

export async function getProducts(filter: { tag?: string; minSar?: number; maxSar?: number }): Promise<Product[]> {
  let rows: Product[];
  if (!isConfigured) {
    rows = demoProducts;
  } else {
    let q = supabase.from('products').select(PRODUCT_FIELDS).eq('is_active', true).order('created_at', { ascending: false });
    if (filter.minSar) q = q.gte('base_price_sar', filter.minSar);
    if (filter.maxSar) q = q.lt('base_price_sar', filter.maxSar);
    const { data, error } = await q;
    if (error) throw error;
    rows = data as Product[];
  }
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

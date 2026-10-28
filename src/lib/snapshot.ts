// The catalogue as it was at build time (scripts/build-catalogue.mjs). Pages render from it first, so
// pre-rendered HTML carries real products for search engines, then refresh from Supabase in the browser.
import data from '@/generated/catalogue.json';
import type { Category, Product } from './types';

export const snapshot = data as unknown as { categories: Category[]; products: Product[]; generated_at: string };

export const snapshotProduct = (slug: string) => snapshot.products.find((p) => p.slug === slug) ?? null;
export const snapshotCategory = (slug: string) => snapshot.categories.find((c) => c.slug === slug) ?? null;
export const snapshotFeatured = () => snapshot.products.filter((p) => p.is_featured).slice(0, 8);
export const snapshotByCategory = (slug: string) => snapshot.products.filter((p) => p.categories?.slug === slug);

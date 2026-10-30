// Marketplace data for the website: the category tree and its policies, the Islamic standard (policy rows), public
// settings and helpers to display them. Pages render from the build-time snapshot first (pre-rendered HTML for search
// engines), then refresh from the database. The server always decides; nothing here is trusted for a decision.
import { useEffect, useState } from 'react';
import snapshot from '@/generated/market-guidance.json';
import { isConfigured, supabase } from './supabase';
import type { Bi } from './guidelines';

/** Demo data for marketplace screens (screenshots before the marketplace tables exist). Set only in the screenshot build. */
import { MARKET_DEMO, MARKET_LIVE } from './flags';
export { MARKET_DEMO, MARKET_LIVE };

export type ReturnPolicy = 'standard' | 'unopened_only' | 'faulty_only' | 'none';
export type CategoryPolicy = {
  commission_bps: number; min_photos: number; min_long_side_px: number; return_policy: ReturnPolicy; return_window_days: number;
  mtm_return_policy: ReturnPolicy; min_price_minor: number | null; ship_domestic_only: boolean; ship_to_countries: string[] | null;
  ship_from_countries: string[] | null; dangerous_goods: boolean; required_documents: string[]; always_review: boolean;
  allow_made_to_measure: boolean; min_shelf_days: number | null;
};
export type AttributeOption = { value: string; en: string; ar: string };
export type CategoryAttribute = {
  key: string; label_en: string; label_ar: string; type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date' | 'country';
  unit?: string; options?: AttributeOption[]; required: boolean; filterable: boolean; min_value?: number; max_value?: number; max_length?: number;
  help_en?: string; help_ar?: string; sort: number; active?: boolean;
};
export type CategoryNode = {
  id: string; slug: string; name_en: string; name_ar: string; kind: 'department' | 'group' | 'category'; parent_id: string | null;
  sort: number; department: 'gifts' | 'fashion'; is_active: boolean; listable: boolean; blurb_en: string | null; blurb_ar: string | null;
  image: string | null; guidance_en: string | null; guidance_ar: string | null; accepted_examples: Bi[]; rejected_examples: Bi[];
  policy: CategoryPolicy | null; attributes: CategoryAttribute[];
};
export type PolicyRule = {
  code: string; level: 'prohibited' | 'restricted'; severity: 'hard' | 'severe'; title_en: string; title_ar: string;
  guidance_en: string; guidance_ar: string; rejected_examples: Bi[]; accepted_examples: Bi[]; needs_scholar_confirmation: boolean;
};
export type DocumentType = { code: string; scope: 'kyc' | 'brand' | 'product'; label_en: string; label_ar: string; help_en: string | null; help_ar: string | null };
export type PublicSettings = {
  allow_modest_models_in_fashion: boolean; min_quality_score: number; quality_weights: Record<string, number>; default_min_photos: number;
  default_min_long_side_px: number; price_change_review_bps: number; strike_limit: number; strike_window_days: number;
  perf_window_days: number; perf_thresholds: PerfThresholds; max_upload_bytes: number; upload_types: string[];
  require_sample?: boolean; min_portfolio_photos?: number; min_story_chars?: number;
};
export type PerfThresholds = {
  late_shipment_bps: { warn: number; suspend: number }; cancellation_bps: { warn: number; suspend: number };
  return_bps: { warn: number; suspend: number }; rating_x100: { warn: number; suspend: number }; min_orders: number;
};
export type PermitRule = { to_country: string; permit_key: string; label_en: string; label_ar: string; category_slugs: string[] };
export type GarmentStyle = { code: string; garment: string; label_en: string; label_ar: string; countries: string[]; default_measurements: { key: string; min_cm?: number; max_cm?: number }[] };
export type KycRequirement = { country: string; doc_type: string; label_en: string; label_ar: string; required: boolean };
export type SellerCountry = { code: string; name_en: string; name_ar: string; open: boolean; phase: number | null };
export type Guidance = {
  categories: CategoryNode[]; rules: PolicyRule[]; documents: DocumentType[]; permits: PermitRule[]; styles: GarmentStyle[]; settings: PublicSettings;
  kyc?: KycRequirement[]; seller_countries?: SellerCountry[];
};

export const guidanceSnapshot = snapshot as unknown as Guidance;

/** The handbook data: the build-time snapshot at once, then the live rows when the marketplace is switched on. */
export function useGuidance(): Guidance {
  const [g, setG] = useState<Guidance>(guidanceSnapshot);
  useEffect(() => {
    if (!isConfigured || !MARKET_LIVE) return;
    supabase.rpc('mp_guidance').then(({ data, error }: { data: Guidance | null; error: unknown }) => {
      if (!error && data?.categories?.length) setG(data);
    }, () => undefined);
  }, []);
  return g;
}

// ---------------------------------------------------------------- the tree
export const childrenOf = (g: Guidance, id: string | null) => g.categories.filter((c) => c.parent_id === id).sort((a, b) => a.sort - b.sort);
export const departments = (g: Guidance) => childrenOf(g, null).filter((c) => c.kind === 'department');
/** The category and its parents, root first. */
export function pathOf(g: Guidance, cat: CategoryNode): CategoryNode[] {
  const out: CategoryNode[] = [];
  let c: CategoryNode | undefined = cat;
  for (let i = 0; c && i < 6; i++) {
    out.unshift(c);
    c = c.parent_id ? g.categories.find((x) => x.id === c!.parent_id) : undefined;
  }
  return out;
}
/** Every listable category under a node (any depth). */
export function leavesUnder(g: Guidance, node: CategoryNode): CategoryNode[] {
  const kids = childrenOf(g, node.id);
  return kids.flatMap((k) => (k.kind === 'category' ? [k] : leavesUnder(g, k)));
}
/** Attributes as the listing form shows them (inherited, the nearest definition wins, hidden ones removed). */
export function attributesOf(g: Guidance, cat: CategoryNode): CategoryAttribute[] {
  const byKey = new Map<string, CategoryAttribute>();
  for (const node of pathOf(g, cat)) for (const a of node.attributes ?? []) byKey.set(a.key, a);
  return [...byKey.values()].filter((a) => a.active !== false).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
}
/** Guidance and examples from the department down to the category. */
export function guidanceOf(g: Guidance, cat: CategoryNode) {
  const p = pathOf(g, cat);
  return {
    en: p.map((n) => n.guidance_en).filter(Boolean) as string[],
    ar: p.map((n) => n.guidance_ar).filter(Boolean) as string[],
    accepted: p.flatMap((n) => n.accepted_examples ?? []),
    rejected: p.flatMap((n) => n.rejected_examples ?? []),
  };
}

// ---------------------------------------------------------------- wording
/** "3 days" in English; in Arabic the counted noun follows the number's grammar. */
export function days(n: number, lang: 'en' | 'ar'): string {
  if (lang === 'en') return `${n} ${n === 1 ? 'day' : 'days'}`;
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}
export const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
export const pick = (b: Bi | { en: string; ar: string }, lang: 'en' | 'ar') => (lang === 'ar' ? b.ar : b.en);

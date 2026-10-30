// Seller dashboard data: the signed-in seller's account, listings, photos and orders.
// Photos are uploaded to a PRIVATE bucket and are only made public by Al Mukarramah when a listing is approved.
import { useCallback, useEffect, useState } from 'react';
import { callFunction, supabase } from './supabase';
import type { Seller, SizeChart, Tailoring } from './types';
import { useSession } from './session';
import { MARKET_DEMO, guidanceSnapshot } from './market';
import { DEMO_LISTINGS, DEMO_MEDIA, DEMO_SELLER, demoListing } from './market-demo';
import type { QualityResult } from '../../supabase/functions/_shared/quality';

export type SellerPrivate = {
  seller_id: string; contact_name: string; contact_email: string; contact_phone: string | null;
  legal_name: string | null; registration_no: string | null; tax_registration_no: string | null; product_summary: string | null;
};
export type MySeller = { seller: Seller & { agreed_guidelines_at: string | null }; private: SellerPrivate | null; role: 'owner' | 'staff' };

export type Reason = { code: string; en: string; ar: string; field?: string; photo?: number };
export type MediaKind = 'listing_photo' | 'seller_logo' | 'seller_banner' | 'portfolio';
export type MediaAsset = {
  id: string; kind: MediaKind; path: string | null; status: 'pending' | 'passed' | 'review' | 'rejected' | 'blocked';
  reasons: Reason[]; flags: string[]; width: number | null; height: number | null; mime?: string;
};
/** The latest screening of a listing, kept on the product for the seller and staff. */
export type AiCheck = {
  verdict: 'pass' | 'review' | 'block' | 'error'; summary_en: string; summary_ar: string; reasons: Reason[];
  draft?: { name_en?: string; name_ar?: string; description_en?: string; description_ar?: string } | null;
  quality_score?: number; checked_at: string; override?: { reason: string; outcome: string; at: string } | null;
};
export type ListingDecision = { verdict: AiCheck['verdict']; reasons: Reason[]; summary_en: string; summary_ar: string; draft?: AiCheck['draft']; quality_score?: number };
export type { QualityResult };

export type Listing = {
  id: string; slug: string; seller_id: string; category_id: string | null;
  name_en: string; name_ar: string; description_en: string | null; description_ar: string | null;
  base_price_sar: number; stock: number; weight_g: number; is_active: boolean; ship_class: 'standard' | 'perfume_spray' | 'perfume_oil';
  images: string[]; listing_status: 'draft' | 'check_pending' | 'pending_review' | 'approved' | 'rejected' | 'suspended'; review_note: string | null;
  attributes: Record<string, unknown>;
  ai_check: AiCheck | null; ai_checked_at: string | null; submitted_at: string | null; updated_at: string;
  made_to_measure: boolean; garment: 'thobe' | 'abaya' | 'other' | null; sizes: string[] | null; size_chart: SizeChart | null; tailoring: Tailoring | null;
};

const LISTING_COLUMNS = 'id, slug, seller_id, category_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, is_active, ship_class, images, listing_status, review_note, ai_check, ai_checked_at, submitted_at, updated_at, made_to_measure, garment, sizes, size_chart, tailoring, attributes';

/** The signed-in user's seller account, if any. */
export function useMySeller() {
  const { session, loading: sessionLoading } = useSession();
  const [data, setData] = useState<MySeller | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (MARKET_DEMO) { setData(DEMO_SELLER); setLoading(false); return; }
    if (!session) { setData(null); setLoading(false); return; }
    setLoading(true);
    const { data: rows } = await supabase.rpc('my_sellers');
    setData(((rows as MySeller[] | null) ?? [])[0] ?? null);
    setLoading(false);
  }, [session?.user.id]);
  useEffect(() => { if (!sessionLoading || MARKET_DEMO) reload(); }, [reload, sessionLoading]);
  return { me: data, loading: MARKET_DEMO ? loading : loading || sessionLoading, reload, session: MARKET_DEMO ? ({ user: { id: 'demo', email: 'seller@example.com' } } as never) : session };
}

export async function applyAsSeller(p: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc('apply_as_seller', { p });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateSeller(id: string, patch: Partial<Seller>) {
  const { error } = await supabase.from('sellers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateSellerPrivate(id: string, patch: Partial<SellerPrivate>) {
  const { error } = await supabase.from('seller_private').update(patch).eq('seller_id', id);
  if (error) throw new Error(error.message);
}

const demoCat = (slug: string) => guidanceSnapshot.categories.find((c) => c.slug === slug)?.id ?? null;

export async function myListings(sellerId: string): Promise<Listing[]> {
  if (MARKET_DEMO) return DEMO_LISTINGS.map((l) => demoListing(l.id, demoCat)!);
  const { data, error } = await supabase.from('products').select(LISTING_COLUMNS).eq('seller_id', sellerId).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as unknown as Listing[];
}

export async function getListing(id: string): Promise<Listing | null> {
  if (MARKET_DEMO) return demoListing(id, demoCat);
  const { data, error } = await supabase.from('products').select(LISTING_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as Listing | null;
}

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Saves a listing (new or existing). Content changes clear the AI check and, for live listings, take them back to draft. */
export async function saveListing(sellerSlug: string, l: Partial<Listing> & { seller_id: string }): Promise<string> {
  const { id, listing_status: _s, review_note: _r, ai_check: _a, ai_checked_at: _c, submitted_at: _u, updated_at: _d, ...fields } = l;
  if (id) {
    const { error } = await supabase.from('products').update(fields).eq('id', id);
    if (error) throw new Error(error.message);
    return id;
  }
  const base = `${sellerSlug}-${slugify(fields.name_en ?? 'product')}`.slice(0, 80);
  for (let n = 1; n < 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const { data, error } = await supabase.from('products').insert({ ...fields, slug }).select('id').single();
    if (!error) return (data as { id: string }).id;
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error('Please choose a different product name');
}

export async function deleteListing(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** The server's view of a listing before submission: quality score, tips and contact details found (no AI, free). */
export async function previewCheck(productId: string): Promise<{ status: string; quality: QualityResult; contacts: { kind: string; field: string; match: string }[] }> {
  return callFunction('listing-check', { productId });
}

/** Submits a listing: the premium standard is checked, then the full AI screening. Blocked listings come straight back. */
export async function submitListing(productId: string): Promise<{ submitted: boolean; status: string; decision?: ListingDecision; quality: QualityResult }> {
  return callFunction('listing-check', { productId, submit: true });
}

export async function setStock(productId: string, stock: number, isActive?: boolean) {
  const { error } = await supabase.from('products').update({ stock, ...(isActive === undefined ? {} : { is_active: isActive }) }).eq('id', productId);
  if (error) throw new Error(error.message);
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Uploads one photo into the seller's private incoming folder and has it screened (type and size from its bytes,
 * hidden location data removed, AI check). Returns the screened asset, or the reasons it was refused.
 * Nothing uploaded here is public.
 */
export async function uploadMedia(sellerId: string, file: File, kind: MediaKind, ctx: { productId?: string; categoryId?: string } = {}):
  Promise<{ asset: MediaAsset | null; reasons: Reason[]; duplicate?: boolean }> {
  if (!ALLOWED.includes(file.type)) return { asset: null, reasons: [{ code: 'type', en: 'Photos must be JPEG, PNG or WebP.', ar: 'يجب أن تكون الصور بصيغة JPEG أو PNG أو WebP.' }] };
  if (file.size > MAX_UPLOAD_BYTES) return { asset: null, reasons: [{ code: 'size', en: 'Each photo must be 10 MB or less.', ar: 'يجب ألا يتجاوز حجم الصورة ١٠ ميغابايت.' }] };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${sellerId}/incoming/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from('seller-uploads').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const r = await callFunction<{ asset: MediaAsset | null; reasons?: Reason[]; duplicate?: boolean }>('screen-image', { path, kind, ...ctx });
  return { asset: r.asset, reasons: r.asset?.reasons?.length ? r.asset.reasons : r.reasons ?? [], duplicate: r.duplicate };
}

/** Screening records for photos already on a listing (status, reasons, size). */
export async function mediaFor(paths: string[]): Promise<Record<string, MediaAsset>> {
  if (MARKET_DEMO) return Object.fromEntries(paths.filter((x) => DEMO_MEDIA[x]).map((x) => [x, DEMO_MEDIA[x]]));
  const ids = paths.map((p) => /([0-9a-f-]{36})\.[a-z]+$/.exec(p)?.[1]).filter(Boolean) as string[];
  if (!ids.length) return {};
  const { data } = await supabase.from('media_assets').select('id, kind, path, status, reasons, flags, width, height, mime').in('id', ids);
  const byId = new Map(((data as MediaAsset[] | null) ?? []).map((a) => [a.id, a]));
  return Object.fromEntries(paths.map((p) => [p, byId.get(/([0-9a-f-]{36})\.[a-z]+$/.exec(p)?.[1] ?? '')]).filter((x) => x[1])) as Record<string, MediaAsset>;
}

/** Viewable links for private media (1 hour); public catalogue links are returned as they are. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (MARKET_DEMO) return Object.fromEntries(paths.map((x) => [x, x]));
  const priv = paths.filter((p) => !/^https?:\/\//.test(p));
  const map: Record<string, string> = Object.fromEntries(paths.filter((p) => /^https?:\/\//.test(p)).map((p) => [p, p]));
  if (priv.length) {
    const { data } = await supabase.storage.from('seller-uploads').createSignedUrls(priv, 3600);
    ((data as { path: string | null; signedUrl: string }[] | null) ?? []).forEach((d) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
  }
  return map;
}

export type SellerOrder = {
  shipment_id: string; status: 'pending' | 'packing' | 'shipped' | 'delivered' | 'cancelled';
  carrier: string | null; tracking_number: string | null; tracking_url: string | null; shipped_at: string | null; shipping_minor: number;
  order_number: number; created_at: string; paid_at: string | null; currency: string;
  ship_to: Record<string, string>; gift_message: string | null;
  items: { name_en: string; quantity: number; unit_price_minor: number; line_total_minor: number; commission_minor: number | null; custom: Record<string, unknown> | null }[];
};

export async function sellerOrders(sellerId: string): Promise<SellerOrder[]> {
  const { data, error } = await supabase.rpc('seller_orders', { p_seller: sellerId });
  if (error) throw new Error(error.message);
  return (data as SellerOrder[]) ?? [];
}

export async function updateShipment(id: string, status: 'packing' | 'shipped' | 'delivered', carrier: string, tracking: string, url: string) {
  const { error } = await supabase.rpc('seller_update_shipment', { p_shipment: id, p_status: status, p_carrier: carrier, p_tracking: tracking, p_url: url });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- listing documents and drafts
export type ProductDocument = { id: string; doc_type: string; status: 'pending' | 'accepted' | 'rejected'; file_name: string | null; note: string | null };

export async function productDocuments(productId: string): Promise<ProductDocument[]> {
  if (MARKET_DEMO) return [];
  const { data, error } = await supabase.from('product_documents').select('id, doc_type, status, file_name, note').eq('product_id', productId).order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ProductDocument[]) ?? [];
}

/** A category's required document (halal certificate, printer licence...) into the private documents bucket. */
export async function uploadProductDocument(sellerId: string, productId: string, docType: string, file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('PDF, JPEG or PNG only');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Up to 10 MB');
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${sellerId}/products/${productId}/${docType}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from('seller-kyc').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from('product_documents').insert({ product_id: productId, doc_type: docType, path, file_name: file.name.slice(0, 200) });
  if (e2) throw new Error(e2.message);
}

/** The AI drafts the other language for the seller to check (never saved by itself; Quran text is never translated). */
export async function draftTranslation(sellerId: string, to: 'ar' | 'en', name: string, description: string) {
  return callFunction<{ name: string; description: string; quran_text_present: boolean }>('translate-draft', { sellerId, to, name, description });
}

/** What a category requires, from the server (falls back to the handbook snapshot before switch-on). */
export async function categoryRequirements(categoryId: string): Promise<{ attributes: import('./market').CategoryAttribute[]; policy: import('./market').CategoryPolicy } | null> {
  if (MARKET_DEMO) return null;
  const { data, error } = await supabase.rpc('mp_category_requirements', { p_cat: categoryId });
  if (error || !data) return null;
  return data as never;
}

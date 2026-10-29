// Seller dashboard data: the signed-in seller's account, listings, photos and orders.
// Photos are uploaded to a PRIVATE bucket and are only made public by Al Mukarramah when a listing is approved.
import { useCallback, useEffect, useState } from 'react';
import { callFunction, supabase } from './supabase';
import type { Seller, SizeChart, Tailoring } from './types';
import { useSession } from './session';

export type SellerPrivate = {
  seller_id: string; contact_name: string; contact_email: string; contact_phone: string | null;
  legal_name: string | null; registration_no: string | null; vat_no: string | null; product_summary: string | null;
};
export type MySeller = { seller: Seller & { agreed_guidelines_at: string | null }; private: SellerPrivate | null; role: 'owner' | 'staff' };

export type AiIssue = { severity: 'block' | 'fix' | 'note'; field: string; photo?: number; en: string; ar: string };
export type AiCheck = {
  verdict: 'pass' | 'review' | 'block'; summary_en: string; summary_ar: string; issues: AiIssue[];
  suggested_ar?: { name?: string; description?: string }; checked_at: string; photos_checked: number;
};

export type Listing = {
  id: string; slug: string; seller_id: string; category_id: string | null;
  name_en: string; name_ar: string; description_en: string | null; description_ar: string | null;
  base_price_sar: number; stock: number; weight_g: number; is_active: boolean; ship_class: 'standard' | 'perfume_spray' | 'perfume_oil';
  images: string[]; listing_status: 'draft' | 'pending_review' | 'approved' | 'rejected'; review_note: string | null;
  ai_check: AiCheck | null; ai_checked_at: string | null; submitted_at: string | null; updated_at: string;
  made_to_measure: boolean; garment: 'thobe' | 'abaya' | 'other' | null; sizes: string[] | null; size_chart: SizeChart | null; tailoring: Tailoring | null;
};

const LISTING_COLUMNS = 'id, slug, seller_id, category_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, is_active, ship_class, images, listing_status, review_note, ai_check, ai_checked_at, submitted_at, updated_at, made_to_measure, garment, sizes, size_chart, tailoring';

/** The signed-in user's seller account, if any. */
export function useMySeller() {
  const { session, loading: sessionLoading } = useSession();
  const [data, setData] = useState<MySeller | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!session) { setData(null); setLoading(false); return; }
    setLoading(true);
    const { data: rows } = await supabase.rpc('my_sellers');
    setData(((rows as MySeller[] | null) ?? [])[0] ?? null);
    setLoading(false);
  }, [session?.user.id]);
  useEffect(() => { if (!sessionLoading) reload(); }, [reload, sessionLoading]);
  return { me: data, loading: loading || sessionLoading, reload, session };
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

export async function myListings(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabase.from('products').select(LISTING_COLUMNS).eq('seller_id', sellerId).order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as unknown as Listing[];
}

export async function getListing(id: string): Promise<Listing | null> {
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

export async function runGuidelineCheck(productId: string): Promise<AiCheck> {
  return callFunction<AiCheck>('listing-check', { productId });
}

export async function submitForReview(productId: string) {
  const { error } = await supabase.from('products').update({ listing_status: 'pending_review' }).eq('id', productId);
  if (error) throw new Error(error.message);
}

export async function setStock(productId: string, stock: number, isActive?: boolean) {
  const { error } = await supabase.from('products').update({ stock, ...(isActive === undefined ? {} : { is_active: isActive }) }).eq('id', productId);
  if (error) throw new Error(error.message);
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
/** Uploads photos (web) into the seller's private folder. Returns storage paths, not public links. */
export async function uploadPhotos(sellerId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    if (!ALLOWED.includes(f.type)) throw new Error('Photos must be JPEG, PNG or WEBP');
    if (f.size > 5 * 1024 * 1024) throw new Error('Each photo must be 5 MB or less');
    const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${sellerId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('seller-uploads').upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new Error(error.message);
    out.push(path);
  }
  return out;
}

/** Viewable links for private uploads (1 hour); public catalogue links are returned as they are. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const priv = paths.filter((p) => !/^https?:\/\//.test(p));
  const map: Record<string, string> = Object.fromEntries(paths.filter((p) => /^https?:\/\//.test(p)).map((p) => [p, p]));
  if (priv.length) {
    const { data } = await supabase.storage.from('seller-uploads').createSignedUrls(priv, 3600);
    (data ?? []).forEach((d) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
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

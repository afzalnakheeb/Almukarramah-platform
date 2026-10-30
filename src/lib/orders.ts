// The customer's view of an order's parcels: one per seller (and one for our own products), each with its status,
// estimate, tracking and the return policy of each item. Read through my_order_tracking (the owner or staff only).
import { MARKET_LIVE } from './flags';
import type { TrackingEvent } from './seller';
import { supabase } from './supabase';

export type ParcelTracking = {
  id: string; number: string; status: string; kind: 'house' | 'marketplace' | 'partner'; seller: { slug: string; name_en: string; name_ar: string } | null;
  items_minor: number; shipping_minor: number; duties_minor: number; duties_mode: string; days_min: number | null; days_max: number | null; production_days: number;
  expected_from: string | null; expected_to: string | null; cancel_reason: string | null; shipped_at: string | null; delivered_at: string | null;
  lines: { name_en: string; name_ar: string; variant: string | null; quantity: number; line_total_minor: number; return_policy: string | null; return_window_days: number | null; product_id: string | null }[];
  shipments: { status: string; tracking_number: string | null; tracking_url: string | null; carrier: string | null; events: TrackingEvent[] }[];
};
export type OrderTracking = { order: { id: string; number: number; status: string; currency: string; duties_minor: number }; sub_orders: ParcelTracking[] };

export async function orderTracking(orderId: string): Promise<OrderTracking | null> {
  if (!MARKET_LIVE) return null;
  const { data, error } = await supabase.rpc('my_order_tracking', { p_order: orderId });
  if (error) return null;
  return data as OrderTracking;
}

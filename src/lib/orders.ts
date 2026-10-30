// The customer's view of an order's parcels: one per seller (and one for our own products), each with its status,
// estimate, tracking, the return policy of each item, returns, reviews and refunds. Read through my_order_tracking (the
// owner or staff only). The screenshot build shows an example order (id "demo-order").
import type { ReturnRequest } from './aftersale';
import { demoOrderTracking } from './aftersale-demo';
import { MARKET_DEMO, MARKET_LIVE } from './flags';
import type { TrackingEvent } from './seller';
import { supabase } from './supabase';

export type ParcelTracking = {
  id: string; number: string; status: string; kind: 'house' | 'marketplace' | 'partner'; seller: { slug: string; name_en: string; name_ar: string } | null;
  items_minor: number; shipping_minor: number; duties_minor: number; duties_mode: string; days_min: number | null; days_max: number | null; production_days: number;
  expected_from: string | null; expected_to: string | null; cancel_reason: string | null; shipped_at: string | null; delivered_at: string | null;
  lines: {
    id: string; name_en: string; name_ar: string; variant: string | null; quantity: number; line_total_minor: number; return_policy: string | null; return_window_days: number | null;
    product_id: string | null; refunded_quantity: number; returnable_quantity: number; change_mind_until: string | null;
    review: { id: string; status: string; rating: number } | null;
  }[];
  shipments: { status: string; tracking_number: string | null; tracking_url: string | null; carrier: string | null; events: TrackingEvent[] }[];
  refunded_minor: number; problem_until: string | null; not_received_from: string | null; thread_id: string | null; returns: ReturnRequest[];
};
export type OrderTracking = {
  order: { id: string; number: number; status: string; currency: string; duties_minor: number; refunded_minor: number };
  refunds: { status: string; amount_minor: number; currency: string; created_at: string; completed_at: string | null; credit_note: string | null }[];
  faulty_claim_days: number; sub_orders: ParcelTracking[];
};

export async function orderTracking(orderId: string): Promise<OrderTracking | null> {
  if (MARKET_DEMO && orderId === 'demo-order') return demoOrderTracking();
  if (!MARKET_LIVE) return null;
  const { data, error } = await supabase.rpc('my_order_tracking', { p_order: orderId });
  if (error) return null;
  return data as OrderTracking;
}

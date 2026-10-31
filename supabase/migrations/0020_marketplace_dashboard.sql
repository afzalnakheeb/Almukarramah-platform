-- Marketplace (9 of 9): our team's dashboard, and public parcel tracking.
-- * admin_marketplace_overview: what needs doing now (the queues), what a failure left half done (paid orders without
--   their tax invoice or not handed on, credit notes and refunds still to finish: finish-pending works through them,
--   review H3), the switches, and how the marketplace is going over a period (sales by sellers and our own products in
--   SAR, commission, refunds, money owed to sellers, the busiest sellers with their standards, where parcels go).
--   Staff only; read only.
-- * track_parcel: the tracking page (/track?number=...) that labels and emails link to. Anyone with the tracking number
--   sees the parcel's progress, as on a courier's site: statuses, times and places, never a name or an address.
create or replace function admin_marketplace_overview(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  today date := private.riyadh_today();
begin
  -- staff, or Claude's connector and scheduled jobs (no API request); never a customer or a seller
  if not private.is_staff_or_server() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return jsonb_build_object(
    'days', v_days,
    'queues', jsonb_build_object(
      'sellers_to_review', (select count(*) from sellers s join seller_applications a on a.seller_id = s.id
                            where s.status in ('pending', 'info_requested') and a.submitted_at is not null),
      'listings_waiting', (select count(*) from products where seller_id is not null and listing_status = 'pending_review'),
      'listings_checking', (select count(*) from products where seller_id is not null and listing_status = 'check_pending'),
      'photos_checking', (select count(*) from media_assets where status = 'pending' and deleted_at is null),
      'returns_to_answer', (select count(*) from return_requests where status = 'requested'),
      'disputes', (select count(*) from return_requests where status = 'escalated'),
      'refunds_to_make', (select count(*) from return_requests where status = 'approved') + (select count(*) from sub_orders where needs_refund),
      'credit_notes_pending', (select count(*) from refunds where credit_note_status = 'pending'),
      'refunds_stuck', (select count(*) from refunds where status = 'processing' and created_at < now() - interval '10 minutes'),
      'reviews_to_publish', (select count(*) from product_reviews where status = 'pending') + (select count(*) from review_replies where status = 'pending'),
      'conversations_flagged', (select count(*) from message_threads where flagged and status = 'open'),
      'awaiting_acceptance', (select count(*) from sub_orders where status = 'awaiting_acceptance' and created_at < now() - interval '24 hours'),
      'late_to_ship', (select count(*) from sub_orders where seller_id is not null and status in ('accepted', 'in_production') and ship_by < today),
      'not_collected', (select count(*) from sub_orders where status = 'ready_to_ship' and ready_at < now() - interval '2 days'),
      'delivery_failed', (select count(*) from sub_orders where status = 'delivery_failed'),
      'shop_pages_to_approve', (select count(*) from sellers where profile_pending is not null),
      'payments_to_resolve', (select count(*) from payment_issues where status in ('open', 'refund_pending')),
      -- orders where Moyasar shows refunds we have no record of (review R3-2)
      'moyasar_unrecorded', (select count(*) from moyasar_refund_checks c join orders o on o.id = c.order_id
                             where c.refunded_minor > o.refunded_minor and not exists (select 1 from refunds f where f.order_id = o.id and f.status = 'processing'))),
    'pending_work', (select jsonb_build_object(
        'orders_without_invoice', jsonb_array_length(w -> 'orders_without_invoice'),
        'orders_not_handed_on', jsonb_array_length(w -> 'orders_not_handed_on'),
        'credit_notes_pending', jsonb_array_length(w -> 'credit_notes'),
        'refunds_processing', jsonb_array_length(w -> 'refunds_processing'),
        'orders_without_invoice_old', jsonb_array_length(w -> 'orders_without_invoice_old'),
        'payment_issues', jsonb_array_length(w -> 'payment_issues'))
      from (select mp_pending_work(1000, 0) as w) x),
    'switches', (select jsonb_build_object('marketplace_open', marketplace_open, 'sellers_open', sellers_open, 'payouts_enabled', payouts_enabled,
        'sandbox_carrier', (select active from carrier_providers where id = 'sandbox'), 'support_refund_limit_minor', support_refund_limit_minor,
        'return_autoclose_days', return_autoclose_days)
      from mp_settings where id = 1),
    'sales', (select jsonb_build_object(
        'orders', count(distinct s.order_id),
        'parcels', count(*),
        'marketplace_parcels', count(*) filter (where s.seller_id is not null),
        'marketplace_sar_minor', coalesce(sum(private.to_sar(s.items_minor, private.order_fx(s.order_id))) filter (where s.seller_id is not null), 0),
        'house_sar_minor', coalesce(sum(private.to_sar(s.items_minor, private.order_fx(s.order_id))) filter (where s.seller_id is null), 0),
        'delivery_sar_minor', coalesce(sum(private.to_sar(s.shipping_minor, private.order_fx(s.order_id))), 0),
        'commission_sar_minor', coalesce(sum(private.to_sar(s.commission_minor, private.order_fx(s.order_id))), 0),
        'refunded_sar_minor', coalesce(sum(private.to_sar(s.refunded_minor, private.order_fx(s.order_id))), 0),
        'cancelled_by_sellers', count(*) filter (where s.status = 'cancelled' and s.cancelled_by = 'seller'),
        'delivered', count(*) filter (where s.delivered_at is not null))
      from sub_orders s join orders o on o.id = s.order_id where o.paid_at >= since and s.status <> 'pending_payment'),
    'owed_to_sellers', (select jsonb_build_object(
        'available_sar_minor', coalesce(sum((b ->> 'available_sar_minor')::int), 0),
        'held_sar_minor', coalesce(sum((b ->> 'held_sar_minor')::int), 0),
        'balance_sar_minor', coalesce(sum((b ->> 'balance_sar_minor')::int), 0))
      from (select private.ledger_available(x.seller_id) as b from (select distinct seller_id from seller_ledger) x) y),
    'paid_out_sar_minor', (select coalesce(sum(amount_sar_minor), 0) from seller_payouts where status = 'paid' and paid_on >= (since at time zone 'Asia/Riyadh')::date),
    'sellers', (select jsonb_build_object(
        'approved', count(*) filter (where status = 'approved' and kind = 'marketplace'),
        'partners', count(*) filter (where status = 'approved' and kind = 'partner'),
        'applying', count(*) filter (where status in ('pending', 'info_requested')),
        'suspended', count(*) filter (where status = 'suspended')) from sellers),
    'listings', (select jsonb_build_object(
        'live', count(*) filter (where listing_status = 'approved' and is_active),
        'waiting', count(*) filter (where listing_status = 'pending_review'),
        'drafts', count(*) filter (where listing_status = 'draft')) from products where seller_id is not null),
    'top_sellers', (select coalesce(jsonb_agg(jsonb_build_object('id', x.seller_id, 'name_en', se.name_en, 'slug', se.slug, 'parcels', x.parcels,
                      'sales_sar_minor', x.sales, 'commission_sar_minor', x.commission, 'rating_avg', x.rating,
                      'standard', private.seller_performance(x.seller_id) ->> 'status') order by x.sales desc), '[]'::jsonb)
                    from (select s.seller_id, count(*) as parcels, sum(private.to_sar(s.items_minor, private.order_fx(s.order_id))) as sales,
                                 sum(private.to_sar(s.commission_minor, private.order_fx(s.order_id))) as commission,
                                 (select round(avg(r.rating)::numeric, 2) from product_reviews r where r.seller_id = s.seller_id and r.status = 'published') as rating
                          from sub_orders s join orders o on o.id = s.order_id
                          where s.seller_id is not null and o.paid_at >= since and s.status not in ('pending_payment', 'cancelled')
                          group by s.seller_id order by 3 desc limit 8) x join sellers se on se.id = x.seller_id),
    'destinations', (select coalesce(jsonb_agg(jsonb_build_object('country', x.to_country, 'parcels', x.n) order by x.n desc), '[]'::jsonb)
                     from (select s.to_country, count(*) as n from sub_orders s join orders o on o.id = s.order_id
                           where o.paid_at >= since and s.status <> 'pending_payment' group by s.to_country order by 2 desc limit 8) x),
    'notifications_queued', (select count(*) from notification_outbox where status = 'queued' and channel <> 'in_app'));
end $$;
revoke all on function admin_marketplace_overview(int) from public, anon;
grant execute on function admin_marketplace_overview(int) to authenticated;

create or replace function track_parcel(p_number text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tracking_number', h.tracking_number, 'status', h.status,
    'carrier', (select c.carrier_name from carrier_services c where c.id = h.service_id),
    'expected_to', coalesce(s.accepted_at, o.paid_at)::date + s.days_max,
    'delivered_at', s.delivered_at,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.occurred_at, 'en', e.description_en, 'ar', e.description_ar, 'location', e.location)
               order by e.occurred_at desc), '[]'::jsonb) from shipment_events e where e.shipment_id = h.id))
  from shipments h join sub_orders s on s.id = h.sub_order_id join orders o on o.id = s.order_id
  where p_number ~ '^[A-Za-z0-9-]{6,40}$' and h.tracking_number = upper(p_number)
  order by h.created_at desc limit 1;
$$;
grant execute on function track_parcel(text) to anon, authenticated;

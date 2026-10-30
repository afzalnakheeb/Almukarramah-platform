-- Marketplace (7 of 9): orders split into sub-orders (one per seller, one for our own products), shipments through
-- the carriers we have approved (model B: the seller packs, prints our label and our courier collects), tracking
-- events, the seller's order flow and the customer's tracking.
--
-- * create-payment plans every line with the rulebook (supabase/functions/_shared/rules.ts) and stores what it
--   decided on each line and sub-order: corridor, who invoices, VAT, duties, carrier service, delivery price,
--   production and handling time, the return policy at the time of purchase.
-- * Paid (mp_order_paid): our own sub-order is accepted at once; a seller's waits for the seller to accept it. Stock
--   (of the option, or the product) is taken then, never from the browser.
-- * Seller: accept (or cancel with a reason) -> made-to-measure pieces are made -> create the label (create-shipment
--   with an idempotency key; the label PDF is private) -> the courier collects -> tracking events (carrier-webhook,
--   shipment-sync) move the shipment, the sub-order and the order along. A seller never sees the customer's email or
--   phone; the label carries the address.
-- * Every row is audited; tracking events are append-only and de-duplicated.

-- ================================================================ orders and lines
alter table orders
  add column idempotency_key text unique check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  add column duties_minor int not null default 0 check (duties_minor >= 0),
  add column payment_url text check (payment_url is null or payment_url ~* '^https://');   -- Moyasar's hosted page, for a retried checkout

create type sub_order_status as enum ('pending_payment', 'awaiting_acceptance', 'accepted', 'in_production', 'ready_to_ship', 'shipped',
                                      'delivered', 'delivery_failed', 'cancelled', 'returned');
create table sub_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  seq int not null check (seq between 1 and 50),          -- AM-<order number>-<seq>
  seller_id uuid references sellers,                      -- null: our own products
  kind text not null check (kind in ('house', 'marketplace', 'partner')),
  status sub_order_status not null default 'pending_payment',
  currency char(3) not null,
  items_minor int not null check (items_minor >= 0),      -- VAT included
  shipping_minor int not null default 0 check (shipping_minor >= 0),
  duties_minor int not null default 0 check (duties_minor >= 0),
  vat_minor int not null default 0 check (vat_minor >= 0),
  commission_minor int not null default 0 check (commission_minor >= 0),
  -- what the rulebook decided
  corridor_id uuid references corridors,
  invoicer text not null check (invoicer in ('platform', 'seller')),
  vat_mode text not null check (vat_mode in ('origin', 'destination', 'zero')),
  duties_mode text not null check (duties_mode in ('none', 'ddp', 'dap')),
  import_tax_regime text,
  import_tax_collected boolean not null default false,
  from_country char(2) not null,
  to_country char(2) not null,
  service_id uuid references carrier_services,            -- approved courier service (marketplace and partners)
  zone_id uuid references shipping_zones,                 -- our own products: the delivery zone the customer chose
  delivery_price_id uuid references delivery_prices,
  weight_g int not null default 0 check (weight_g >= 0),
  handling_days int not null default 1 check (handling_days between 0 and 30),
  production_days int not null default 0 check (production_days between 0 and 120),
  days_min int, days_max int,                             -- the estimate shown at checkout
  ship_by date,                                           -- set at acceptance: production + handling
  accepted_at timestamptz, made_at timestamptz, ready_at timestamptz, shipped_at timestamptz, delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 1000),
  cancelled_by text check (cancelled_by in ('seller', 'staff', 'customer', 'system')),
  needs_refund boolean not null default false,            -- cancelled after payment: our team refunds it (refund-order)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seq)
);
create index sub_orders_seller on sub_orders (seller_id, status, created_at desc);
create index sub_orders_order on sub_orders (order_id);

alter table order_items
  add column sub_order_id uuid references sub_orders on delete cascade,
  add column variant_id uuid references product_variants,
  add column variant_label text,
  add column vat_rate_bp int check (vat_rate_bp between 0 and 5000),
  add column vat_minor int check (vat_minor >= 0),
  add column duty_bp int check (duty_bp between 0 and 10000),
  add column duty_minor int check (duty_minor >= 0),
  add column production_days int check (production_days between 0 and 120),
  add column return_policy text check (return_policy in ('standard', 'unopened_only', 'faulty_only', 'none')),
  add column return_window_days int check (return_window_days between 0 and 60),
  add column hs_code text,
  add column origin_country char(2);
create index order_items_sub_order on order_items (sub_order_id);

-- ================================================================ shipments
create type shipment_status as enum ('label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered',
                                     'failed', 'cancelled', 'returned');
create table shipments (
  id uuid primary key default gen_random_uuid(),
  sub_order_id uuid not null references sub_orders on delete cascade,
  provider_id text not null references carrier_providers,
  service_id uuid references carrier_services,
  status shipment_status not null default 'label_created',
  provider_ref text,
  tracking_number text,
  tracking_url text check (tracking_url is null or tracking_url ~* '^https://'),
  label_path text,                                        -- labels bucket: <sub order>/<shipment>.pdf
  pickup_location_id uuid references seller_locations,
  pickup_from timestamptz,
  pickup_to timestamptz,
  weight_g int check (weight_g > 0),
  parcel jsonb not null default '{}' check (jsonb_typeof(parcel) = 'object'),
  ddp boolean not null default false,
  declared_value_minor int check (declared_value_minor >= 0),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_sub_order on shipments (sub_order_id, created_at desc);
create unique index shipments_one_active on shipments (sub_order_id) where status not in ('cancelled', 'failed', 'returned');
create unique index shipments_tracking on shipments (provider_id, tracking_number) where tracking_number is not null;

create table shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references shipments on delete cascade,
  status shipment_status not null,
  description_en text,
  description_ar text,
  location text,
  occurred_at timestamptz not null,
  source text not null check (source in ('provider', 'webhook', 'sandbox', 'staff', 'seller')),
  dedupe_key text not null unique,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index shipment_events_shipment on shipment_events (shipment_id, occurred_at);
create or replace function shipment_events_immutable() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Tracking events are never edited or deleted'; end $$;
create trigger shipment_events_immutable before update or delete on shipment_events for each row execute function shipment_events_immutable();

-- labels: PRIVATE, PDF only; the seller of the sub-order and our operations team open them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('labels', 'labels', false, 2097152, array['application/pdf'])
on conflict (id) do nothing;
create or replace function private.can_read_label(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_staff(array['owner', 'manager', 'operations', 'support']::staff_role[])
      or exists (select 1 from sub_orders s where s.id::text = split_part(p_name, '/', 1) and s.seller_id is not null and private.is_seller_member(s.seller_id));
$$;
create policy "sellers and operations read labels" on storage.objects for select to authenticated
  using (bucket_id = 'labels' and private.can_read_label(name));

-- ================================================================ who reads what
alter table sub_orders enable row level security;
alter table shipments enable row level security;
alter table shipment_events enable row level security;
create policy "customers, sellers and staff read sub-orders" on sub_orders for select using (
  private.is_staff() or (seller_id is not null and private.is_seller_member(seller_id))
  or exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "customers, sellers and staff read shipments" on shipments for select using (
  exists (select 1 from sub_orders s where s.id = sub_order_id));
create policy "customers, sellers and staff read tracking" on shipment_events for select using (
  exists (select 1 from shipments s where s.id = shipment_id));
-- sellers see their own lines (never the order's email or phone)
create policy "sellers read their lines" on order_items for select using (seller_id is not null and private.is_seller_member(seller_id));
-- everything is written by the server or the functions below
create trigger sub_orders_touch before update on sub_orders for each row execute function mp_touch();
create trigger shipments_touch before update on shipments for each row execute function mp_touch();
create trigger audit_sub_orders after insert or update or delete on sub_orders for each row execute function audit_trigger();
create trigger audit_shipments after insert or update or delete on shipments for each row execute function audit_trigger();

-- ================================================================ paid
-- Called by the payment webhook once Moyasar confirms the payment (server only). Our own sub-order is accepted at
-- once; sellers accept theirs. Stock comes off the option (which keeps the product's total) or the product.
create or replace function mp_order_paid(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i record;
  n int;
begin
  update sub_orders set status = case when kind = 'house' then 'accepted'::sub_order_status else 'awaiting_acceptance'::sub_order_status end,
                        accepted_at = case when kind = 'house' then now() end,
                        ship_by = case when kind = 'house' then current_date + production_days + handling_days end
  where order_id = p_order and status = 'pending_payment';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('applied', false); end if;
  for i in select oi.product_id, oi.variant_id, oi.quantity, coalesce(p.made_to_measure, false) as mtm
           from order_items oi left join products p on p.id = oi.product_id where oi.order_id = p_order and oi.product_id is not null loop
    if i.variant_id is not null then
      update product_variants set stock = greatest(0, stock - i.quantity) where id = i.variant_id;
    elsif not i.mtm then
      update products set stock = greatest(0, stock - i.quantity) where id = i.product_id;
    end if;
  end loop;
  return jsonb_build_object('applied', true, 'sub_orders', n);
end $$;
revoke all on function mp_order_paid(uuid) from public, anon, authenticated;

-- ================================================================ the seller's order flow
create or replace function private.seller_sub_order(p_sub uuid) returns sub_orders
language plpgsql stable security definer set search_path = public as $$
declare s sub_orders;
begin
  select * into s from sub_orders where id = p_sub;
  if s.id is null or s.seller_id is null or not private.is_seller_member(s.seller_id) then raise exception 'Not allowed'; end if;
  return s;
end $$;

-- The seller's orders with what to make and pack; the customer is a first name and a city.
create or replace function seller_sub_orders(p_seller uuid, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_seller_member(p_seller) then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'number', format('AM-%s-%s', o.number, s.seq), 'status', s.status, 'currency', s.currency,
      'items_minor', s.items_minor, 'commission_minor', s.commission_minor, 'paid_at', o.paid_at, 'created_at', s.created_at,
      'accepted_at', s.accepted_at, 'ship_by', s.ship_by, 'handling_days', s.handling_days, 'production_days', s.production_days,
      'to_country', s.to_country, 'city', o.ship_to ->> 'city', 'recipient', split_part(coalesce(o.ship_to ->> 'recipient_name', ''), ' ', 1),
      'gift_message', o.gift_message, 'cancel_reason', s.cancel_reason, 'weight_g', s.weight_g,
      'service', (select jsonb_build_object('carrier', c.carrier_name, 'service', c.service_name, 'service_ar', c.service_name_ar) from carrier_services c where c.id = s.service_id),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'variant', i.variant_label, 'quantity', i.quantity,
                  'unit_price_minor', i.unit_price_minor, 'line_total_minor', i.line_total_minor, 'commission_minor', i.commission_minor, 'custom', i.custom,
                  'production_days', i.production_days) order by i.name_en), '[]'::jsonb) from order_items i where i.sub_order_id = s.id),
      'shipment', (select jsonb_build_object('id', h.id, 'status', h.status, 'tracking_number', h.tracking_number, 'tracking_url', h.tracking_url,
                     'label_path', h.label_path, 'pickup_from', h.pickup_from, 'pickup_to', h.pickup_to,
                     'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.occurred_at, 'en', e.description_en, 'ar', e.description_ar, 'location', e.location)
                                order by e.occurred_at desc), '[]'::jsonb) from shipment_events e where e.shipment_id = h.id))
                   from shipments h where h.sub_order_id = s.id order by h.created_at desc limit 1)
    ) order by s.created_at desc)
    from sub_orders s join orders o on o.id = s.order_id
    where s.seller_id = p_seller and s.status <> 'pending_payment' and (p_status is null or s.status::text = p_status)
  ), '[]'::jsonb);
end $$;
revoke all on function seller_sub_orders(uuid, text) from public, anon;
grant execute on function seller_sub_orders(uuid, text) to authenticated;

-- accept: made-to-measure pieces go into production first; the ship-by date counts production and handling
create or replace function seller_accept_sub_order(p_sub uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sub_orders := private.seller_sub_order(p_sub);
begin
  if s.status <> 'awaiting_acceptance' then raise exception 'This order is %', s.status; end if;
  update sub_orders set status = case when production_days > 0 then 'in_production'::sub_order_status else 'accepted'::sub_order_status end,
    accepted_at = now(), ship_by = current_date + production_days + handling_days
  where id = s.id;
  return jsonb_build_object('status', (select status from sub_orders where id = s.id));
end $$;

-- made-to-measure pieces are made: ready to pack
create or replace function seller_production_done(p_sub uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sub_orders := private.seller_sub_order(p_sub);
begin
  if s.status <> 'in_production' then raise exception 'This order is %', s.status; end if;
  update sub_orders set status = 'accepted', made_at = now() where id = s.id;
  return jsonb_build_object('status', 'accepted');
end $$;

-- the seller cannot fulfil it: stock goes back, our team refunds the customer
create or replace function seller_cancel_sub_order(p_sub uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s sub_orders := private.seller_sub_order(p_sub);
  i record;
begin
  if s.status not in ('awaiting_acceptance', 'accepted', 'in_production') then raise exception 'This order is %', s.status; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Tell the customer why'; end if;
  if exists (select 1 from shipments h where h.sub_order_id = s.id and h.status not in ('cancelled', 'failed')) then
    raise exception 'Cancel the shipping label first';
  end if;
  update sub_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(p_reason), 1000), cancelled_by = 'seller', needs_refund = true
  where id = s.id;
  for i in select oi.product_id, oi.variant_id, oi.quantity, coalesce(p.made_to_measure, false) as mtm from order_items oi
           left join products p on p.id = oi.product_id where oi.sub_order_id = s.id and oi.product_id is not null loop
    if i.variant_id is not null then update product_variants set stock = stock + i.quantity where id = i.variant_id;
    elsif not i.mtm then update products set stock = stock + i.quantity where id = i.product_id; end if;
  end loop;
  return jsonb_build_object('status', 'cancelled');
end $$;
revoke all on function seller_accept_sub_order(uuid) from public, anon;
revoke all on function seller_production_done(uuid) from public, anon;
revoke all on function seller_cancel_sub_order(uuid, text) from public, anon;
grant execute on function seller_accept_sub_order(uuid) to authenticated;
grant execute on function seller_production_done(uuid) to authenticated;
grant execute on function seller_cancel_sub_order(uuid, text) to authenticated;

-- ================================================================ shipments and tracking (server only)
-- create-shipment records the label it bought (idempotent: the same key returns the same shipment).
create or replace function mp_record_shipment(p_sub uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s sub_orders;
  existing shipments;
  sid uuid;
begin
  select * into existing from shipments where idempotency_key = p ->> 'idempotency_key';
  if existing.id is not null then
    if existing.sub_order_id <> p_sub then raise exception 'Idempotency key reused for another order'; end if;
    return jsonb_build_object('id', existing.id, 'duplicate', true);
  end if;
  select * into s from sub_orders where id = p_sub for update;
  if s.status not in ('accepted', 'in_production', 'ready_to_ship') then raise exception 'This order is %', s.status; end if;
  insert into shipments (sub_order_id, provider_id, service_id, provider_ref, tracking_number, tracking_url, label_path, pickup_location_id,
                         pickup_from, pickup_to, weight_g, parcel, ddp, declared_value_minor, idempotency_key, created_by)
  values (s.id, p ->> 'provider_id', (p ->> 'service_id')::uuid, p ->> 'provider_ref', p ->> 'tracking_number', p ->> 'tracking_url', p ->> 'label_path',
          (p ->> 'pickup_location_id')::uuid, (p ->> 'pickup_from')::timestamptz, (p ->> 'pickup_to')::timestamptz, (p ->> 'weight_g')::int,
          coalesce(p -> 'parcel', '{}'), coalesce((p ->> 'ddp')::boolean, false), (p ->> 'declared_value_minor')::int, p ->> 'idempotency_key',
          (p ->> 'created_by')::uuid)
  returning id into sid;
  insert into shipment_events (shipment_id, status, description_en, description_ar, occurred_at, source, dedupe_key)
  values (sid, 'label_created', 'Label created; waiting for the courier', 'تم إنشاء ملصق الشحن، بانتظار المندوب', now(), 'seller', sid::text || ':label_created');
  update sub_orders set status = 'ready_to_ship', ready_at = now(), made_at = coalesce(made_at, case when production_days > 0 then now() end) where id = s.id;
  return jsonb_build_object('id', sid, 'duplicate', false);
end $$;
revoke all on function mp_record_shipment(uuid, jsonb) from public, anon, authenticated;

-- Tracking events from the carrier (webhook or sync): de-duplicated, never moving a shipment backwards (except a
-- failure, cancellation or return), and carrying the sub-order and the order along.
create or replace function mp_record_shipment_event(p_shipment uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h shipments;
  e jsonb;
  added int := 0;
  rank_of constant jsonb := '{"label_created": 1, "pickup_scheduled": 2, "picked_up": 3, "in_transit": 4, "out_for_delivery": 5, "delivered": 6, "failed": 7, "returned": 8, "cancelled": 9}';
  latest shipment_status;
  o uuid;
begin
  select * into h from shipments where id = p_shipment for update;
  if h.id is null then raise exception 'Shipment not found'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_events, '[]')) loop
    insert into shipment_events (shipment_id, status, description_en, description_ar, location, occurred_at, source, dedupe_key, raw)
    values (h.id, (e ->> 'status')::shipment_status, e ->> 'en', e ->> 'ar', e ->> 'location', coalesce((e ->> 'at')::timestamptz, now()),
            coalesce(e ->> 'source', 'provider'), h.id::text || ':' || coalesce(e ->> 'id', (e ->> 'status') || ':' || (e ->> 'at')), e -> 'raw')
    on conflict (dedupe_key) do nothing;
    if found then added := added + 1; end if;
  end loop;
  -- the furthest status reached (a failure, return or cancellation always wins once it happens after the rest)
  select ev.status into latest from shipment_events ev where ev.shipment_id = h.id
  order by case when ev.status in ('failed', 'returned', 'cancelled') then 100 else (rank_of ->> ev.status::text)::int end desc, ev.occurred_at desc limit 1;
  if latest is distinct from h.status then
    update shipments set status = latest where id = h.id;
    update sub_orders set
      status = case latest
        when 'picked_up' then 'shipped'::sub_order_status when 'in_transit' then 'shipped'::sub_order_status
        when 'out_for_delivery' then 'shipped'::sub_order_status when 'delivered' then 'delivered'::sub_order_status
        when 'failed' then 'delivery_failed'::sub_order_status when 'returned' then 'returned'::sub_order_status
        when 'cancelled' then (case when made_at is not null or production_days = 0 then 'accepted' else 'in_production' end)::sub_order_status
        else status end,
      shipped_at = case when latest in ('picked_up', 'in_transit', 'out_for_delivery', 'delivered') then coalesce(shipped_at, now()) else shipped_at end,
      delivered_at = case when latest = 'delivered' then now() else delivered_at end,
      ready_at = case when latest = 'cancelled' then null else ready_at end
    where id = h.sub_order_id
    returning order_id into o;
    -- the order: shipped once anything is on its way, delivered once everything has arrived (or was cancelled)
    update orders set status = case
        when not exists (select 1 from sub_orders x where x.order_id = o and x.status not in ('delivered', 'cancelled', 'returned'))
             and exists (select 1 from sub_orders x where x.order_id = o and x.status = 'delivered') then 'delivered'::order_status
        when exists (select 1 from sub_orders x where x.order_id = o and x.status in ('shipped', 'delivered')) then 'shipped'::order_status
        else status end, updated_at = now()
    where id = o and status in ('paid', 'packing', 'shipped');
  end if;
  return jsonb_build_object('added', added, 'status', coalesce(latest, h.status));
end $$;
revoke all on function mp_record_shipment_event(uuid, jsonb) from public, anon, authenticated;

-- What create-shipment needs (server only): the sub-order, its lines, the seller's pickup address and the customer's.
create or replace function mp_shipment_context(p_sub uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sub_order', to_jsonb(s), 'order', jsonb_build_object('number', o.number, 'ship_to', o.ship_to, 'currency', o.currency),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('name_en', i.name_en, 'quantity', i.quantity, 'hs_code', i.hs_code, 'origin_country', i.origin_country,
               'line_total_minor', i.line_total_minor)), '[]'::jsonb) from order_items i where i.sub_order_id = s.id),
    'locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.is_default desc, l.created_at), '[]'::jsonb) from seller_locations l where l.seller_id = s.seller_id and l.active),
    'service', (select to_jsonb(c) from carrier_services c where c.id = s.service_id),
    'shipments', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb) from shipments h where h.sub_order_id = s.id))
  from sub_orders s join orders o on o.id = s.order_id where s.id = p_sub;
$$;
revoke all on function mp_shipment_context(uuid) from public, anon, authenticated;

-- ================================================================ the customer's tracking
create or replace function my_order_tracking(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not (o.user_id = auth.uid() or private.is_staff()) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'currency', o.currency, 'total_minor', o.total_minor,
               'shipping_minor', o.shipping_minor, 'duties_minor', o.duties_minor, 'paid_at', o.paid_at, 'created_at', o.created_at,
               'ship_to', jsonb_build_object('recipient_name', o.ship_to ->> 'recipient_name', 'city', o.ship_to ->> 'city', 'country', o.ship_to ->> 'country')),
    'sub_orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'number', format('AM-%s-%s', o.number, s.seq), 'status', s.status, 'kind', s.kind,
        'seller', (select jsonb_build_object('slug', x.slug, 'name_en', x.name_en, 'name_ar', x.name_ar) from sellers x where x.id = s.seller_id and x.kind = 'marketplace'),
        'items_minor', s.items_minor, 'shipping_minor', s.shipping_minor, 'duties_minor', s.duties_minor, 'duties_mode', s.duties_mode,
        'days_min', s.days_min, 'days_max', s.days_max, 'production_days', s.production_days, 'ship_by', s.ship_by,
        'expected_from', coalesce(s.accepted_at, o.paid_at)::date + s.days_min,
        'expected_to', coalesce(s.accepted_at, o.paid_at)::date + s.days_max,
        'cancel_reason', s.cancel_reason, 'shipped_at', s.shipped_at, 'delivered_at', s.delivered_at,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('name_en', i.name_en, 'name_ar', i.name_ar, 'variant', i.variant_label, 'quantity', i.quantity,
                   'line_total_minor', i.line_total_minor, 'return_policy', i.return_policy, 'return_window_days', i.return_window_days, 'product_id', i.product_id)), '[]'::jsonb)
                  from order_items i where i.sub_order_id = s.id),
        'shipments', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'tracking_number', h.tracking_number, 'tracking_url', h.tracking_url,
                        'carrier', (select c.carrier_name from carrier_services c where c.id = h.service_id),
                        'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.occurred_at, 'en', e.description_en, 'ar', e.description_ar, 'location', e.location)
                                   order by e.occurred_at desc), '[]'::jsonb) from shipment_events e where e.shipment_id = h.id))
                      order by h.created_at desc), '[]'::jsonb) from shipments h where h.sub_order_id = s.id)
      ) order by s.seq), '[]'::jsonb) from sub_orders s where s.order_id = o.id));
end $$;
revoke all on function my_order_tracking(uuid) from public, anon;
grant execute on function my_order_tracking(uuid) to authenticated;

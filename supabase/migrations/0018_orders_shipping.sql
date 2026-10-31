-- Marketplace (7 of 9): orders split into sub-orders (one per seller, one for our own products), shipments through
-- the carriers we have approved (model B: the seller packs, prints our label and our courier collects), tracking
-- events, the seller's order flow and the customer's tracking.
--
-- * create-payment plans every line with the rulebook (supabase/functions/_shared/rules.ts) and stores what it
--   decided on each line and sub-order: corridor, who invoices, VAT, duties, carrier service, delivery price,
--   production and handling time, the return policy at the time of purchase.
-- * Paid (mp_payment_received): the order is marked paid, the sub-orders move on and stock comes off in ONE
--   transaction, only if the order was still waiting for payment, so a retried or duplicated webhook can never do it
--   twice or leave it half done (review H3, M10). Our own sub-order is accepted at once; a seller's waits for the
--   seller to accept it.
-- * Seller: accept (or cancel with a reason) -> made-to-measure pieces are made -> create the label (create-shipment
--   with an idempotency key; the label PDF is private) -> the courier collects -> tracking events (carrier-webhook,
--   shipment-sync) move the shipment, the sub-order and the order along. A failed delivery attempt is not the end: a
--   later delivery still counts, at the carrier's own time (review M4, L7). A seller never sees the customer's email;
--   the courier label carries the address (and the phone only as far as the carrier needs it, see SWITCH-ON).
-- * A seller's cancellation reason reaches the customer through the after-sale function, which masks contact details
--   (review M3); so does the gift message (a masked copy on the seller's sub-order).
-- * Every row is audited; tracking events are append-only and de-duplicated.

-- ================================================================ orders and lines
alter table orders
  add column idempotency_key text unique check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  add column duties_minor int not null default 0 check (duties_minor >= 0),
  add column payment_url text check (payment_url is null or payment_url ~* '^https://'),   -- Moyasar's hosted page, for a retried checkout
  add column stock_taken_at timestamptz,   -- when the order's stock came off (mp_order_paid), so it never comes off twice
  -- a renewal charged on a saved card: the given_id sent to Moyasar, which becomes the payment's id, so a lost answer
  -- is asked again with the same id and never charged twice (review N2, REVIEW-2)
  add column charge_given_id uuid unique;

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
  gift_message text check (char_length(gift_message) <= 500),   -- the customer's gift message, contact details masked (sellers read this)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seq)
);
create index sub_orders_seller on sub_orders (seller_id, status, created_at desc);
create index sub_orders_order on sub_orders (order_id);

-- The sellers' copies of a gift message follow the order's own: when it is cleared (the customer deleted their
-- account, or our team removed it), every parcel's copy goes too (review N3, REVIEW-2).
create or replace function private.orders_gift_message_cleared() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.gift_message is not null and new.gift_message is null then
    update sub_orders set gift_message = null where order_id = new.id and gift_message is not null;
  end if;
  return null;
end $$;
create trigger orders_gift_message_cleared after update of gift_message on orders for each row execute function private.orders_gift_message_cleared();

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
-- a failed delivery attempt is not the end of a shipment (the courier tries again), so it still counts as the live one
create unique index shipments_one_active on shipments (sub_order_id) where status not in ('cancelled', 'returned');
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
create or replace function shipment_events_immutable() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- a deleted shipment takes its events (the foreign key's cascade, once the shipment is gone; review N4)
  if tg_op = 'DELETE' and not exists (select 1 from shipments where id = old.shipment_id) then return old; end if;
  raise exception 'Tracking events are never edited or deleted';
end $$;
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
  n int := 0;
begin
  if exists (select 1 from sub_orders where order_id = p_order) then
    update sub_orders set status = case when kind = 'house' then 'accepted'::sub_order_status else 'awaiting_acceptance'::sub_order_status end,
                          accepted_at = case when kind = 'house' then now() end,
                          ship_by = case when kind = 'house' then current_date + production_days + handling_days end
    where order_id = p_order and status = 'pending_payment';
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('applied', false); end if;
    update orders set stock_taken_at = coalesce(stock_taken_at, now()) where id = p_order;
  else
    -- an order made by an older create-payment has no parcels (review M7: functions deployed at different times, or
    -- an order started just before the switch-on): its stock still comes off, once
    update orders set stock_taken_at = now() where id = p_order and status = 'paid' and stock_taken_at is null;
    if not found then return jsonb_build_object('applied', false); end if;
  end if;
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

-- Payments Moyasar took for an order that was no longer waiting for one: cancelled meanwhile (a renewal whose answer
-- was lost, a checkout that timed out), already paid with another payment, or of the wrong amount. Never dropped
-- (review N2, REVIEW-2): each is kept here, shown on the dashboard, and our team refunds it, revives the order with it,
-- or closes it with a reason (refund-order, action payment_issue). Server only; owner, manager and finance read them.
create table payment_issues (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique check (char_length(payment_id) between 1 and 200),
  order_id uuid references orders on delete set null,
  kind text not null check (kind in ('order_not_waiting', 'second_payment', 'amount_mismatch')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  status text not null default 'open' check (status in ('open', 'refund_pending', 'refunded', 'attached', 'dismissed')),
  note text check (char_length(note) <= 500),
  error text check (char_length(error) <= 1000),
  resolved_by uuid references auth.users on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index payment_issues_open on payment_issues (created_at) where status in ('open', 'refund_pending');
alter table payment_issues enable row level security;
create policy "owner, manager and finance read payment issues" on payment_issues for select
  using (private.is_staff(array['owner', 'manager', 'finance']::staff_role[]));
create trigger audit_payment_issues after insert or update or delete on payment_issues for each row execute function audit_trigger();

-- The payment webhook (server only), with Moyasar's payment as re-read from Moyasar: {id, amount, currency, token,
-- invoice_id, order_id}. In one transaction and only if the order was still waiting: the order is marked paid, the
-- sub-orders move on and stock comes off (mp_order_paid), and a membership or box club starts. Anything else answers
-- without changing a thing, so Moyasar's retries and duplicate deliveries are harmless (review H3, M10).
create or replace function mp_payment_received(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  r jsonb;
  v_order uuid := case when coalesce(p ->> 'order_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p ->> 'order_id')::uuid end;
begin
  select * into o from orders
  where (nullif(p ->> 'invoice_id', '') is not null and payment_ref = p ->> 'invoice_id') or id = v_order
  order by (payment_ref is not distinct from p ->> 'invoice_id') desc
  limit 1
  for update;
  if o.id is null then return jsonb_build_object('found', false); end if;
  if o.status <> 'pending_payment' then
    -- the same payment again (a retry or a duplicate delivery): nothing changes
    if o.payment_id is not distinct from p ->> 'id' then
      return jsonb_build_object('found', true, 'order_id', o.id, 'applied', false, 'status', o.status, 'second_payment', false);
    end if;
    -- any other payment for an order no longer waiting (cancelled, or paid with another payment) is money we hold
    -- without a reason: recorded once for our team, never dropped (review N2)
    insert into payment_issues (payment_id, order_id, kind, amount_minor, currency)
    values (p ->> 'id', o.id, case when o.payment_id is null then 'order_not_waiting' else 'second_payment' end,
            coalesce((p ->> 'amount')::bigint, 0), coalesce(p ->> 'currency', o.currency::text))
    on conflict (payment_id) do nothing;
    if found then
      insert into audit_log (actor_label, table_name, row_id, action, new_data)
      values ('moyasar-webhook', 'orders', o.id::text, 'STRAY_PAYMENT',
              jsonb_build_object('payment_id', p ->> 'id', 'amount', p -> 'amount', 'currency', p ->> 'currency', 'order_status', o.status));
    end if;
    return jsonb_build_object('found', true, 'order_id', o.id, 'applied', false, 'status', o.status, 'stray', true,
                              'second_payment', o.payment_id is not null);
  end if;
  if (p ->> 'amount')::bigint is distinct from o.total_minor or (p ->> 'currency') is distinct from o.currency::text then
    insert into payment_issues (payment_id, order_id, kind, amount_minor, currency)
    values (p ->> 'id', o.id, 'amount_mismatch', coalesce((p ->> 'amount')::bigint, 0), coalesce(p ->> 'currency', o.currency::text))
    on conflict (payment_id) do nothing;
    if found then
      insert into audit_log (actor_label, table_name, row_id, action, new_data) values ('moyasar-webhook', 'orders', o.id::text, 'PAYMENT_MISMATCH', p);
    end if;
    return jsonb_build_object('found', true, 'order_id', o.id, 'applied', false, 'mismatch', true);
  end if;
  update orders set status = 'paid', payment_id = p ->> 'id', paid_at = now(), updated_at = now() where id = o.id;
  r := mp_order_paid(o.id);
  if o.kind = 'subscription' and o.subscription_id is not null then
    update subscriptions set status = 'active', current_period_end = now() + interval '1 month', moyasar_token = nullif(p ->> 'token', ''), updated_at = now()
    where id = o.subscription_id;
  end if;
  return jsonb_build_object('found', true, 'order_id', o.id, 'applied', true, 'sub_orders', coalesce((r ->> 'sub_orders')::int, 0));
end $$;
revoke all on function mp_payment_received(jsonb) from public, anon, authenticated;

-- Server functions act for a person (the after-sale and refund functions pass the caller's id): the request is
-- attributed to them for the rest of the transaction, so the audit triggers record who did it (rule 9, review M13).
create or replace function private.act_as(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or coalesce(auth.role(), '') <> 'service_role' then return; end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'service_role',
    'email', (select email from auth.users where id = p_user))::text, true);
end $$;
revoke all on function private.act_as(uuid) from public, anon, authenticated;

-- ================================================================ the seller's order flow
create or replace function private.seller_sub_order(p_sub uuid) returns sub_orders
language plpgsql stable security definer set search_path = public as $$
declare s sub_orders;
begin
  select * into s from sub_orders where id = p_sub;
  if s.id is null or s.seller_id is null or not private.is_seller_member(s.seller_id) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return s;
end $$;

-- The seller's orders with what to make and pack; the customer is a first name and a city.
create or replace function seller_sub_orders(p_seller uuid, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'number', format('AM-%s-%s', o.number, s.seq), 'status', s.status, 'currency', s.currency,
      'items_minor', s.items_minor, 'commission_minor', s.commission_minor, 'paid_at', o.paid_at, 'created_at', s.created_at,
      'accepted_at', s.accepted_at, 'ship_by', s.ship_by, 'handling_days', s.handling_days, 'production_days', s.production_days,
      'to_country', s.to_country, 'city', o.ship_to ->> 'city', 'recipient', split_part(coalesce(o.ship_to ->> 'recipient_name', ''), ' ', 1),
      'gift_message', s.gift_message, 'cancel_reason', s.cancel_reason, 'weight_g', s.weight_g,
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
  if s.status <> 'awaiting_acceptance' then raise exception 'This order is %', s.status using detail = format('حالة هذا الطلب: %s', private.status_ar(s.status::text)); end if;
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
  if s.status <> 'in_production' then raise exception 'This order is %', s.status using detail = format('حالة هذا الطلب: %s', private.status_ar(s.status::text)); end if;
  update sub_orders set status = 'accepted', made_at = now() where id = s.id;
  return jsonb_build_object('status', 'accepted');
end $$;

-- The seller cannot fulfil it: stock goes back, our team refunds the customer. Server only: the after-sale function
-- masks contact details in the reason first, which the customer reads (review M3).
create or replace function mp_cancel_parcel(p_user uuid, p_sub uuid, p_reason text, p_flags text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s sub_orders;
  i record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
begin
  perform private.act_as(p_user);
  select * into s from sub_orders where id = p_sub for update;
  if s.id is null or s.seller_id is null or not exists (select 1 from seller_members m where m.seller_id = s.seller_id and m.user_id = p_user) then
    raise exception using message = 'Not allowed', detail = 'غير مسموح';
  end if;
  if s.status not in ('awaiting_acceptance', 'accepted', 'in_production') then
    raise exception using message = format('This order is %s', s.status), detail = format('حالة هذا الطلب الآن: %s', s.status);
  end if;
  if v_reason is null then raise exception using message = 'Tell the customer why', detail = 'أخبر العميل بالسبب'; end if;
  if exists (select 1 from shipments h where h.sub_order_id = s.id and h.status not in ('cancelled', 'returned')) then
    raise exception using message = 'Cancel the shipping label first', detail = 'ألغِ ملصق الشحن أولًا';
  end if;
  update sub_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason, cancelled_by = 'seller', needs_refund = true
  where id = s.id;
  if cardinality(coalesce(p_flags, '{}')) > 0 then
    insert into audit_log (actor, table_name, row_id, action, new_data)
    values (p_user, 'sub_orders', s.id::text, 'CANCEL_REASON_FLAGGED', jsonb_build_object('flags', p_flags));
  end if;
  for i in select oi.product_id, oi.variant_id, oi.quantity, coalesce(p.made_to_measure, false) as mtm from order_items oi
           left join products p on p.id = oi.product_id where oi.sub_order_id = s.id and oi.product_id is not null loop
    if i.variant_id is not null then update product_variants set stock = stock + i.quantity where id = i.variant_id;
    elsif not i.mtm then update products set stock = stock + i.quantity where id = i.product_id; end if;
  end loop;
  return jsonb_build_object('status', 'cancelled');
end $$;
revoke all on function seller_accept_sub_order(uuid) from public, anon;
revoke all on function seller_production_done(uuid) from public, anon;
revoke all on function mp_cancel_parcel(uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function seller_accept_sub_order(uuid) to authenticated;
grant execute on function seller_production_done(uuid) to authenticated;

-- ================================================================ shipments and tracking (server only)
-- create-shipment records the label it bought (idempotent: the same key returns the same shipment).
-- One label being bought per parcel at a time (review N6, REVIEW-2): create-shipment claims the parcel with its key
-- before it asks the carrier, so two people pressing at once never buy two labels. The same key may carry on; another
-- key waits, unless the claim is over 10 minutes old (the first request died). Recording the label, or a carrier that
-- bought nothing, releases it. Server only.
create table shipment_claims (
  sub_order_id uuid primary key references sub_orders on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  claimed_by uuid references auth.users on delete set null,
  claimed_at timestamptz not null default now()
);
alter table shipment_claims enable row level security;

create or replace function mp_claim_shipment(p_sub uuid, p_key text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c shipment_claims;
begin
  perform 1 from sub_orders where id = p_sub for update;
  if exists (select 1 from shipments h where h.sub_order_id = p_sub and h.status not in ('cancelled', 'returned')) then
    return jsonb_build_object('ok', false, 'reason', 'label_exists');
  end if;
  select * into c from shipment_claims where sub_order_id = p_sub;
  if c.sub_order_id is null then
    insert into shipment_claims (sub_order_id, idempotency_key, claimed_by) values (p_sub, p_key, p_user);
  elsif c.idempotency_key = p_key then
    update shipment_claims set claimed_at = now() where sub_order_id = p_sub;
  elsif c.claimed_at < now() - interval '10 minutes' then
    update shipment_claims set idempotency_key = p_key, claimed_by = p_user, claimed_at = now() where sub_order_id = p_sub;
  else
    return jsonb_build_object('ok', false, 'reason', 'in_progress');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function mp_release_shipment_claim(p_sub uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  delete from shipment_claims where sub_order_id = p_sub and idempotency_key = p_key;
$$;
revoke all on function mp_claim_shipment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function mp_release_shipment_claim(uuid, text) from public, anon, authenticated;

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
  if s.status not in ('accepted', 'in_production', 'ready_to_ship') then raise exception 'This order is %', s.status using detail = format('حالة هذا الطلب: %s', private.status_ar(s.status::text)); end if;
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
  delete from shipment_claims where sub_order_id = s.id;
  return jsonb_build_object('id', sid, 'duplicate', false);
end $$;
revoke all on function mp_record_shipment(uuid, jsonb) from public, anon, authenticated;

-- Tracking events from the carrier (webhook or sync): de-duplicated, never moving a shipment backwards (except to show
-- a failed attempt, a cancellation or a return), and carrying the sub-order and the order along.
create or replace function mp_record_shipment_event(p_shipment uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h shipments;
  e jsonb;
  added int := 0;
  rank_of constant jsonb := '{"label_created": 1, "pickup_scheduled": 2, "picked_up": 3, "in_transit": 4, "out_for_delivery": 5, "delivered": 6, "failed": 7, "returned": 8, "cancelled": 9}';
  latest shipment_status;
  prog shipment_status;
  prog_at timestamptz;
  fail_at timestamptz;
  end_at timestamptz;
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
  -- Where the parcel is (review M4): a cancellation or a return ends it, unless a delivery came after it at the
  -- carrier (a late "returned" event dated before the delivery is old news; review N8). Otherwise the furthest step
  -- reached, never backwards, except that a failed delivery attempt shows when it is the latest news; a later delivery
  -- still wins.
  select ev.status, ev.occurred_at into latest, end_at from shipment_events ev where ev.shipment_id = h.id and ev.status in ('cancelled', 'returned')
  order by ev.occurred_at desc limit 1;
  if latest is not null and exists (select 1 from shipment_events ev where ev.shipment_id = h.id and ev.status = 'delivered' and ev.occurred_at > end_at) then
    latest := null;
  end if;
  if latest is null then
    select ev.status, ev.occurred_at into prog, prog_at from shipment_events ev where ev.shipment_id = h.id and ev.status not in ('failed', 'cancelled', 'returned')
    order by (rank_of ->> ev.status::text)::int desc, ev.occurred_at desc limit 1;
    select max(ev.occurred_at) into fail_at from shipment_events ev where ev.shipment_id = h.id and ev.status = 'failed';
    latest := case when fail_at is not null and prog is distinct from 'delivered' and (prog_at is null or fail_at > prog_at) then 'failed'::shipment_status else prog end;
  end if;
  if latest is distinct from h.status then
    update shipments set status = latest where id = h.id;
    update sub_orders set
      status = case latest
        when 'picked_up' then 'shipped'::sub_order_status when 'in_transit' then 'shipped'::sub_order_status
        when 'out_for_delivery' then 'shipped'::sub_order_status when 'delivered' then 'delivered'::sub_order_status
        when 'failed' then 'delivery_failed'::sub_order_status when 'returned' then 'returned'::sub_order_status
        when 'cancelled' then (case when made_at is not null or production_days = 0 then 'accepted' else 'in_production' end)::sub_order_status
        else status end,
      -- at the carrier's own times, not when we heard (review L7): return windows and payouts count from them
      shipped_at = case when latest in ('picked_up', 'in_transit', 'out_for_delivery', 'delivered')
                        then coalesce(shipped_at, (select least(min(ev.occurred_at), now()) from shipment_events ev where ev.shipment_id = h.id
                                                   and ev.status in ('picked_up', 'in_transit', 'out_for_delivery', 'delivered')), now()) else shipped_at end,
      delivered_at = case when latest = 'delivered'
                          then coalesce((select least(min(ev.occurred_at), now()) from shipment_events ev where ev.shipment_id = h.id and ev.status = 'delivered'), now())
                          else delivered_at end,
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
    'service', (select to_jsonb(c) || jsonb_build_object('provider_active', coalesce((select pv.active from carrier_providers pv where pv.id = c.provider_id), false))
                from carrier_services c where c.id = s.service_id),
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
  if o.id is null or not (o.user_id = auth.uid() or private.is_staff()) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
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

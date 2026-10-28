-- Al Mukarramah platform: initial schema
-- Money is stored as integer minor units (halalas for SAR, fils, pence, cents).
-- Every table has row-level security. Staff are users listed in staff_members.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- roles
create type staff_role as enum ('owner', 'manager', 'operations', 'marketing', 'support', 'finance');

create table staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role staff_role not null,
  name text not null,
  created_at timestamptz not null default now()
);

create or replace function is_staff(roles staff_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_members s
    where s.user_id = auth.uid() and (roles is null or s.role = any(roles))
  );
$$;

-- ---------------------------------------------------------------- store settings (emergency switches)
create table store_settings (
  id int primary key default 1 check (id = 1),
  store_open boolean not null default true,
  checkout_open boolean not null default true,
  ads_paused boolean not null default false,
  banner_en text,
  banner_ar text,
  seller_name text not null default 'Al Mukarramah',
  seller_name_ar text not null default 'المكرمة',
  vat_number text not null default '300000000000003', -- replace with the real 15-digit VAT number
  cr_number text,
  seller_address text,
  vat_rate_bp int not null default 1500,               -- 15.00% in basis points
  zero_rate_exports boolean not null default false,    -- turn on only after the accountant confirms export zero-rating evidence
  updated_at timestamptz not null default now()
);
insert into store_settings (id) values (1);

-- ---------------------------------------------------------------- catalogue
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_ar text not null,
  sort int not null default 0
);

-- occasions (Hajj, Umrah, Ramadan, Eid, Nikah, New baby ...) and recipients (her, him, kids, family, corporate)
create table tags (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('occasion', 'recipient', 'collection')),
  slug text not null,
  name_en text not null,
  name_ar text not null,
  icon text,
  sort int not null default 0,
  unique (kind, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category_id uuid references categories(id),
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  base_price_sar int not null check (base_price_sar >= 0),    -- halalas, VAT inclusive
  stock int not null default 0,
  weight_g int not null default 500,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  ships_international boolean not null default true,
  restricted_countries text[] not null default '{}',          -- ISO codes where it cannot be sent (e.g. some perfume/food rules)
  images text[] not null default '{}',
  seo_title_en text, seo_title_ar text,
  seo_description_en text, seo_description_ar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_tags (
  product_id uuid references products(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

-- optional fixed prices per currency; otherwise the app converts from SAR with fx_rates
create table product_prices (
  product_id uuid references products(id) on delete cascade,
  currency char(3) not null,
  amount_minor int not null check (amount_minor >= 0),
  primary key (product_id, currency)
);

create table fx_rates (
  currency char(3) primary key,
  per_sar numeric(12,6) not null,       -- 1 SAR = per_sar units of currency
  updated_at timestamptz not null default now()
);
insert into fx_rates (currency, per_sar) values
  ('SAR', 1), ('AED', 0.979), ('GBP', 0.21), ('USD', 0.2667), ('EUR', 0.245); -- sample rates; Claude updates weekly

-- ---------------------------------------------------------------- customers
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  language text not null default 'ar' check (language in ('ar', 'en')),
  currency char(3) not null default 'SAR',
  country char(2) not null default 'SA',
  marketing_opt_in boolean not null default false,   -- never set automatically
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'home' check (kind in ('home', 'hotel', 'office')),
  recipient_name text not null,
  phone text not null,
  country char(2) not null,
  city text not null,
  line1 text not null,
  line2 text,
  hotel_name text,
  check_in date,
  check_out date,
  postal_code text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- orders
create type order_status as enum ('pending_payment', 'paid', 'packing', 'shipped', 'delivered', 'cancelled', 'refunded');

create table orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 104900),
  user_id uuid references auth.users(id),
  email text,
  status order_status not null default 'pending_payment',
  currency char(3) not null default 'SAR',
  subtotal_minor int not null,
  shipping_minor int not null default 0,
  discount_minor int not null default 0,
  total_minor int not null,                    -- VAT inclusive
  vat_minor int not null default 0,
  ship_to jsonb not null,                      -- snapshot of the address
  gift_message text,
  partner_code text,                           -- hotel / creator attribution
  kind text not null default 'shop' check (kind in ('shop', 'subscription')),
  subscription_id uuid,
  payment_provider text default 'moyasar',
  payment_ref text,                            -- Moyasar invoice id created at checkout
  payment_id text,                             -- Moyasar payment id once paid
  paid_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name_en text not null,
  name_ar text not null,
  unit_price_minor int not null,
  quantity int not null check (quantity > 0),
  line_total_minor int not null
);

-- ---------------------------------------------------------------- ZATCA e-invoicing
-- Phase 1 (generation): every paid order gets a simplified tax invoice with a QR code (TLV tags 1-5).
-- Phase 2 (integration): uuid, invoice counter (icv), previous invoice hash (pih), hash, XML and the
-- cryptographic stamp are stored so invoices can be reported to ZATCA directly or through a certified provider.
create type invoice_type as enum ('simplified', 'standard');        -- B2C / B2B
create type invoice_doc as enum ('invoice', 'credit_note', 'debit_note');
create type zatca_status as enum ('not_sent', 'reported', 'cleared', 'rejected', 'warning');

create table invoice_counter (
  id int primary key default 1 check (id = 1),
  last_icv bigint not null default 0,
  last_hash text not null default 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=='
  -- default = base64 of SHA-256("0") as ZATCA specifies for the first invoice
);
insert into invoice_counter (id) values (1);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  uuid uuid not null default gen_random_uuid(),
  number text unique not null,                  -- e.g. INV-2026-000001
  icv bigint unique not null,                   -- invoice counter value
  pih text,                                     -- previous invoice hash: set in strict ICV order when reported (Phase 2)
  hash text,                                    -- this invoice's hash: set with the PIH when reported (Phase 2)
  kind invoice_type not null default 'simplified',
  doc invoice_doc not null default 'invoice',
  order_id uuid references orders(id),
  original_invoice_id uuid references invoices(id),   -- for credit/debit notes
  reason text,                                        -- required for credit/debit notes
  issue_at timestamptz not null default now(),
  currency char(3) not null,
  total_excl_vat_minor int not null,
  vat_minor int not null,
  total_incl_vat_minor int not null,
  total_sar_incl_vat_minor int not null,        -- VAT is reported in SAR
  vat_sar_minor int not null,
  buyer jsonb,                                  -- required for standard (B2B): name, VAT number, address
  qr_base64 text not null,
  xml text,
  zatca_status zatca_status not null default 'not_sent',
  zatca_response jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Issue the next invoice counter value atomically (gap-free, one row lock).
create or replace function next_invoice_slot()
returns bigint language sql security definer set search_path = public as $$
  update invoice_counter set last_icv = last_icv + 1 where id = 1 returning last_icv;
$$;

-- The hash chain (PIH) is built one invoice at a time, in ICV order, by zatca-report.
create or replace function last_invoice_hash()
returns text language sql stable security definer set search_path = public as $$
  select last_hash from invoice_counter where id = 1;
$$;

create or replace function set_last_invoice_hash(p_hash text)
returns void language sql security definer set search_path = public as $$
  update invoice_counter set last_hash = p_hash where id = 1;
$$;

create or replace function set_last_invoice_hash(p_hash text)
returns void language sql security definer set search_path = public as $$
  update invoice_counter set last_hash = p_hash where id = 1;
$$;

-- ---------------------------------------------------------------- shipping
create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  countries text[] not null,          -- ISO codes; '*' = rest of world
  cities text[],                      -- optional (e.g. Madinah hotel delivery)
  carrier text not null,
  service text not null,
  first_kg_sar int not null,          -- halalas
  extra_kg_sar int not null,
  days_min int not null,
  days_max int not null,
  active boolean not null default true
);

-- ---------------------------------------------------------------- subscriptions and content
create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('membership', 'box')),
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  price_sar int not null,             -- halalas per period
  period text not null default 'month' check (period in ('month', 'year')),
  store_product_id_ios text,          -- for app-store memberships (RevenueCat)
  store_product_id_android text,
  active boolean not null default true
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  source text not null check (source in ('app_store', 'play_store', 'moyasar')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'expired', 'past_due')),
  current_period_end timestamptz,
  moyasar_token text,                 -- saved card token for box clubs (never card numbers)
  ship_to jsonb,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table programmes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,          -- 'quran-trail', 'seerah-trail'
  name_en text not null,
  name_ar text not null,
  members_only boolean not null default true
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references programmes(id) on delete cascade,
  day int not null,
  title_en text not null,
  title_ar text not null,
  body_en text,                        -- Seerah lessons: our own scholar-reviewed text
  body_ar text,
  quran_ref text,                      -- e.g. 'page:1' or 'juz:1' (text is fetched, never stored edited)
  reviewed_by text,                    -- scholar who approved it; lessons without review are not published
  published boolean not null default false,
  unique (programme_id, day)
);

create table lesson_progress (
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------------------------------------------------------------- partners (hotels, creators)
create table partners (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hotel', 'creator', 'operator', 'corporate')),
  name text not null,
  code text unique not null,
  commission_bp int not null default 0,      -- basis points of eligible net sales
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit log (every change by staff or Claude)
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_label text,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);

create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, actor_label, table_name, row_id, action, old_data, new_data)
  values (
    auth.uid(),
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', current_user),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, ''),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_products after insert or update or delete on products for each row execute function audit_trigger();
create trigger audit_orders after update or delete on orders for each row execute function audit_trigger();
create trigger audit_partners after insert or update or delete on partners for each row execute function audit_trigger();
create trigger audit_plans after insert or update or delete on plans for each row execute function audit_trigger();

create or replace function audit_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, actor_label, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), current_user, 'store_settings', '1', tg_op, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
create trigger audit_store_settings after update on store_settings for each row execute function audit_settings();

-- ---------------------------------------------------------------- reports (Claude reads these)
create view daily_sales with (security_invoker = true) as
  select date_trunc('day', paid_at at time zone 'Asia/Riyadh')::date as day,
         currency, count(*) as orders, sum(total_minor) as total_minor
  from orders where status not in ('pending_payment', 'cancelled')
  group by 1, 2;

create view low_stock with (security_invoker = true) as
  select id, slug, name_en, stock from products where is_active and stock <= 5;

create view invoices_not_reported with (security_invoker = true) as
  select id, number, issue_at, total_incl_vat_minor, zatca_status
  from invoices where zatca_status in ('not_sent', 'rejected');

-- ---------------------------------------------------------------- row-level security
alter table staff_members enable row level security;
alter table store_settings enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table products enable row level security;
alter table product_tags enable row level security;
alter table product_prices enable row level security;
alter table fx_rates enable row level security;
alter table profiles enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table invoice_counter enable row level security;
alter table invoices enable row level security;
alter table shipping_zones enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table programmes enable row level security;
alter table lessons enable row level security;
alter table lesson_progress enable row level security;
alter table partners enable row level security;
alter table audit_log enable row level security;

-- public catalogue
create policy "read settings" on store_settings for select using (true);
create policy "read categories" on categories for select using (true);
create policy "read tags" on tags for select using (true);
create policy "read active products" on products for select using (is_active or is_staff());
create policy "read product tags" on product_tags for select using (true);
create policy "read product prices" on product_prices for select using (true);
create policy "read fx" on fx_rates for select using (true);
create policy "read zones" on shipping_zones for select using (active or is_staff());
create policy "read plans" on plans for select using (active or is_staff());
create policy "read programmes" on programmes for select using (true);
create or replace function is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s join plans p on p.id = s.plan_id
                 where s.user_id = auth.uid() and s.status = 'active' and p.kind = 'membership'
                   and (s.current_period_end is null or s.current_period_end > now()));
$$;
create policy "read published lessons" on lessons for select using (
  is_staff()
  or (published and (is_member() or not exists (select 1 from programmes g where g.id = programme_id and g.members_only))));

-- customers see only their own data
create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own addresses" on addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own orders" on orders for select using (user_id = auth.uid() or is_staff());
create policy "own order items" on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff())));
create policy "own invoices" on invoices for select using (
  is_staff(array['owner','manager','finance']::staff_role[])
  or exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "own subscriptions" on subscriptions for select using (user_id = auth.uid() or is_staff());
create policy "own progress" on lesson_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- staff management
create policy "staff see staff" on staff_members for select using (is_staff());
create policy "owner manages staff" on staff_members for all using (is_staff(array['owner']::staff_role[]));
create policy "staff edit settings" on store_settings for update using (is_staff(array['owner','manager']::staff_role[]));
create policy "staff edit catalogue" on products for all using (is_staff(array['owner','manager','operations','marketing']::staff_role[]));
create policy "staff edit categories" on categories for all using (is_staff(array['owner','manager','marketing']::staff_role[]));
create policy "staff edit tags" on tags for all using (is_staff(array['owner','manager','marketing']::staff_role[]));
create policy "staff edit product tags" on product_tags for all using (is_staff(array['owner','manager','marketing']::staff_role[]));
create policy "staff edit prices" on product_prices for all using (is_staff(array['owner','manager']::staff_role[]));
create policy "staff edit fx" on fx_rates for all using (is_staff(array['owner','manager','finance']::staff_role[]));
create policy "staff update orders" on orders for update using (is_staff(array['owner','manager','operations','support']::staff_role[]));
create policy "staff edit zones" on shipping_zones for all using (is_staff(array['owner','manager','operations']::staff_role[]));
create policy "staff edit plans" on plans for all using (is_staff(array['owner','manager']::staff_role[]));
create policy "staff edit lessons" on lessons for all using (is_staff(array['owner','manager','marketing']::staff_role[]));
create policy "staff edit partners" on partners for all using (is_staff(array['owner','manager']::staff_role[]));
create policy "staff read partners" on partners for select using (is_staff());
create policy "staff read audit" on audit_log for select using (is_staff(array['owner','manager','finance']::staff_role[]));
-- orders, order_items, invoices and invoice_counter are written only by server functions (service role).

-- new users get a profile
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

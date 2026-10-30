-- Marketplace: independent sellers (international Islamic brands) list products on Al Mukarramah.
-- Rules:
--  * Nothing a seller adds is public until Al Mukarramah approves it (sellers and every listing).
--  * Seller photos go to a PRIVATE bucket; on approval they are copied to the public catalogue bucket
--    by the review-listing server function. Sellers can never publish a file themselves.
--  * Every listing must pass the AI guideline check (listing-check function) before it can be submitted.
--  * Editing the content of a live listing sends it back for checking and approval.
--  * Al Mukarramah holds no inventory. Two kinds of seller account:
--      marketplace: independent brands with their own public shop page ("Sold by <brand>");
--      partner: private-label and fulfilment partners who make and ship Al Mukarramah's own brand and authorised
--               brands (e.g. Ahmed Al Maghribi). Not shown publicly: customers see "Sold by Al Mukarramah".
--    Al Mukarramah's margin is 25% to 50% of the line price; commission is recorded per order line for payouts.
--  * Shipping is "model B" (0010_rulebook_model_b.sql): sellers pack their own parcels but ship ONLY through the
--    carriers Al Mukarramah contracts, with labels printed from the seller dashboard. The platform sets the delivery
--    price the customer pays; sellers never type shipping prices.
--  * Who invoices each line, which VAT applies and whether a sale is allowed at all come from the country rulebook
--    (countries, corridors, product compliance) in 0010.

create type seller_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type listing_status as enum ('draft', 'pending_review', 'approved', 'rejected');

-- ---------------------------------------------------------------- sellers
create table sellers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name_en text not null check (char_length(name_en) between 2 and 80),
  name_ar text,
  tagline_en text check (char_length(tagline_en) <= 140),
  tagline_ar text check (char_length(tagline_ar) <= 140),
  about_en text check (char_length(about_en) <= 2000),
  about_ar text check (char_length(about_ar) <= 2000),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  city text,
  logo text,
  banner text,
  website text,
  handling_days int not null default 3 check (handling_days between 1 and 30),   -- days to pack before pickup
  returns_en text check (char_length(returns_en) <= 1500),
  returns_ar text check (char_length(returns_ar) <= 1500),
  kind text not null default 'marketplace' check (kind in ('marketplace', 'partner')),
  status seller_status not null default 'pending',
  commission_bps int not null default 2500 check (commission_bps between 2500 and 5000),   -- Al Mukarramah's margin: 25% to 50%
  review_note text,
  agreed_guidelines_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contact and legal details: never public.
create table seller_private (
  seller_id uuid primary key references sellers on delete cascade,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  legal_name text,
  registration_no text,         -- commercial registration / trade licence / commercial licence number
  tax_registration_no text,     -- VAT number (SA), TRN (AE), GSTIN (IN)
  product_summary text,     -- what they plan to sell (from the application)
  internal_notes text       -- staff only
);

create table seller_members (
  seller_id uuid not null references sellers on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (seller_id, user_id)
);
create index seller_members_user on seller_members (user_id);

create or replace function private.is_seller_member(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_seller is not null and exists (select 1 from seller_members m where m.seller_id = p_seller and m.user_id = auth.uid());
$$;

create or replace function private.seller_approved(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sellers s where s.id = p_seller and s.status = 'approved');
$$;

-- Storage folder names are seller ids; anything that is not a uuid simply does not match.
create or replace function private.member_of_folder(p_folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return private.is_seller_member(p_folder::uuid);
exception when others then
  return false;
end $$;

alter table sellers enable row level security;
alter table seller_private enable row level security;
alter table seller_members enable row level security;

create policy "read approved sellers" on sellers for select
  using ((status = 'approved' and kind = 'marketplace') or private.is_seller_member(id) or private.is_staff());
create policy "members edit own seller" on sellers for update
  using (private.is_seller_member(id) or private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_seller_member(id) or private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "staff manage sellers" on sellers for all
  using (private.is_staff(array['owner', 'manager']::staff_role[]));

-- Commission, review notes and guideline dates are not public: the public (and sellers, through the API) read only
-- these columns. Sellers and staff get the full record through my_sellers() and admin_sellers().
revoke select on sellers from anon, authenticated;
grant select (id, slug, name_en, name_ar, tagline_en, tagline_ar, about_en, about_ar, country, city, logo, banner, website,
  handling_days, returns_en, returns_ar, kind, status, created_at) on sellers to anon, authenticated;

create policy "members and staff read private" on seller_private for select
  using (private.is_seller_member(seller_id) or private.is_staff());
create policy "members and staff edit private" on seller_private for update
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]));

create policy "see own memberships" on seller_members for select
  using (user_id = auth.uid() or private.is_staff());
create policy "staff manage memberships" on seller_members for all
  using (private.is_staff(array['owner', 'manager']::staff_role[]));

-- Sellers cannot approve themselves, change their commission or (once approved) their address on the site.
create or replace function sellers_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if private.is_staff() or coalesce(auth.role(), '') <> 'authenticated' then
    new.updated_at := now();
    if new.status = 'approved' and old.status is distinct from 'approved' then new.approved_at := now(); end if;
    return new;
  end if;
  new.status := old.status;
  new.kind := old.kind;
  new.commission_bps := old.commission_bps;
  new.review_note := old.review_note;
  new.approved_at := old.approved_at;
  new.agreed_guidelines_at := old.agreed_guidelines_at;
  if old.status = 'approved' then new.slug := old.slug; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger sellers_guard before update on sellers for each row execute function sellers_guard();

create or replace function seller_private_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not private.is_staff() and coalesce(auth.role(), '') = 'authenticated' then
    new.internal_notes := old.internal_notes;
  end if;
  return new;
end $$;
create trigger seller_private_guard before update on seller_private for each row execute function seller_private_guard();

create trigger audit_sellers after insert or update or delete on sellers for each row execute function audit_trigger();

-- Application: one seller account per person; starts as "pending" until Al Mukarramah approves it.
create or replace function apply_as_seller(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  base text;
  s text;
  n int := 1;
  sid uuid;
  mail text;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from seller_members where user_id = uid) then raise exception 'You already have a seller account'; end if;
  if coalesce((p ->> 'agree')::boolean, false) is not true then raise exception 'Please accept the seller guidelines'; end if;
  if coalesce(trim(p ->> 'name_en'), '') = '' or coalesce(trim(p ->> 'country'), '') = '' or coalesce(trim(p ->> 'contact_name'), '') = '' then
    raise exception 'Shop name, country and contact name are required';
  end if;
  select email into mail from auth.users where id = uid;

  base := trim(both '-' from regexp_replace(lower(p ->> 'name_en'), '[^a-z0-9]+', '-', 'g'));
  if base = '' or char_length(base) < 2 then base := 'shop'; end if;
  base := left(base, 50);
  s := base;
  while exists (select 1 from sellers where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;

  insert into sellers (slug, name_en, name_ar, tagline_en, country, city, website, status, agreed_guidelines_at)
  values (s, trim(p ->> 'name_en'), nullif(trim(p ->> 'name_ar'), ''), nullif(trim(p ->> 'tagline_en'), ''),
          upper(trim(p ->> 'country')), nullif(trim(p ->> 'city'), ''), nullif(trim(p ->> 'website'), ''), 'pending', now())
  returning id into sid;

  insert into seller_private (seller_id, contact_name, contact_email, contact_phone, legal_name, registration_no, product_summary)
  values (sid, trim(p ->> 'contact_name'), coalesce(nullif(trim(p ->> 'contact_email'), ''), mail), nullif(trim(p ->> 'contact_phone'), ''),
          nullif(trim(p ->> 'legal_name'), ''), nullif(trim(p ->> 'registration_no'), ''), left(p ->> 'product_summary', 2000));

  insert into seller_members (seller_id, user_id, role) values (sid, uid, 'owner');
  return sid;
end $$;
revoke all on function apply_as_seller(jsonb) from public, anon;
grant execute on function apply_as_seller(jsonb) to authenticated;

-- The signed-in user's seller account(s), complete, with contact details.
create or replace function my_sellers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('seller', to_jsonb(s), 'private', to_jsonb(p) - 'internal_notes', 'role', m.role) order by s.created_at), '[]'::jsonb)
  from seller_members m join sellers s on s.id = m.seller_id left join seller_private p on p.seller_id = s.id
  where m.user_id = auth.uid();
$$;
revoke all on function my_sellers() from public, anon;
grant execute on function my_sellers() to authenticated;

-- Staff: every seller with contact details, product counts and the listings waiting for review.
create or replace function admin_sellers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff() then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'seller', to_jsonb(s), 'private', to_jsonb(p),
      'live', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'approved' and x.is_active),
      'waiting', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'pending_review')
    ) order by (s.status = 'pending') desc, s.created_at desc)
    from sellers s left join seller_private p on p.seller_id = s.id
  ), '[]'::jsonb);
end $$;
revoke all on function admin_sellers() from public, anon;
grant execute on function admin_sellers() to authenticated;

-- Staff: open an account for a private-label / fulfilment partner (or a seller met outside the website).
create or replace function staff_create_seller(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  base text; s text; n int := 1; sid uuid;
begin
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed'; end if;
  base := left(trim(both '-' from regexp_replace(lower(p ->> 'name_en'), '[^a-z0-9]+', '-', 'g')), 50);
  if coalesce(base, '') = '' then base := 'partner'; end if;
  s := base;
  while exists (select 1 from sellers where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
  insert into sellers (slug, name_en, name_ar, country, city, kind, status, commission_bps, agreed_guidelines_at)
  values (s, trim(p ->> 'name_en'), nullif(trim(p ->> 'name_ar'), ''), upper(trim(p ->> 'country')), nullif(trim(p ->> 'city'), ''),
          coalesce(p ->> 'kind', 'partner'), 'approved', coalesce((p ->> 'commission_bps')::int, 2500), now())
  returning id into sid;
  insert into seller_private (seller_id, contact_name, contact_email, contact_phone)
  values (sid, coalesce(nullif(trim(p ->> 'contact_name'), ''), trim(p ->> 'name_en')), coalesce(trim(p ->> 'contact_email'), ''), nullif(trim(p ->> 'contact_phone'), ''));
  return sid;
end $$;
revoke all on function staff_create_seller(jsonb) from public, anon;
grant execute on function staff_create_seller(jsonb) to authenticated;

-- Staff: give someone with an Al Mukarramah account access to a seller dashboard (by their sign-in email).
create or replace function staff_add_seller_member(p_seller uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email yet: ask them to sign in at almukarramah.com once, then try again'; end if;
  insert into seller_members (seller_id, user_id, role) values (p_seller, uid, 'owner') on conflict do nothing;
end $$;
revoke all on function staff_add_seller_member(uuid, text) from public, anon;
grant execute on function staff_add_seller_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------- listings
alter table products
  add column seller_id uuid references sellers on delete restrict,
  add column listing_status listing_status not null default 'approved',
  add column review_note text,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users,
  add column ai_check jsonb,
  add column ai_checked_at timestamptz;
create index products_seller on products (seller_id);
create index products_listing_status on products (listing_status) where listing_status <> 'approved';

drop policy if exists "read active products" on products;
create policy "read active products" on products for select using (
  (is_active and listing_status = 'approved' and (seller_id is null or private.seller_approved(seller_id)))
  or private.is_staff()
  or private.is_seller_member(seller_id)
);
create policy "sellers add listings" on products for insert
  with check (seller_id is not null and private.is_seller_member(seller_id) and private.seller_approved(seller_id));
create policy "sellers edit own listings" on products for update
  using (seller_id is not null and private.is_seller_member(seller_id))
  with check (seller_id is not null and private.is_seller_member(seller_id));
create policy "sellers delete unsold drafts" on products for delete
  using (seller_id is not null and private.is_seller_member(seller_id) and listing_status in ('draft', 'rejected'));

-- What a seller may and may not change. Staff, the server and migrations are not limited here.
create or replace function products_seller_guard() returns trigger language plpgsql set search_path = public as $$
declare
  content_changed boolean;
  img text;
  ignore_keys text[] := array['stock', 'is_active', 'updated_at', 'listing_status', 'submitted_at', 'ai_check', 'ai_checked_at', 'review_note', 'reviewed_at', 'reviewed_by'];
begin
  if private.is_staff() or coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.seller_id is null then raise exception 'Not allowed'; end if;

  -- Photos must be the seller's own uploads (private, under their folder) or already-approved catalogue copies.
  foreach img in array coalesce(new.images, '{}') loop
    if not (img like new.seller_id::text || '/%' or img like '%/storage/v1/object/public/catalogue/' || new.seller_id::text || '/%') then
      raise exception 'Photos must be uploaded through your seller dashboard';
    end if;
  end loop;
  if coalesce(array_length(new.images, 1), 0) > 8 then raise exception 'Up to 8 photos per product'; end if;

  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.listing_status := 'draft';
    new.ai_check := null;
    new.ai_checked_at := null;
    new.submitted_at := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_note := null;
    new.is_featured := false;
    return new;
  end if;

  new.is_featured := old.is_featured;
  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  new.review_note := old.review_note;
  new.seller_id := old.seller_id;
  -- Only the server (listing-check) writes the AI result.
  new.ai_check := old.ai_check;
  new.ai_checked_at := old.ai_checked_at;

  content_changed := (to_jsonb(new) - ignore_keys) is distinct from (to_jsonb(old) - ignore_keys);
  if content_changed then
    new.ai_check := null;
    new.ai_checked_at := null;
    if old.listing_status in ('approved', 'pending_review') then
      new.listing_status := 'draft';   -- edits to a live listing are checked and approved again
    end if;
  end if;

  if new.listing_status is distinct from old.listing_status then
    if new.listing_status in ('approved', 'rejected') then
      raise exception 'Only Al Mukarramah can approve or reject listings';
    end if;
    if new.listing_status = 'pending_review' then
      if not private.seller_approved(new.seller_id) then raise exception 'Your seller account is not approved yet'; end if;
      if new.ai_check is null or coalesce(new.ai_check ->> 'verdict', '') not in ('pass', 'review') then
        raise exception 'Run the guideline check first. Listings the check blocks cannot be submitted';
      end if;
      if coalesce(array_length(new.images, 1), 0) < 1 then raise exception 'Add at least one photo'; end if;
      new.submitted_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger products_seller_guard before insert or update on products for each row execute function products_seller_guard();

-- ---------------------------------------------------------------- modest fashion: ready-made and tailor-made
-- Ready-made: sizes + a size chart. Tailor-made: design options chosen by the customer (fabric, collar, sleeve,
-- cuff, pocket, buttons...) with optional price add-ons, plus the customer's measurements.
--   tailoring = { "production_days": 10,
--                 "options": [ { "key": "collar", "label": {"en": "Collar", "ar": "الياقة"},
--                                "choices": [ { "id": "band", "label": {...}, "image": "<path>", "price_minor": 0 } ] } ] }
--   size_chart = { "unit": "cm", "columns": ["chest", "length"], "rows": [ { "size": "M", "chest": 104, "length": 140 } ] }
alter table categories add column department text not null default 'gifts' check (department in ('gifts', 'fashion'));
alter table products
  add column made_to_measure boolean not null default false,
  add column garment text check (garment in ('thobe', 'abaya', 'other')),
  add column sizes text[],
  add column size_chart jsonb,
  add column tailoring jsonb;

insert into categories (slug, name_en, name_ar, sort, is_active, department, blurb_en, blurb_ar) values
  ('thobes', 'Thobes', 'الثياب', 20, false, 'fashion', 'Ready-made and tailor-made thobes for men and boys.', 'ثياب جاهزة وتفصيل للرجال والأولاد.'),
  ('abayas', 'Abayas', 'العبايات', 21, false, 'fashion', 'Ready-made and tailor-made abayas.', 'عبايات جاهزة وتفصيل.'),
  ('modest-dresses', 'Modest dresses and jilbabs', 'الفساتين المحتشمة والجلابيب', 22, false, 'fashion', 'Modest dresses, jilbabs and prayer dresses.', 'فساتين محتشمة وجلابيب وأثواب صلاة.'),
  ('hijabs', 'Hijabs and scarves', 'الحجابات والشالات', 23, false, 'fashion', 'Hijabs, shaylas, niqabs and scarves.', 'حجابات وشيلات ونقابات وشالات.'),
  ('kids-modest', 'Kids’ modest wear', 'ملابس الأطفال المحتشمة', 24, false, 'fashion', 'Thobes, abayas and modest wear for children.', 'ثياب وعبايات وملابس محتشمة للأطفال.')
on conflict (slug) do nothing;

-- Saved measurements ("Me", "My father"), always stored in centimetres.
create table measurement_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  garment text not null check (garment in ('thobe', 'abaya', 'other')),
  measures jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index measurement_profiles_user on measurement_profiles (user_id);
alter table measurement_profiles enable row level security;
create policy "own measurements" on measurement_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- orders: who sells each line
-- (shipments, one per seller per order, and the seller's order list are in 0010_rulebook_model_b.sql)
alter table order_items
  add column custom jsonb,                         -- size, chosen design options and measurements (cm)
  add column seller_id uuid references sellers,
  add column commission_bps int,
  add column commission_minor int;
create index order_items_seller on order_items (seller_id) where seller_id is not null;

-- ---------------------------------------------------------------- photos
-- seller-uploads: PRIVATE. Sellers write only inside their own folder (<seller id>/...). Images only, 5 MB each.
-- catalogue: PUBLIC. Written only by the server when a listing is approved.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-uploads', 'seller-uploads', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('catalogue', 'catalogue', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "sellers read own uploads" on storage.objects for select to authenticated
  using (bucket_id = 'seller-uploads' and (private.member_of_folder((storage.foldername(name))[1]) or private.is_staff()));
create policy "sellers upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1]));
create policy "sellers replace own uploads" on storage.objects for update to authenticated
  using (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1]));
create policy "sellers delete own uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1]));

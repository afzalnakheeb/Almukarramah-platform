-- Marketplace (1 of 9): sellers, seller accounts and listings.
-- (Numbered 0012 because migrations 0010 and 0011 belong to the apps workstream; see docs/marketplace/SWITCH-ON.md.)
--
-- Rules:
--  * Nothing a seller adds is public until Al Mukarramah approves it (sellers and every listing).
--  * Seller photos go to a PRIVATE bucket. Sellers can only add files under <seller id>/incoming/; the screening
--    function (0015) checks each one and moves it to <seller id>/media/ (or to quarantine). On approval the
--    review-listing function copies media into the public catalogue bucket. Sellers can never publish or replace a
--    file themselves.
--  * Every listing passes the AI screening (listing-check) on submission. Only the server moves a listing into the
--    staff queue; a blocked listing is rejected automatically and never reaches the queue.
--  * Editing the content of a live listing sends it back for checking and approval.
--  * Al Mukarramah holds no inventory. Two kinds of seller account:
--      marketplace: independent brands with their own public shop page ("Sold by <brand>");
--      partner: private-label and fulfilment partners who make and ship Al Mukarramah's own brand and authorised
--               brands. Not shown publicly: customers see "Sold by Al Mukarramah".
--    Al Mukarramah's commission is 25% to 50% of the line price (category rate, or a negotiated seller rate).
--  * Shipping is "model B" (0013): sellers pack their own parcels but ship ONLY through carriers Al Mukarramah
--    contracts, with labels printed from the seller dashboard. The platform sets the delivery price the customer
--    pays; sellers never type shipping prices.
--  * Who invoices each line, which VAT applies and whether a sale is allowed at all come from the country rulebook
--    (0013) and the category policies (0014).

-- audit_trigger() (0001) expects an "id" column; tables keyed by a code or a composite key name their key columns as
-- the trigger's arguments, e.g. audit_keyed('seller_id', 'user_id').
create or replace function audit_keyed() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  k text;
  rid text := '';
begin
  foreach k in array tg_argv loop
    rid := rid || case when rid = '' then '' else ':' end || coalesce(r ->> k, '');
  end loop;
  insert into audit_log (actor, actor_label, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', current_user), tg_table_name,
          rid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke execute on function audit_keyed() from public, anon, authenticated;

create type seller_status as enum ('pending', 'info_requested', 'approved', 'rejected', 'suspended');
create type listing_status as enum ('draft', 'check_pending', 'pending_review', 'approved', 'rejected', 'suspended');

-- ---------------------------------------------------------------- sellers
create table sellers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  name_en text not null check (char_length(name_en) between 2 and 80),
  name_ar text check (char_length(name_ar) <= 80),
  tagline_en text check (char_length(tagline_en) <= 140),
  tagline_ar text check (char_length(tagline_ar) <= 140),
  about_en text check (char_length(about_en) <= 2000),
  about_ar text check (char_length(about_ar) <= 2000),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),     -- the seller's registered (KYC) country = ship-from
  city text check (char_length(city) <= 80),
  logo text,                                                   -- seller-uploads media path until approved, then a catalogue URL
  banner text,
  website text check (website is null or website ~* '^https://[^\s]{3,200}$'),
  handling_days int not null default 3 check (handling_days between 1 and 10),   -- days to pack before pickup
  returns_en text check (char_length(returns_en) <= 1500),
  returns_ar text check (char_length(returns_ar) <= 1500),
  kind text not null default 'marketplace' check (kind in ('marketplace', 'partner')),
  status seller_status not null default 'pending',
  -- Negotiated commission; null means the category's rate applies (0014). Always 25% to 50%.
  commission_bps int check (commission_bps is null or commission_bps between 2500 and 5000),
  review_note text check (char_length(review_note) <= 2000),
  agreed_guidelines_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sellers_status on sellers (status, created_at desc);

-- Contact and legal details: never public.
create table seller_private (
  seller_id uuid primary key references sellers on delete cascade,
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null check (char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 40),
  legal_name text check (char_length(legal_name) <= 200),
  registration_no text check (char_length(registration_no) <= 60),     -- CR / trade licence / commercial licence number
  tax_registration_no text check (char_length(tax_registration_no) <= 60),   -- VAT number (SA), TRN (AE), GSTIN (IN)
  product_summary text check (char_length(product_summary) <= 2000),   -- what they plan to sell (from the application)
  internal_notes text                                                  -- staff only
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

-- True when the request comes from a customer, a seller or a visitor (not staff, not a server function using the
-- service role, not a migration). Guards use it to decide whose changes they limit.
-- A status in Arabic, for the Arabic of an error (review M8): sellers, listings, parcels and returns.
create or replace function private.status_ar(p text) returns text
language sql immutable set search_path = public as $$
  select case p
    when 'pending' then 'قيد المراجعة' when 'info_requested' then 'بانتظار معلومات منك' when 'approved' then 'معتمد'
    when 'rejected' then 'مرفوض' when 'suspended' then 'موقوف' when 'draft' then 'مسودة' when 'check_pending' then 'قيد الفحص'
    when 'pending_review' then 'بانتظار المراجعة' when 'pending_payment' then 'بانتظار الدفع' when 'awaiting_acceptance' then 'بانتظار القبول'
    when 'accepted' then 'مقبول' when 'in_production' then 'قيد التجهيز' when 'ready_to_ship' then 'جاهز للشحن' when 'shipped' then 'تم شحنه'
    when 'delivered' then 'تم توصيله' when 'delivery_failed' then 'تعذّر توصيله' when 'cancelled' then 'ملغى' when 'returned' then 'أُعيد'
    when 'requested' then 'بانتظار رد البائع' when 'declined' then 'مرفوض' when 'escalated' then 'لدى فريقنا للبت فيه'
    when 'refunded' then 'تم الاسترداد' when 'withdrawn' then 'مسحوب'
    else p end
$$;

create or replace function private.is_end_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon') and not private.is_staff();
$$;

alter table sellers enable row level security;
alter table seller_private enable row level security;
alter table seller_members enable row level security;

create policy "read approved sellers" on sellers for select
  using ((status = 'approved' and kind = 'marketplace') or private.is_seller_member(id) or private.is_staff());
create policy "members edit own seller" on sellers for update
  using (private.is_seller_member(id))
  with check (private.is_seller_member(id));
create policy "staff manage sellers" on sellers for all
  using (private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_staff(array['owner', 'manager']::staff_role[]));

-- Commission, review notes and guideline dates are not public: the public (and sellers, through the API) read only
-- these columns. Sellers and staff get the full record through my_sellers() and admin_sellers().
revoke select on sellers from anon, authenticated;
grant select (id, slug, name_en, name_ar, tagline_en, tagline_ar, about_en, about_ar, country, city, logo, banner, website,
  handling_days, returns_en, returns_ar, kind, status, created_at) on sellers to anon, authenticated;

-- Bank details are on this row (0013), so only the seller, the owner, managers and finance read it; the rest of our team
-- gets the contact details they need through admin_sellers() (0016), without the bank details.
create policy "members and staff read private" on seller_private for select
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'finance']::staff_role[]));
create policy "members and staff edit private" on seller_private for update
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]));

create policy "see own memberships" on seller_members for select
  using (user_id = auth.uid() or private.is_staff());
create policy "staff manage memberships" on seller_members for all
  using (private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_staff(array['owner', 'manager']::staff_role[]));

-- Sellers cannot approve themselves, change their commission, move country or (once approved) their address on the site.
create or replace function sellers_guard() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if not private.is_end_user() then
    if new.status = 'approved' and old.status is distinct from 'approved' then new.approved_at := now(); end if;
    return new;
  end if;
  new.status := old.status;
  new.kind := old.kind;
  new.commission_bps := old.commission_bps;
  new.review_note := old.review_note;
  new.approved_at := old.approved_at;
  new.agreed_guidelines_at := old.agreed_guidelines_at;
  new.country := old.country;            -- the KYC country decides corridors, documents and pickup addresses
  new.created_at := old.created_at;
  if old.status = 'approved' then new.slug := old.slug; end if;
  return new;
end $$;
create trigger sellers_guard before update on sellers for each row execute function sellers_guard();

create or replace function seller_private_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if private.is_end_user() then
    new.internal_notes := old.internal_notes;
  end if;
  return new;
end $$;
create trigger seller_private_guard before update on seller_private for each row execute function seller_private_guard();

create trigger audit_sellers after insert or update or delete on sellers for each row execute function audit_trigger();
create trigger audit_seller_members after insert or update or delete on seller_members for each row execute function audit_keyed('seller_id', 'user_id');
create trigger audit_seller_private after insert or update or delete on seller_private for each row execute function audit_keyed('seller_id');

-- Application: one seller account per person; starts as "pending" until Al Mukarramah approves it.
-- (0016 replaces this with the full premium vetting application.)
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

-- The signed-in user's seller account(s), complete, with contact details (never staff-only notes).
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
  if not private.is_staff() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
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
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if coalesce(trim(p ->> 'name_en'), '') = '' or coalesce(trim(p ->> 'country'), '') !~ '^[A-Za-z]{2}$' then
    raise exception 'Name and country are required';
  end if;
  base := left(trim(both '-' from regexp_replace(lower(p ->> 'name_en'), '[^a-z0-9]+', '-', 'g')), 50);
  if coalesce(base, '') = '' then base := 'partner'; end if;
  s := base;
  while exists (select 1 from sellers where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
  insert into sellers (slug, name_en, name_ar, country, city, kind, status, commission_bps, agreed_guidelines_at)
  values (s, trim(p ->> 'name_en'), nullif(trim(p ->> 'name_ar'), ''), upper(trim(p ->> 'country')), nullif(trim(p ->> 'city'), ''),
          case when p ->> 'kind' = 'marketplace' then 'marketplace' else 'partner' end, 'approved',
          nullif(p ->> 'commission_bps', '')::int, now())
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
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email yet: ask them to sign in at almukarramah.com once, then try again'; end if;
  insert into seller_members (seller_id, user_id, role) values (p_seller, uid, 'owner') on conflict do nothing;
end $$;
revoke all on function staff_add_seller_member(uuid, text) from public, anon;
grant execute on function staff_add_seller_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------- listings
-- The workflow (status and its dates) is on the product; what our team and the AI check wrote about it (notes, findings,
-- who reviewed it) is kept apart in listing_reviews, so products stay readable with select * by every client, including
-- the live website and app builds made before the marketplace.
alter table products
  add column seller_id uuid references sellers on delete restrict,
  add column listing_status listing_status not null default 'approved',   -- existing (house) products stay live
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column ai_checked_at timestamptz;      -- when the AI check last finished (cleared when the content changes)
create index products_seller on products (seller_id, updated_at desc);
create index products_listing_queue on products (listing_status, submitted_at) where listing_status <> 'approved';

-- Notes and findings about a listing: the seller of the listing and our team only, written only by the server and by
-- the review functions (never through the API).
create table listing_reviews (
  product_id uuid primary key references products on delete cascade,
  review_note text check (char_length(review_note) <= 1000),   -- our team's note to the seller (a rejection, a price review)
  reviewed_by uuid references auth.users on delete set null,
  ai_check jsonb,                                              -- latest screening summary (0015 keeps the full record)
  compliance_note text check (char_length(compliance_note) <= 1000),   -- 0013: the compliance decision
  compliance_reviewed_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
create or replace function private.product_seller(p_product uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select seller_id from products where id = p_product;
$$;
alter table listing_reviews enable row level security;
create policy "sellers and staff read listing reviews" on listing_reviews for select
  using (private.is_staff() or private.is_seller_member(private.product_seller(product_id)));
revoke insert, update, delete on listing_reviews from anon, authenticated;
create trigger audit_listing_reviews after insert or update or delete on listing_reviews for each row execute function audit_keyed('product_id');

-- Upserts what the review wrote about a listing (server and definer functions only).
create or replace function private.set_listing_review(p_product uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into listing_reviews (product_id) values (p_product) on conflict (product_id) do nothing;
  update listing_reviews set
    review_note = case when p ? 'review_note' then left(p ->> 'review_note', 1000) else review_note end,
    reviewed_by = case when p ? 'reviewed_by' then (p ->> 'reviewed_by')::uuid else reviewed_by end,
    ai_check = case when p ? 'ai_check' then nullif(p -> 'ai_check', 'null'::jsonb) else ai_check end,
    compliance_note = case when p ? 'compliance_note' then left(p ->> 'compliance_note', 1000) else compliance_note end,
    compliance_reviewed_by = case when p ? 'compliance_reviewed_by' then (p ->> 'compliance_reviewed_by')::uuid else compliance_reviewed_by end,
    updated_at = now()
  where product_id = p_product;
end $$;
revoke all on function private.set_listing_review(uuid, jsonb) from public, anon, authenticated;

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
-- (0014 adds the marketplace switch to the read policy: seller listings are public only once the marketplace is open.)

-- What a seller may and may not change. Staff, the server and migrations are not limited here.
-- (0013 adds compliance, 0015 screened media, 0017 variants, attributes and the price guard.)
create or replace function products_seller_guard() returns trigger language plpgsql set search_path = public as $$
declare
  content_changed boolean;
  img text;
  ignore_keys text[] := array['stock', 'is_active', 'updated_at', 'listing_status', 'submitted_at', 'ai_checked_at', 'reviewed_at'];
begin
  if not private.is_end_user() then
    return new;
  end if;
  if new.seller_id is null then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;

  -- Photos must be the seller's screened media (private, under their folder) or already-approved catalogue copies.
  foreach img in array coalesce(new.images, '{}') loop
    if not (img like new.seller_id::text || '/media/%' or img like '%/storage/v1/object/public/catalogue/' || new.seller_id::text || '/%') then
      raise exception 'Photos must be uploaded through your seller dashboard';
    end if;
  end loop;
  if coalesce(array_length(new.images, 1), 0) > 10 then raise exception 'Up to 10 photos per product'; end if;

  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.listing_status := 'draft';
    new.ai_checked_at := null;
    new.submitted_at := null;
    new.reviewed_at := null;
    new.is_featured := false;
    return new;
  end if;

  new.is_featured := old.is_featured;
  new.reviewed_at := old.reviewed_at;
  new.seller_id := old.seller_id;
  new.submitted_at := old.submitted_at;
  -- Only the server writes screening results.
  new.ai_checked_at := old.ai_checked_at;

  content_changed := (to_jsonb(new) - ignore_keys) is distinct from (to_jsonb(old) - ignore_keys);
  if content_changed then
    if old.listing_status in ('suspended') then raise exception 'This listing is suspended. Please contact Al Mukarramah'; end if;
    new.ai_checked_at := null;
    if old.listing_status in ('approved', 'pending_review', 'check_pending') then
      new.listing_status := 'draft';   -- edits to a submitted or live listing are checked and approved again
    end if;
  end if;

  -- A seller can only take a listing back to draft. Submitting goes through the listing-check function.
  if new.listing_status is distinct from old.listing_status and new.listing_status <> 'draft' then
    raise exception 'Only Al Mukarramah can move a listing to %', new.listing_status;
  end if;
  if new.listing_status = 'draft' and old.listing_status = 'suspended' then
    raise exception 'This listing is suspended. Please contact Al Mukarramah';
  end if;
  return new;
end $$;
create trigger products_seller_guard before insert or update on products for each row execute function products_seller_guard();

-- ---------------------------------------------------------------- modest fashion: ready-made and made-to-measure
-- Ready-made: sizes (or variants, 0017) and a size chart. Made-to-measure: a flexible seam owned with the tailoring
-- workstream. Nothing in the marketplace code hard-codes measurement keys; each listing declares its own:
--   tailoring = { "style": "<garment_styles.code>",             -- e.g. saudi_thobe, emirati_kandura (0014)
--                 "production_days": 10,
--                 "measurements": [ { "key": "chest", "min_cm": 60, "max_cm": 180, "required": true } ],
--                 "options": [ { "key": "collar", "label": {"en": "Collar", "ar": "الياقة"},
--                                "choices": [ { "id": "band", "label": {...}, "image": "<path>", "price_minor": 0,
--                                               "season": "summer" } ] } ] }
--   (fabrics are an option with key "fabric" whose choices carry a season: summer, winter or all)
--   size_chart = { "unit": "cm", "columns": ["chest", "length"], "rows": [ { "size": "M", "chest": 104, "length": 140 } ] }
alter table categories add column department text not null default 'gifts' check (department in ('gifts', 'fashion'));
alter table products
  add column made_to_measure boolean not null default false,
  add column garment text check (garment is null or garment ~ '^[a-z_]{2,30}$'),
  add column sizes text[],
  add column size_chart jsonb check (size_chart is null or jsonb_typeof(size_chart) = 'object'),
  add column tailoring jsonb check (tailoring is null or jsonb_typeof(tailoring) = 'object');

insert into categories (slug, name_en, name_ar, sort, is_active, department, blurb_en, blurb_ar) values
  ('thobes', 'Thobes', 'الثياب', 20, false, 'fashion', 'Ready-made and tailor-made thobes for men and boys.', 'ثياب جاهزة وتفصيل للرجال والأولاد.'),
  ('abayas', 'Abayas', 'العبايات', 21, false, 'fashion', 'Ready-made and tailor-made abayas.', 'عبايات جاهزة وتفصيل.'),
  ('modest-dresses', 'Modest dresses and jilbabs', 'الفساتين المحتشمة والجلابيب', 22, false, 'fashion', 'Modest dresses, jilbabs and prayer dresses.', 'فساتين محتشمة وجلابيب وأثواب صلاة.'),
  ('hijabs', 'Hijabs and scarves', 'الحجابات والشالات', 23, false, 'fashion', 'Hijabs, shaylas, niqabs and scarves.', 'حجابات وشيلات ونقابات وشالات.'),
  ('kids-modest', 'Kids’ modest wear', 'ملابس الأطفال المحتشمة', 24, false, 'fashion', 'Thobes, abayas and modest wear for children.', 'ثياب وعبايات وملابس محتشمة للأطفال.')
on conflict (slug) do nothing;

-- Saved measurements ("Me", "My father"), always in centimetres, keyed by measurement name. One profile is reused
-- across brands: each made-to-measure listing asks only for the keys it declares.
create table measurement_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  garment text not null check (garment ~ '^[a-z_]{2,30}$'),
  measures jsonb not null default '{}' check (jsonb_typeof(measures) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index measurement_profiles_user on measurement_profiles (user_id);
alter table measurement_profiles enable row level security;
create policy "own measurements" on measurement_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- orders: who sells each line
-- (sub-orders, shipments and the seller's order list are in 0013 and 0018)
alter table order_items
  add column custom jsonb,                         -- size, chosen design options and measurements (cm)
  add column seller_id uuid references sellers,
  add column commission_bps int check (commission_bps is null or commission_bps between 0 and 5000),
  add column commission_minor int check (commission_minor is null or commission_minor >= 0);
create index order_items_seller on order_items (seller_id) where seller_id is not null;

-- ---------------------------------------------------------------- photos
-- seller-uploads: PRIVATE, images only, 10 MB. Sellers ADD files only under <seller id>/incoming/ and can remove
-- them from there; nobody but the server writes <seller id>/media/ (screened copies) and no one can overwrite a file,
-- so a screened photo can never be swapped for another one.
-- catalogue: PUBLIC. Written only by the server when a listing is approved.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-uploads', 'seller-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
       ('catalogue', 'catalogue', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "sellers read own uploads" on storage.objects for select to authenticated
  using (bucket_id = 'seller-uploads' and (private.member_of_folder((storage.foldername(name))[1]) or private.is_staff()));
create policy "sellers upload to own incoming folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = 'incoming' and array_length(storage.foldername(name), 1) = 2);
create policy "sellers delete own incoming files" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-uploads' and private.member_of_folder((storage.foldername(name))[1])
         and (storage.foldername(name))[2] = 'incoming');

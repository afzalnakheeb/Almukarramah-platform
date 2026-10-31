-- Marketplace (6 of 9): listings with variants and stock, the price guard, public columns only, storefronts and
-- search.
--
-- * Variants (sizes, volumes, colours) each have their own stock and, optionally, their own VAT-inclusive price.
--   A product with variants has the sum of their stock (0 once the last one is removed). Stock changes are free.
-- * Price guard: a seller may move the price of a live listing (or a variant) up to the setting
--   price_change_review_bps (30%) away from the price our team APPROVED, without review; further than that sends the
--   listing back to our team, off sale until approved. Small steps cannot add up past the limit (review M1). While a
--   listing waits for the check or our team, any change to it, its price or its options sends it back to draft, so
--   nothing is approved that nobody saw (review M1, M2). Any other change to the content of a live listing takes it
--   back to draft, as before.
-- * The review notes, AI findings and reviewers of a listing are in listing_reviews (0012), readable by the seller and
--   our team only (mp_listing_private); products stays readable with select * by every client (review H4).
-- * Search (mp_search): English and Arabic in one index, Arabic normalised (diacritics, tatweel, alef, ya, ta marbuta,
--   Arabic-Indic digits), prefix matching; filters by category (with everything under it), seller, price, rating,
--   made to measure and the category's filterable attributes; facets with counts; sorting.
-- * Storefronts (mp_storefront): the seller's public profile with listing count, categories and rating.

-- ================================================================ Arabic and English search text
-- Lower case; Arabic diacritics and tatweel removed; alef forms, alef maqsura, ta marbuta, Persian ya and kaf unified;
-- Arabic-Indic and Persian digits to 0-9; spaces collapsed. supabase/functions/_shared/search.ts does the same.
create or replace function private.ar_normalize(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select btrim(regexp_replace(
    translate(regexp_replace(lower(coalesce(p, '')), '[ً-ٰٟۖ-ۭـ]', '', 'g'),
              'إأآٱىةیک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'اااايهيك01234567890123456789'),
    '\s+', ' ', 'g'));
$$;

-- The words of a listing: names, brand, SKU, descriptions and the text values of its attributes (not their keys).
create or replace function private.product_search_text(name_en text, name_ar text, brand text, sku text, description_en text, description_ar text, attributes jsonb)
returns text language sql immutable parallel safe set search_path = public as $$
  select private.ar_normalize(concat_ws(' ', name_en, name_ar, brand, sku, description_en, description_ar,
    (select string_agg(v, ' ') from (
       select e.value #>> '{}' as v from jsonb_each(coalesce(attributes, '{}'::jsonb)) e where jsonb_typeof(e.value) = 'string'
       union all
       select a #>> '{}' from jsonb_each(coalesce(attributes, '{}'::jsonb)) e,
              jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) a
       where jsonb_typeof(a) = 'string') x)));
$$;

alter table products
  add column rating_avg numeric(3,2) check (rating_avg is null or rating_avg between 1 and 5),   -- kept by the reviews (0019)
  add column rating_count int not null default 0 check (rating_count >= 0),
  add column search_text text generated always as
    (private.product_search_text(name_en, name_ar, brand, sku, description_en, description_ar, attributes)) stored,
  add column search_doc tsvector generated always as
    (to_tsvector('simple'::regconfig, private.product_search_text(name_en, name_ar, brand, sku, description_en, description_ar, attributes))) stored;
create index products_search on products using gin (search_doc);
create index products_live on products (listing_status, is_active, category_id) where listing_status = 'approved' and is_active;

-- ================================================================ variants
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  label_en text not null check (char_length(label_en) between 1 and 80),
  label_ar text not null check (char_length(label_ar) between 1 and 80),
  options jsonb not null default '{}' check (jsonb_typeof(options) = 'object'),   -- e.g. {"size": "M"} or {"volume_ml": 12}
  sku text check (char_length(sku) <= 64),
  price_minor int check (price_minor is null or price_minor > 0),   -- VAT-inclusive, in halalas; null: the product's price
  approved_price_minor int check (approved_price_minor is null or approved_price_minor > 0),   -- as our team last approved it
  stock int not null default 0 check (stock between 0 and 1000000),
  weight_g int check (weight_g is null or weight_g between 1 and 100000),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, label_en)
);
create unique index product_variants_sku on product_variants (product_id, sku) where sku is not null;
create index product_variants_product on product_variants (product_id, sort);
alter table product_variants enable row level security;
-- visible with the product (the products policy decides); written by the seller's members and by staff
create policy "read variants of visible products" on product_variants for select
  using (exists (select 1 from products p where p.id = product_id));
create policy "members manage their variants" on product_variants for all
  using (exists (select 1 from products p where p.id = product_id and p.seller_id is not null and private.is_seller_member(p.seller_id))
         or private.is_staff(array['owner', 'manager', 'operations']::staff_role[]))
  with check (exists (select 1 from products p where p.id = product_id and p.seller_id is not null and private.is_seller_member(p.seller_id))
              or private.is_staff(array['owner', 'manager', 'operations']::staff_role[]));

-- A live listing goes back to our team (prices) or to draft (content) from a variant change too. The listing is
-- changed by a function that runs as its owner, so the listing rules below let it through.
create or replace function private.mp_listing_changed(p_product uuid, p_kind text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- only for the seller's own listings (or staff); it never puts anything live
  if not exists (select 1 from products p where p.id = p_product and p.seller_id is not null
                 and (private.is_seller_member(p.seller_id) or private.is_staff())) then
    raise exception 'Not allowed' using detail = 'غير مسموح';
  end if;
  if p_kind = 'price' then
    update products set listing_status = 'pending_review', submitted_at = now() where id = p_product and listing_status = 'approved';
    if found then perform private.set_listing_review(p_product, jsonb_build_object('review_note', left(p_note, 1000))); end if;
  else
    update products set listing_status = 'draft', ai_checked_at = null
    where id = p_product and listing_status in ('approved', 'pending_review', 'check_pending');
  end if;
end $$;
revoke all on function private.mp_listing_changed(uuid, text, text) from public, anon;
grant execute on function private.mp_listing_changed(uuid, text, text) to authenticated;   -- called by the variant guard as the seller

create or replace function product_variants_guard() returns trigger language plpgsql set search_path = public as $$
declare
  st listing_status;
  base int;
  approved_base int;
  limit_bps int;
  ref int;
  pid uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
begin
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    if tg_op = 'UPDATE' then
      new.product_id := old.product_id;
      new.created_at := old.created_at;
      pid := old.product_id;
    end if;
  end if;
  if not private.is_end_user() or current_user not in ('authenticated', 'anon') then
    -- prices our team or the server set count as approved
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.price_minor is distinct from old.price_minor) then new.approved_price_minor := new.price_minor; end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'DELETE' then new.approved_price_minor := case when tg_op = 'UPDATE' then old.approved_price_minor end; end if;
  select listing_status, base_price_sar, approved_price_sar into st, base, approved_base from products where id = pid;
  if st = 'suspended' then raise exception using message = 'This listing is suspended. Please contact Al Mukarramah', detail = 'هذا المنتج موقوف. يُرجى التواصل مع المكرمة'; end if;
  if st in ('pending_review', 'check_pending') then
    -- the options are part of what the check and our team are looking at: any change sends the listing back (M2)
    if tg_op <> 'UPDATE' or (new.label_en, new.label_ar, new.options, new.sku, new.weight_g, new.price_minor, new.is_active)
                             is distinct from (old.label_en, old.label_ar, old.options, old.sku, old.weight_g, old.price_minor, old.is_active) then
      perform private.mp_listing_changed(pid, 'content', null);
    end if;
  elsif st = 'approved' then
    if tg_op = 'INSERT' then
      perform private.mp_listing_changed(pid, 'content', null);   -- a new option is new content to check
    elsif tg_op = 'UPDATE' then
      if (new.label_en, new.label_ar, new.options, new.sku, new.weight_g) is distinct from (old.label_en, old.label_ar, old.options, old.sku, old.weight_g) then
        perform private.mp_listing_changed(pid, 'content', null);
      elsif new.price_minor is distinct from old.price_minor then
        -- compared with the price our team approved for this option (or the listing), never with the last step (M1)
        limit_bps := coalesce((mp_public_settings() ->> 'price_change_review_bps')::int, 3000);   -- sellers cannot read mp_settings
        ref := coalesce(old.approved_price_minor, approved_base, base);
        if ref is null or abs(coalesce(new.price_minor, base) - ref)::numeric * 10000 > ref::numeric * limit_bps then
          perform private.mp_listing_changed(pid, 'price', format('Price of %s changed from %s (approved) to %s halalas.', new.label_en, ref, coalesce(new.price_minor, base)));
        end if;
      end if;
    end if;
    -- removing an option of a live listing adds nothing to check; its stock follows (product_variants_stock)
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger product_variants_guard before insert or update or delete on product_variants for each row execute function product_variants_guard();

-- the product's stock is the sum of its active variants; when the last one is removed there is nothing to sell until
-- the seller sets the stock again (review L6)
create or replace function product_variants_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  if exists (select 1 from product_variants where product_id = pid) then
    update products set stock = coalesce((select sum(stock) from product_variants where product_id = pid and is_active), 0) where id = pid;
  elsif tg_op = 'DELETE' then
    update products set stock = 0 where id = pid;
  end if;
  return null;
end $$;
create trigger product_variants_stock after insert or update or delete on product_variants for each row execute function product_variants_stock();
create trigger audit_product_variants after insert or update or delete on product_variants for each row execute function audit_trigger();

-- The price our team approved (the price guard compares with it), and the options' prices with it.
alter table products add column approved_price_sar int check (approved_price_sar is null or approved_price_sar > 0);
create or replace function private.products_approved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.listing_status = 'approved' and old.listing_status is distinct from 'approved' then
    update product_variants set approved_price_minor = price_minor where product_id = new.id and approved_price_minor is distinct from price_minor;
  end if;
  return null;
end $$;
revoke all on function private.products_approved() from public, anon, authenticated;
create trigger products_approved after update of listing_status on products for each row execute function private.products_approved();

-- ================================================================ listings: the price guard
create or replace function products_seller_guard() returns trigger language plpgsql set search_path = public as $$
declare
  content_changed boolean;
  compliance_changed boolean;
  price_review boolean := false;
  limit_bps int;
  ref int;
  img text;
  -- fields that are not the seller's content (or are judged separately, like the price)
  staff_keys text[] := array['stock', 'is_active', 'updated_at', 'listing_status', 'submitted_at', 'ai_checked_at', 'reviewed_at',
                              'compliance_status', 'compliance_reviewed_at', 'base_price_sar', 'approved_price_sar',
                              'rating_avg', 'rating_count', 'search_text', 'search_doc'];
  compliance_keys text[] := array['hs_code', 'origin_country', 'dangerous_goods', 'length_mm', 'width_mm', 'height_mm', 'allowed_destinations', 'restricted_countries'];
begin
  -- staff, the server and functions running as their owner are not limited here
  if not private.is_end_user() or current_user not in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and new.compliance_status is distinct from old.compliance_status and new.compliance_status in ('cleared', 'rejected') then
      new.compliance_reviewed_at := now();
    end if;
    -- the price as our team approved it: what the price guard compares with (M1)
    if new.listing_status = 'approved' and (tg_op = 'INSERT' or old.listing_status is distinct from 'approved' or new.base_price_sar is distinct from old.base_price_sar) then
      new.approved_price_sar := new.base_price_sar;
    end if;
    return new;
  end if;
  if new.seller_id is null then raise exception using message = 'Not allowed', detail = 'غير مسموح'; end if;

  -- photos and design-option pictures: the seller's own uploads (screened before anything is published); a public
  -- catalogue copy from an earlier approval may be kept, never added (H5, H6)
  foreach img in array coalesce(new.images, '{}') loop
    if not (img like new.seller_id::text || '/media/%'
            or (tg_op = 'UPDATE' and img like 'https://%' and img = any(coalesce(old.images, '{}')))) then
      raise exception using message = 'Photos must be uploaded through your seller dashboard', detail = 'يجب رفع الصور من لوحة البائع';
    end if;
  end loop;
  for img in select x from private.option_images(new.tailoring) x loop
    if not (img like new.seller_id::text || '/media/%'
            or (tg_op = 'UPDATE' and img like 'https://%' and img in (select y from private.option_images(old.tailoring) y))) then
      raise exception using message = 'Design-option pictures must be uploaded through your seller dashboard', detail = 'يجب رفع صور خيارات التصميم من لوحة البائع';
    end if;
  end loop;
  if coalesce(array_length(new.images, 1), 0) > 10 then raise exception using message = 'Up to 10 photos per product', detail = 'حتى 10 صور لكل منتج'; end if;

  new.updated_at := now();
  new.rating_avg := case when tg_op = 'UPDATE' then old.rating_avg else null end;
  new.rating_count := case when tg_op = 'UPDATE' then old.rating_count else 0 end;

  if tg_op = 'INSERT' then
    new.listing_status := 'draft';
    new.ai_checked_at := null;
    new.submitted_at := null;
    new.reviewed_at := null;
    new.is_featured := false;
    new.compliance_status := 'pending';
    new.compliance_reviewed_at := null;
    new.approved_price_sar := null;
    return new;
  end if;

  new.is_featured := old.is_featured;
  new.reviewed_at := old.reviewed_at;
  new.seller_id := old.seller_id;
  new.submitted_at := old.submitted_at;
  new.ai_checked_at := old.ai_checked_at;
  new.compliance_reviewed_at := old.compliance_reviewed_at;
  new.approved_price_sar := old.approved_price_sar;

  compliance_changed := (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(compliance_keys) k)
                        is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(compliance_keys) k);
  new.compliance_status := case when compliance_changed then 'pending' else old.compliance_status end;

  content_changed := (to_jsonb(new) - staff_keys - compliance_keys) is distinct from (to_jsonb(old) - staff_keys - compliance_keys);
  if content_changed then
    if old.listing_status = 'suspended' then raise exception using message = 'This listing is suspended. Please contact Al Mukarramah', detail = 'هذا المنتج موقوف. يُرجى التواصل مع المكرمة'; end if;
    new.ai_checked_at := null;
    if old.listing_status in ('approved', 'pending_review', 'check_pending') then
      new.listing_status := 'draft';
    end if;
  elsif new.base_price_sar is distinct from old.base_price_sar and old.listing_status in ('pending_review', 'check_pending') then
    -- the price is part of what is being checked: it cannot change underneath our team (M1)
    new.ai_checked_at := null;
    new.listing_status := 'draft';
  elsif new.base_price_sar is distinct from old.base_price_sar and old.listing_status = 'approved' then
    -- near the approved price it stays live; further away it goes back to our team (M1: never against the last step)
    limit_bps := coalesce((mp_public_settings() ->> 'price_change_review_bps')::int, 3000);   -- sellers cannot read mp_settings
    ref := coalesce(old.approved_price_sar, old.base_price_sar);
    if abs(new.base_price_sar - ref)::numeric * 10000 > ref::numeric * limit_bps then
      price_review := true;
      new.listing_status := 'pending_review';
      new.submitted_at := now();
    end if;
  end if;
  if old.listing_status = 'suspended' and new.base_price_sar is distinct from old.base_price_sar then
    raise exception using message = 'This listing is suspended. Please contact Al Mukarramah', detail = 'هذا المنتج موقوف. يُرجى التواصل مع المكرمة';
  end if;

  if new.listing_status is distinct from old.listing_status and new.listing_status <> 'draft' and not price_review then
    raise exception using message = format('Only Al Mukarramah can move a listing to %s', new.listing_status), detail = 'المكرمة وحدها تغيّر حالة المنتج إلى هذه الحالة';
  end if;
  if new.listing_status = 'draft' and old.listing_status = 'suspended' then
    raise exception using message = 'This listing is suspended. Please contact Al Mukarramah', detail = 'هذا المنتج موقوف. يُرجى التواصل مع المكرمة';
  end if;
  return new;
end $$;

-- ================================================================ review notes: the seller and our team only
-- (Review H4: no column grants on products. Every client, including builds made before the marketplace, reads
-- products with select *; what is private about a listing lives in listing_reviews.) The price-review note is worked
-- out from the approved price.
create or replace function mp_listing_private(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id,
           'ai_check', case when p.ai_checked_at is not null then r.ai_check end, 'ai_checked_at', p.ai_checked_at,
           'review_note', case when p.listing_status = 'pending_review' and p.approved_price_sar is not null and p.base_price_sar <> p.approved_price_sar
                               then format('Price changed from %s (approved) to %s halalas (%s%%).', p.approved_price_sar, p.base_price_sar,
                                           round(100.0 * (p.base_price_sar - p.approved_price_sar) / p.approved_price_sar))
                               else r.review_note end,
           'reviewed_at', p.reviewed_at, 'submitted_at', p.submitted_at, 'compliance_note', r.compliance_note,
           'approved_price_sar', p.approved_price_sar)), '[]'::jsonb)
  from products p left join listing_reviews r on r.product_id = p.id
  where p.id = any(p_ids) and (private.is_staff() or (p.seller_id is not null and private.is_seller_member(p.seller_id)));
$$;
revoke all on function mp_listing_private(uuid[]) from public, anon;
grant execute on function mp_listing_private(uuid[]) to authenticated;

-- Our team's decision on a listing in the queue (server only: review-listing publishes the photos first). Approval
-- applies only to the listing as it was read: if it changed meanwhile (it went back to draft), nothing is approved
-- that nobody saw (review M15). The decision is attributed to the person (review M13).
create or replace function mp_approve_listing(p_product uuid, p_user uuid, p_expect_updated timestamptz, p_images text[], p_tailoring jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p products;
begin
  if not exists (select 1 from staff_members where user_id = p_user and role in ('owner', 'manager', 'marketing')) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  perform private.act_as(p_user);
  select * into p from products where id = p_product for update;
  if p.id is null or p.seller_id is null then raise exception 'Listing not found'; end if;
  if p.listing_status <> 'pending_review' or p.updated_at is distinct from p_expect_updated then
    return jsonb_build_object('applied', false, 'status', p.listing_status);
  end if;
  if cardinality(coalesce(p_images, '{}')) <> cardinality(coalesce(p.images, '{}')) then raise exception 'The photos changed: reload the listing'; end if;
  update products set images = p_images, tailoring = case when p.tailoring is null then null else coalesce(p_tailoring, p.tailoring) end,
    listing_status = 'approved', is_active = true, reviewed_at = now()
  where id = p.id;
  perform private.set_listing_review(p.id, jsonb_build_object('review_note', nullif(trim(coalesce(p_note, '')), ''), 'reviewed_by', p_user));
  if p.category_id is not null then update categories set is_active = true where id = p.category_id and kind = 'category'; end if;
  return jsonb_build_object('applied', true, 'status', 'approved');
end $$;

create or replace function mp_reject_listing(p_product uuid, p_user uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p products;
begin
  if not exists (select 1 from staff_members where user_id = p_user and role in ('owner', 'manager', 'marketing')) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  perform private.act_as(p_user);
  if coalesce(trim(p_note), '') = '' then raise exception 'Please write a short note for the seller'; end if;
  select * into p from products where id = p_product for update;
  if p.id is null or p.seller_id is null then raise exception 'Listing not found'; end if;
  if p.listing_status not in ('pending_review', 'approved', 'check_pending') then raise exception 'This listing is %', p.listing_status; end if;
  update products set listing_status = 'rejected', reviewed_at = now() where id = p.id;
  perform private.set_listing_review(p.id, jsonb_build_object('review_note', left(trim(p_note), 1000), 'reviewed_by', p_user));
  return jsonb_build_object('applied', true, 'status', 'rejected');
end $$;
revoke all on function mp_approve_listing(uuid, uuid, timestamptz, text[], jsonb, text) from public, anon, authenticated;
revoke all on function mp_reject_listing(uuid, uuid, text) from public, anon, authenticated;

-- ================================================================ search
-- p: {q, category (slug, includes everything under it), seller (slug), min_price, max_price (halalas, VAT incl.),
--     rating_min, made_to_measure, attributes {key: value | [values] | {min, max}}, sort (relevance | featured |
--     newest | price_asc | price_desc | rating), page, page_size (up to 48)}
-- Runs as the caller: the products policy decides what is visible (live listings of approved sellers).
create or replace function mp_search(p jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_q text := private.ar_normalize(left(coalesce(p ->> 'q', ''), 200));
  v_tsq tsquery;
  v_cat uuid;
  v_cats uuid[];
  v_seller uuid;
  v_min int := nullif(p ->> 'min_price', '')::int;
  v_max int := nullif(p ->> 'max_price', '')::int;
  v_rating numeric := nullif(p ->> 'rating_min', '')::numeric;
  v_mtm boolean := nullif(p ->> 'made_to_measure', '')::boolean;
  v_attrs jsonb := case when jsonb_typeof(p -> 'attributes') = 'object' then p -> 'attributes' else '{}'::jsonb end;
  v_sort text := coalesce(nullif(p ->> 'sort', ''), case when coalesce(p ->> 'q', '') = '' then 'featured' else 'relevance' end);
  v_page int := greatest(1, coalesce(nullif(p ->> 'page', '')::int, 1));
  v_size int := least(48, greatest(1, coalesce(nullif(p ->> 'page_size', '')::int, 24)));
  v_result jsonb;
begin
  if v_q <> '' then
    select to_tsquery('simple', string_agg(quote_literal(tok) || ':*', ' & ')) into v_tsq
    from (select regexp_replace(t, '[&|!():*<>''\\]', '', 'g') as tok from unnest(string_to_array(v_q, ' ')) t) x
    where tok <> '';
  end if;
  if nullif(p ->> 'category', '') is not null then
    select c.id into v_cat from categories c where c.slug = p ->> 'category';
    with recursive d as (select c.id from categories c where c.id = v_cat
                         union all select c.id from categories c join d on c.parent_id = d.id)
    select coalesce(array_agg(d.id), '{}') into v_cats from d;
  end if;
  if nullif(p ->> 'seller', '') is not null then
    select s.id into v_seller from sellers s where s.slug = p ->> 'seller';
    v_seller := coalesce(v_seller, '00000000-0000-0000-0000-000000000000');
  end if;

  with hits as materialized (
    select pr.id, pr.category_id, pr.seller_id, pr.attributes, pr.rating_avg, pr.is_featured, pr.created_at,
           coalesce((select min(coalesce(v.price_minor, pr.base_price_sar)) from product_variants v where v.product_id = pr.id and v.is_active), pr.base_price_sar) as price_from,
           case when v_tsq is null then 0 else ts_rank(pr.search_doc, v_tsq) end as rank
    from products pr
    where pr.is_active and pr.listing_status = 'approved'
      and (v_q = '' or (v_tsq is not null and pr.search_doc @@ v_tsq) or pr.search_text like '%' || v_q || '%')
      and (v_cats is null or pr.category_id = any(v_cats))
      and (v_seller is null or pr.seller_id = v_seller)
      and (v_rating is null or pr.rating_avg >= v_rating)
      and (v_mtm is null or coalesce(pr.made_to_measure, false) = v_mtm)
      and not exists (
        select 1 from jsonb_each(v_attrs) f(k, v)
        where not coalesce(case jsonb_typeof(f.v)
          when 'array' then exists (select 1 from jsonb_array_elements_text(f.v) w(val)
                                    where pr.attributes ->> f.k = w.val or (jsonb_typeof(pr.attributes -> f.k) = 'array' and pr.attributes -> f.k ? w.val))
          when 'object' then (pr.attributes ->> f.k) ~ '^-?[0-9]+(\.[0-9]+)?$'
                             and (f.v ->> 'min' is null or (pr.attributes ->> f.k)::numeric >= (f.v ->> 'min')::numeric)
                             and (f.v ->> 'max' is null or (pr.attributes ->> f.k)::numeric <= (f.v ->> 'max')::numeric)
          else pr.attributes -> f.k = f.v or (jsonb_typeof(pr.attributes -> f.k) = 'array' and pr.attributes -> f.k @> jsonb_build_array(f.v))
        end, false))
  ), priced as (
    select * from hits h where (v_min is null or h.price_from >= v_min) and (v_max is null or h.price_from <= v_max)
  ), page_rows as (
    select h.*, row_number() over (order by
             case when v_sort = 'price_asc' then h.price_from end asc nulls last,
             case when v_sort = 'price_desc' then h.price_from end desc nulls last,
             case when v_sort = 'rating' then coalesce(h.rating_avg, 0) end desc,
             case when v_sort = 'newest' then h.created_at end desc,
             case when v_sort = 'relevance' then h.rank end desc,
             h.is_featured desc, h.created_at desc, h.id) as ord
    from priced h
  )
  select jsonb_build_object(
    'total', (select count(*) from priced),
    'page', v_page, 'page_size', v_size, 'sort', v_sort,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'slug', pr.slug, 'name_en', pr.name_en, 'name_ar', pr.name_ar, 'brand', pr.brand,
               'images', to_jsonb(pr.images[1:2]), 'base_price_sar', pr.base_price_sar, 'price_from', r.price_from,
               'has_variants', exists (select 1 from product_variants v where v.product_id = pr.id and v.is_active),
               'stock', pr.stock, 'rating_avg', pr.rating_avg, 'rating_count', pr.rating_count, 'made_to_measure', coalesce(pr.made_to_measure, false),
               'category', (select jsonb_build_object('slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar) from categories c where c.id = pr.category_id),
               'seller', (select jsonb_build_object('slug', s.slug, 'name_en', s.name_en, 'name_ar', s.name_ar) from sellers s where s.id = pr.seller_id and s.kind = 'marketplace'))
             order by r.ord), '[]'::jsonb)
              from page_rows r join products pr on pr.id = r.id
              where r.ord > (v_page - 1) * v_size and r.ord <= v_page * v_size),
    'facets', jsonb_build_object(
      'price', (select jsonb_build_object('min', min(h.price_from), 'max', max(h.price_from)) from hits h),
      'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar, 'count', g.n) order by g.n desc, c.name_en), '[]'::jsonb)
                     from (select h.category_id, count(*) n from priced h group by 1) g join categories c on c.id = g.category_id),
      'sellers', (select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'name_en', s.name_en, 'name_ar', s.name_ar, 'count', g.n) order by g.n desc, s.name_en), '[]'::jsonb)
                  from (select h.seller_id, count(*) n from priced h where h.seller_id is not null group by 1) g
                  join sellers s on s.id = g.seller_id and s.kind = 'marketplace'),
      'house', (select count(*) from priced h where h.seller_id is null),
      'rating', jsonb_build_array(
        jsonb_build_object('min', 4, 'count', (select count(*) from priced h where h.rating_avg >= 4)),
        jsonb_build_object('min', 3, 'count', (select count(*) from priced h where h.rating_avg >= 3))),
      'attributes', case when v_cat is null then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object('key', a ->> 'key', 'label_en', a ->> 'label_en', 'label_ar', a ->> 'label_ar', 'type', a ->> 'type', 'unit', a ->> 'unit',
                 'values', case when a ->> 'type' = 'number' then
                     (select jsonb_build_object('min', min((h.attributes ->> (a ->> 'key'))::numeric), 'max', max((h.attributes ->> (a ->> 'key'))::numeric))
                      from priced h where (h.attributes ->> (a ->> 'key')) ~ '^-?[0-9]+(\.[0-9]+)?$')
                   else (select coalesce(jsonb_agg(jsonb_build_object('value', g.val, 'count', g.n,
                           'en', coalesce((select o ->> 'en' from jsonb_array_elements(a -> 'options') o where o ->> 'value' = g.val), g.val),
                           'ar', coalesce((select o ->> 'ar' from jsonb_array_elements(a -> 'options') o where o ->> 'value' = g.val), g.val)) order by g.n desc, g.val), '[]'::jsonb)
                         from (select x.val, count(*) n from priced h,
                                 lateral jsonb_array_elements_text(case when jsonb_typeof(h.attributes -> (a ->> 'key')) = 'array' then h.attributes -> (a ->> 'key')
                                                                        else jsonb_build_array(h.attributes -> (a ->> 'key')) end) as x(val)
                               where h.attributes ? (a ->> 'key') and x.val is not null group by x.val) g)
                 end) order by (a ->> 'sort')::int nulls last), '[]'::jsonb)
        from jsonb_array_elements(mp_category_attributes(v_cat)) a
        where (a ->> 'filterable')::boolean and a ->> 'type' in ('select', 'multiselect', 'boolean', 'country', 'number'))
      end)
  ) into v_result;
  return v_result;
end $$;
grant execute on function mp_search(jsonb) to anon, authenticated;

-- ================================================================ storefronts
-- The public shop page: what our team approved (pending changes are not shown, H5), only while the marketplace is
-- open (the seller and our team see it before). A logo or banner shows only from our own catalogue storage (our team
-- publishes it after its photo check). The seller's website is not shown: customers buy through Al Mukarramah.
create or replace function mp_storefront(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'seller', jsonb_build_object('id', s.id, 'slug', s.slug, 'name_en', s.name_en, 'name_ar', s.name_ar, 'tagline_en', s.tagline_en, 'tagline_ar', s.tagline_ar,
      'about_en', s.about_en, 'about_ar', s.about_ar, 'country', s.country, 'city', s.city,
      'logo', case when s.logo like 'https://%/storage/v1/object/public/catalogue/' || s.id::text || '/%' then s.logo end,
      'banner', case when s.banner like 'https://%/storage/v1/object/public/catalogue/' || s.id::text || '/%' then s.banner end,
      'handling_days', s.handling_days, 'returns_en', s.returns_en, 'returns_ar', s.returns_ar, 'since', s.approved_at),
    'listings', (select count(*) from products p where p.seller_id = s.id and p.is_active and p.listing_status = 'approved'),
    'rating_avg', (select round(sum(p.rating_avg * p.rating_count) / nullif(sum(p.rating_count), 0), 2) from products p
                   where p.seller_id = s.id and p.listing_status = 'approved' and p.rating_count > 0),
    'rating_count', (select coalesce(sum(p.rating_count), 0) from products p where p.seller_id = s.id and p.listing_status = 'approved'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar, 'count', n) order by n desc), '[]'::jsonb)
                   from (select category_id, count(*) n from products p where p.seller_id = s.id and p.is_active and p.listing_status = 'approved' group by 1) g
                   join categories c on c.id = g.category_id))
  from sellers s
  where s.slug = p_slug and s.status = 'approved' and s.kind = 'marketplace'
    and (private.marketplace_open() or private.is_staff() or private.is_seller_member(s.id));
$$;
grant execute on function mp_storefront(text) to anon, authenticated;

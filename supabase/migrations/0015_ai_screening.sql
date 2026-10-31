-- Marketplace (4 of 9): AI screening that rejects BEFORE the staff queue.
--
-- * Every image is screened as it is uploaded (listing photos, seller logo and banner, application portfolio,
--   later review photos): type and size checked, metadata (EXIF, location) stripped, hashed for de-duplication,
--   then a fast model, escalated to a stronger model on anything that is not a confident pass.
-- * The whole listing is screened again when it is submitted (text, photos, the category's requirements).
-- * Outcomes: block -> rejected automatically with reasons in English and Arabic (never reaches the staff queue);
--   review -> staff queue with the AI's notes; pass -> staff queue. A person approves every listing.
-- * Never fail open: if the AI is unavailable the image or listing stays "pending" / "check_pending".
-- * Every verdict is stored (model, prompt version, scores, reasons) and never edited; staff overrides carry a reason
--   and are audited. Prohibited content is quarantined (staff only) and deleted after the retention period.
-- * Strikes: hard violations within the window (default 3 in 90 days) suspend the seller pending staff review;
--   a severe violation suspends the listing at once and flags the seller.

alter table sellers
  add column flagged_at timestamptz,
  add column flag_reason text,
  add column suspended_reason text check (suspended_reason is null or suspended_reason in ('strikes', 'severe_violation', 'performance', 'staff', 'kyc'));
-- (sellers_guard already keeps sellers from changing anything but their own profile; these are staff/server fields)
create or replace function sellers_guard() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if not private.is_end_user() then
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := now();
      new.suspended_reason := null;
    end if;
    return new;
  end if;
  new.status := old.status;
  new.kind := old.kind;
  new.commission_bps := old.commission_bps;
  new.review_note := old.review_note;
  new.approved_at := old.approved_at;
  new.agreed_guidelines_at := old.agreed_guidelines_at;
  new.country := old.country;
  new.created_at := old.created_at;
  new.flagged_at := old.flagged_at;
  new.flag_reason := old.flag_reason;
  new.suspended_reason := old.suspended_reason;
  -- the shop's logo and banner are screened media too (0016 publishes them on approval)
  if new.logo is distinct from old.logo and new.logo is not null and new.logo not like new.id::text || '/media/%'
     and new.logo not like '%/storage/v1/object/public/catalogue/' || new.id::text || '/%' then
    raise exception 'Upload your logo through the seller dashboard';
  end if;
  if new.banner is distinct from old.banner and new.banner is not null and new.banner not like new.id::text || '/media/%'
     and new.banner not like '%/storage/v1/object/public/catalogue/' || new.id::text || '/%' then
    raise exception 'Upload your banner through the seller dashboard';
  end if;
  if old.status = 'approved' then new.slug := old.slug; end if;
  return new;
end $$;

-- ================================================================ listing details and documents
-- The category's attributes (0014) filled in by the seller, e.g. {"volume_ml": 3, "contains_alcohol": false}.
alter table products add column attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object');

-- Documents a category requires for a listing (halal certificate, licensed-printer certificate, content approval...),
-- stored in the private seller-kyc bucket; staff check them before approval.
create table product_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  doc_type text not null references document_types(code),
  path text not null unique,
  file_name text check (char_length(file_name) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  note text,
  expires_on date,
  uploaded_by uuid default auth.uid() references auth.users,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz
);
create index product_documents_product on product_documents (product_id);
alter table product_documents enable row level security;
create policy "members and staff read product documents" on product_documents for select using (
  private.is_staff() or exists (select 1 from products p where p.id = product_id and private.is_seller_member(p.seller_id)));
create policy "members add product documents" on product_documents for insert with check (
  exists (select 1 from products p where p.id = product_id and private.is_seller_member(p.seller_id)
          and path like p.seller_id::text || '/products/' || p.id::text || '/%'));
create policy "members remove unreviewed product documents" on product_documents for delete using (
  status <> 'accepted' and exists (select 1 from products p where p.id = product_id and private.is_seller_member(p.seller_id)));
create policy "staff review product documents" on product_documents for update
  using (private.is_staff(array['owner', 'manager', 'marketing']::staff_role[])) with check (private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]));
create trigger product_documents_guard before insert or update on product_documents for each row execute function seller_documents_guard();
create trigger audit_product_documents after insert or update or delete on product_documents for each row execute function audit_trigger();
-- The files sit in the private seller-kyc bucket under <seller>/products/<product>/. Listing reviewers may open them
-- (the KYC files beside them stay with owner, manager and finance); a seller cannot delete a file staff accepted.
create policy "listing reviewers read product document files" on storage.objects for select to authenticated
  using (bucket_id = 'seller-kyc' and (storage.foldername(name))[2] = 'products'
         and private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]));
drop policy "sellers delete unreviewed kyc files" on storage.objects;
create policy "sellers delete unreviewed kyc files" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-kyc' and private.member_of_folder((storage.foldername(name))[1])
         and not exists (select 1 from public.seller_documents d where d.path = name and d.status = 'accepted')
         and not exists (select 1 from public.product_documents d where d.path = name and d.status = 'accepted'));

-- ================================================================ media assets
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references sellers on delete cascade,          -- null for customers' review photos
  user_id uuid references auth.users on delete set null,        -- who uploaded it
  kind text not null check (kind in ('listing_photo', 'seller_logo', 'seller_banner', 'portfolio', 'review_photo')),
  bucket text not null default 'seller-uploads',
  path text,                                                    -- current location (media/ when usable, quarantine when blocked, null once deleted)
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes between 1 and 10485760),
  width int check (width > 0),
  height int check (height > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'passed', 'review', 'rejected', 'blocked')),
  flags text[] not null default '{}',
  reasons jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),   -- [{code, en, ar}] shown to the seller
  attempts int not null default 0,
  last_error text,
  screened_at timestamptz,
  quarantined_at timestamptz,
  delete_after timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_seller on media_assets (seller_id, created_at desc);
create index media_assets_pending on media_assets (status, updated_at) where status = 'pending';
create index media_assets_hash on media_assets (sha256);
create index media_assets_quarantine on media_assets (delete_after) where status = 'blocked' and deleted_at is null;
create unique index media_assets_path on media_assets (bucket, path) where path is not null;

-- Images found prohibited once are blocked for everyone, at once, by their hash.
create table blocked_hashes (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  policy_code text,
  first_asset_id uuid references media_assets on delete set null,
  created_at timestamptz not null default now()
);

alter table media_assets enable row level security;
alter table blocked_hashes enable row level security;
create policy "members and staff read media" on media_assets for select using (
  private.is_staff() or private.is_seller_member(seller_id) or (seller_id is null and user_id = auth.uid()));
create policy "staff read blocked hashes" on blocked_hashes for select using (private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]));
-- media_assets and blocked_hashes are written only by the server (screen-image, review-screening).
create trigger media_assets_touch before update on media_assets for each row execute function mp_touch();
create trigger audit_media_assets after insert or update or delete on media_assets for each row execute function audit_trigger();
create trigger audit_blocked_hashes after insert or update or delete on blocked_hashes for each row execute function audit_keyed('sha256');

-- ================================================================ every verdict, kept (append-only)
create table screening_runs (
  id bigint generated always as identity primary key,
  subject text not null check (subject in ('image', 'listing')),
  asset_id uuid references media_assets on delete set null,
  product_id uuid references products on delete set null,
  seller_id uuid references sellers on delete set null,
  stage text not null check (stage in ('rules', 'fast', 'strong', 'final', 'override')),
  model text,
  prompt_version text,
  verdict text not null check (verdict in ('pass', 'review', 'block', 'error')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  scores jsonb not null default '{}',
  flags text[] not null default '{}',
  rule_hits jsonb not null default '[]',      -- [{code, level, severity, confidence, evidence}]
  reasons jsonb not null default '[]',        -- [{code, en, ar, field?, photo?}]
  raw text,                                   -- the model's answer, trimmed (staff only)
  latency_ms int,
  actor uuid references auth.users,           -- for overrides
  created_at timestamptz not null default now()
);
create index screening_runs_asset on screening_runs (asset_id, id);
create index screening_runs_product on screening_runs (product_id, id);
create index screening_runs_recent on screening_runs (created_at desc) where stage = 'final';
alter table screening_runs enable row level security;
create policy "staff read screening" on screening_runs for select using (private.is_staff());
-- Nobody edits or deletes a verdict, not even staff (corrections are new 'override' rows).
create or replace function screening_runs_immutable() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := case when tg_op = 'UPDATE' then to_jsonb(new) end;
  link text;
  gone boolean;
begin
  -- the one exception (review N4, REVIEW-2): a seller deletes a draft, a photo is deleted, a seller is deleted; the
  -- record stays, unlinked by its foreign key (the parent must really be gone)
  if tg_op = 'UPDATE' then
    foreach link in array array['product_id=products', 'asset_id=media_assets', 'seller_id=sellers'] loop
      continue when (v_old ->> split_part(link, '=', 1)) is null;
      execute format('select not exists (select 1 from %s where id = $1::uuid)', split_part(link, '=', 2)) into gone using v_old ->> split_part(link, '=', 1);
      if gone and (v_new -> split_part(link, '=', 1)) = 'null'::jsonb and (v_old - split_part(link, '=', 1)) = (v_new - split_part(link, '=', 1)) then
        return new;
      end if;
    end loop;
  end if;
  raise exception 'Screening records are never edited or deleted; record an override instead';
end $$;
create trigger screening_runs_immutable before update or delete on screening_runs for each row execute function screening_runs_immutable();
create trigger audit_screening_runs after insert on screening_runs for each row execute function audit_trigger();

-- ================================================================ strikes
create table seller_strikes (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers on delete cascade,
  kind text not null check (kind in ('hard', 'severe')),
  policy_code text,
  asset_id uuid references media_assets on delete set null,
  product_id uuid references products on delete set null,
  run_id bigint references screening_runs on delete set null,
  note text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users,
  void_reason text,
  check (voided_at is null or (voided_by is not null and coalesce(trim(void_reason), '') <> ''))
);
create index seller_strikes_seller on seller_strikes (seller_id, created_at desc);
alter table seller_strikes enable row level security;
create policy "members and staff read strikes" on seller_strikes for select using (private.is_staff() or private.is_seller_member(seller_id));
create trigger audit_seller_strikes after insert or update or delete on seller_strikes for each row execute function audit_trigger();

-- A new strike may suspend the seller (limit within the window) or, if severe, suspend the listing at once.
create or replace function seller_strikes_apply() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s mp_settings;
  active int;
begin
  if tg_op <> 'INSERT' then return new; end if;
  select * into s from mp_settings where id = 1;
  if new.kind = 'severe' then
    update sellers set flagged_at = now(), flag_reason = coalesce(new.policy_code, 'severe violation') where id = new.seller_id;
    if new.product_id is not null then
      update products set listing_status = 'suspended', is_active = false where id = new.product_id;
      if not exists (select 1 from listing_reviews where product_id = new.product_id and review_note is not null) then
        perform private.set_listing_review(new.product_id, jsonb_build_object('review_note', 'Suspended automatically after a severe violation of the Al Mukarramah standard'));
      end if;
    end if;
  end if;
  select count(*) into active from seller_strikes
  where seller_id = new.seller_id and voided_at is null and created_at > now() - make_interval(days => s.strike_window_days);
  if active >= s.strike_limit then
    update sellers set status = 'suspended', suspended_reason = 'strikes',
      review_note = format('Suspended automatically after %s violations within %s days, pending review by Al Mukarramah.', active, s.strike_window_days)
    where id = new.seller_id and status <> 'suspended';
  end if;
  return new;
end $$;
create trigger seller_strikes_apply after insert on seller_strikes for each row execute function seller_strikes_apply();

-- ================================================================ rate limits
create table mp_rate_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table mp_rate_counters enable row level security;   -- no policies: server only
-- Counts one hit and says whether it is within the limit for the current window.
create or replace function mp_rate_hit(p_key text, p_window_seconds int, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into mp_rate_counters as c (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = c.count + 1
  returning c.count into n;
  delete from mp_rate_counters where window_start < now() - interval '2 days' and random() < 0.01;
  return n <= p_limit;
end $$;
revoke all on function mp_rate_hit(text, int, int) from public, anon, authenticated;

-- ================================================================ quarantine
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quarantine', 'quarantine', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "staff read quarantine" on storage.objects for select to authenticated
  using (bucket_id = 'quarantine' and private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]));

-- The asset behind a listing photo: a screened media path (<seller>/media/<asset id>.<ext>) or its public catalogue
-- copy (.../catalogue/<seller>/<asset id>.<ext>) published at an approval.
create or replace function private.asset_of(p_image text, p_seller uuid) returns uuid
language plpgsql immutable as $$
declare f text;
begin
  if p_image like p_seller::text || '/media/%' or p_image like '%/storage/v1/object/public/catalogue/' || p_seller::text || '/%' then
    f := split_part(regexp_replace(p_image, '^.*/', ''), '.', 1);
    return f::uuid;
  end if;
  return null;
exception when others then
  return null;
end $$;

-- ================================================================ server-side records (service role only)
-- Records an image verdict (the final stage applies it to the asset). Strikes are added for prohibited content.
create or replace function mp_record_image_screening(p_asset uuid, p_runs jsonb, p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a media_assets;
  r jsonb;
  final_run bigint;
  st text := p_outcome ->> 'status';
begin
  select * into a from media_assets where id = p_asset for update;
  if a.id is null then raise exception 'asset not found'; end if;
  if st not in ('pending', 'passed', 'review', 'rejected', 'blocked') then raise exception 'bad status %', st; end if;
  for r in select * from jsonb_array_elements(coalesce(p_runs, '[]')) loop
    insert into screening_runs (subject, asset_id, seller_id, stage, model, prompt_version, verdict, confidence, scores, flags, rule_hits, reasons, raw, latency_ms)
    values ('image', a.id, a.seller_id, r ->> 'stage', r ->> 'model', r ->> 'prompt_version', r ->> 'verdict', (r ->> 'confidence')::numeric,
            coalesce(r -> 'scores', '{}'), coalesce(array(select jsonb_array_elements_text(r -> 'flags')), '{}'),
            coalesce(r -> 'rule_hits', '[]'), coalesce(r -> 'reasons', '[]'), left(r ->> 'raw', 8000), (r ->> 'latency_ms')::int)
    returning id into final_run;
  end loop;
  update media_assets set
    status = st,
    flags = coalesce(array(select jsonb_array_elements_text(p_outcome -> 'flags')), '{}'),
    reasons = coalesce(p_outcome -> 'reasons', '[]'),
    path = case when p_outcome ? 'path' then p_outcome ->> 'path' else path end,
    bucket = coalesce(p_outcome ->> 'bucket', bucket),
    attempts = attempts + 1,
    last_error = p_outcome ->> 'error',
    screened_at = case when st <> 'pending' then now() else screened_at end,
    quarantined_at = case when st = 'blocked' then now() else quarantined_at end,
    delete_after = case when st = 'blocked' then now() + make_interval(days => (select quarantine_retention_days from mp_settings where id = 1)) else delete_after end
  where id = a.id;
  if st = 'blocked' then
    insert into blocked_hashes (sha256, policy_code, first_asset_id) values (a.sha256, p_outcome ->> 'policy_code', a.id) on conflict do nothing;
    if a.seller_id is not null and coalesce(p_outcome ->> 'strike', '') in ('hard', 'severe') then
      insert into seller_strikes (seller_id, kind, policy_code, asset_id, run_id, note)
      values (a.seller_id, p_outcome ->> 'strike', p_outcome ->> 'policy_code', a.id, final_run, 'Image screening');
    end if;
  end if;
  return jsonb_build_object('asset_id', a.id, 'status', st);
end $$;
revoke all on function mp_record_image_screening(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Moves a submitted listing to "check pending" before the full screening runs (server only). The seller must be a
-- member and approved, the listing a draft (or rejected) with every photo screened.
create or replace function mp_begin_listing_check(p_product uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p products;
  bad int;
begin
  select * into p from products where id = p_product for update;
  if p.id is null or p.seller_id is null then raise exception 'Listing not found'; end if;
  if not exists (select 1 from seller_members m where m.seller_id = p.seller_id and m.user_id = p_user) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if not private.seller_approved(p.seller_id) then raise exception 'Your seller account is not approved'; end if;
  if p.listing_status not in ('draft', 'rejected', 'check_pending') then raise exception 'This listing is already %', p.listing_status; end if;
  -- photos are screened media of this seller, or catalogue copies published at an earlier approval
  select count(*) into bad from unnest(coalesce(p.images, '{}')) img
  where not exists (select 1 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id and a.status in ('passed', 'review'));
  if bad > 0 then raise exception 'Every photo must pass the photo check before you submit'; end if;
  update products set listing_status = 'check_pending', submitted_at = now() where id = p.id;
  return jsonb_build_object('product_id', p.id, 'updated_at', (select updated_at from products where id = p.id));
end $$;
revoke all on function mp_begin_listing_check(uuid, uuid) from public, anon, authenticated;

-- Applies the listing verdict (server only): block -> rejected (never in the queue); review/pass -> staff queue;
-- error -> stays check pending. Only applies if the listing was not edited during the check.
create or replace function mp_record_listing_screening(p_product uuid, p_expect_updated timestamptz, p_runs jsonb, p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p products;
  r jsonb;
  final_run bigint;
  v text := p_outcome ->> 'verdict';
  new_status listing_status;
begin
  select * into p from products where id = p_product for update;
  if p.id is null then raise exception 'Listing not found'; end if;
  if v not in ('pass', 'review', 'block', 'error') then raise exception 'bad verdict %', v; end if;
  for r in select * from jsonb_array_elements(coalesce(p_runs, '[]')) loop
    insert into screening_runs (subject, product_id, seller_id, stage, model, prompt_version, verdict, confidence, scores, flags, rule_hits, reasons, raw, latency_ms)
    values ('listing', p.id, p.seller_id, r ->> 'stage', r ->> 'model', r ->> 'prompt_version', r ->> 'verdict', (r ->> 'confidence')::numeric,
            coalesce(r -> 'scores', '{}'), coalesce(array(select jsonb_array_elements_text(r -> 'flags')), '{}'),
            coalesce(r -> 'rule_hits', '[]'), coalesce(r -> 'reasons', '[]'), left(r ->> 'raw', 8000), (r ->> 'latency_ms')::int)
    returning id into final_run;
  end loop;
  if p_expect_updated is not null and p.updated_at is distinct from p_expect_updated then
    return jsonb_build_object('applied', false, 'reason', 'changed during the check');
  end if;
  if p.listing_status <> 'check_pending' then
    return jsonb_build_object('applied', false, 'reason', 'not waiting for a check');
  end if;
  new_status := case v when 'block' then 'rejected' when 'error' then 'check_pending' else 'pending_review' end;
  update products set
    listing_status = new_status,
    ai_checked_at = now(),
    reviewed_at = case when v = 'block' then now() else reviewed_at end
  where id = p.id;
  perform private.set_listing_review(p.id, jsonb_build_object('ai_check', p_outcome - 'strike' - 'policy_code' || jsonb_build_object('checked_at', now(), 'run_id', final_run))
    || case when v = 'block' then jsonb_build_object('review_note', left(coalesce(p_outcome ->> 'summary_en', 'Rejected by the automatic check'), 1000), 'reviewed_by', null) else '{}'::jsonb end);
  if v = 'block' and coalesce(p_outcome ->> 'strike', '') in ('hard', 'severe') then
    insert into seller_strikes (seller_id, kind, policy_code, product_id, run_id, note)
    values (p.seller_id, p_outcome ->> 'strike', p_outcome ->> 'policy_code', p.id, final_run, 'Listing screening');
  end if;
  return jsonb_build_object('applied', true, 'status', new_status);
end $$;
revoke all on function mp_record_listing_screening(uuid, timestamptz, jsonb, jsonb) from public, anon, authenticated;

-- Staff override of an automatic verdict, with a reason (audited through screening_runs and the audit log).
--   image: blocked/rejected -> passed (the file is restored by the review-screening function first), or the reverse
--   listing: rejected by the check -> staff queue; or anything -> rejected
-- Overturning a prohibited verdict voids the strike it caused.
create or replace function mp_override_screening(p_subject text, p_id uuid, p_outcome text, p_reason text, p_path text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a media_assets;
  p products;
begin
  if not private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if coalesce(trim(p_reason), '') = '' or char_length(trim(p_reason)) < 5 then raise exception 'Write the reason for the override'; end if;
  if p_subject = 'image' then
    if p_outcome not in ('passed', 'rejected', 'blocked') then raise exception 'Unknown outcome'; end if;
    select * into a from media_assets where id = p_id for update;
    if a.id is null then raise exception 'Not found'; end if;
    insert into screening_runs (subject, asset_id, seller_id, stage, verdict, reasons, actor)
    values ('image', a.id, a.seller_id, 'override', case p_outcome when 'passed' then 'pass' else 'block' end,
            jsonb_build_array(jsonb_build_object('code', 'staff_override', 'en', trim(p_reason), 'ar', trim(p_reason))), uid);
    update media_assets set status = p_outcome,
      path = case when p_outcome = 'rejected' then null when p_path is not null then p_path else path end,
      bucket = case when p_path is not null then 'seller-uploads' else bucket end,
      quarantined_at = case when p_outcome = 'passed' then null else quarantined_at end,
      reasons = case when p_outcome = 'passed' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('code', 'staff', 'en', trim(p_reason), 'ar', trim(p_reason))) end,
      delete_after = case when p_outcome = 'passed' then null else delete_after end
    where id = a.id;
    if p_outcome = 'passed' then
      update seller_strikes set voided_at = now(), voided_by = uid, void_reason = trim(p_reason) where asset_id = a.id and voided_at is null;
      delete from blocked_hashes where sha256 = a.sha256;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_subject = 'listing' then
    if p_outcome not in ('pending_review', 'rejected') then raise exception 'Unknown outcome'; end if;
    select * into p from products where id = p_id for update;
    if p.id is null or p.seller_id is null then raise exception 'Not found'; end if;
    insert into screening_runs (subject, product_id, seller_id, stage, verdict, reasons, actor)
    values ('listing', p.id, p.seller_id, 'override', case p_outcome when 'pending_review' then 'review' else 'block' end,
            jsonb_build_array(jsonb_build_object('code', 'staff_override', 'en', trim(p_reason), 'ar', trim(p_reason))), uid);
    update products set listing_status = p_outcome::listing_status, reviewed_at = now(),
      submitted_at = case when p_outcome = 'pending_review' then now() else submitted_at end
    where id = p.id;
    perform private.set_listing_review(p.id, jsonb_build_object('review_note', trim(p_reason), 'reviewed_by', uid,
      'ai_check', coalesce((select ai_check from listing_reviews where product_id = p.id), '{}'::jsonb)
                  || jsonb_build_object('override', jsonb_build_object('by', uid, 'at', now(), 'reason', trim(p_reason), 'outcome', p_outcome))));
    if p_outcome = 'pending_review' then
      update seller_strikes set voided_at = now(), voided_by = uid, void_reason = trim(p_reason) where product_id = p.id and voided_at is null;
    end if;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unknown subject';
end $$;
revoke all on function mp_override_screening(text, uuid, text, text, text) from public, anon;
grant execute on function mp_override_screening(text, uuid, text, text, text) to authenticated;

-- Staff: lift a strike (with a reason), or reinstate a seller suspended by strikes after review.
create or replace function mp_void_strike(p_strike uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Write the reason'; end if;
  update seller_strikes set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_strike and voided_at is null;
end $$;
revoke all on function mp_void_strike(uuid, text) from public, anon;
grant execute on function mp_void_strike(uuid, text) to authenticated;

-- What the screening function needs for a listing (server only): the listing, its category requirements, the
-- screened photos, documents and permits on file, the active rules and settings.
create or replace function mp_listing_check_context(p_product uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product;
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'product', to_jsonb(p),
    'seller', (select jsonb_build_object('id', s.id, 'name_en', s.name_en, 'country', s.country, 'kind', s.kind, 'status', s.status) from sellers s where s.id = p.seller_id),
    'requirements', case when p.category_id is null then null else mp_category_requirements(p.category_id) end,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('path', img, 'position', ord, 'asset', (
                 select jsonb_build_object('id', a.id, 'status', a.status, 'flags', a.flags, 'width', a.width, 'height', a.height, 'mime', a.mime, 'bucket', a.bucket, 'path', a.path)
                 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id)) order by ord), '[]'::jsonb)
               from unnest(coalesce(p.images, '{}')) with ordinality as x(img, ord)),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('permit_key', permit_key, 'status', status)), '[]'::jsonb) from product_permits where product_id = p.id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('doc_type', doc_type, 'status', status)), '[]'::jsonb) from product_documents where product_id = p.id and status <> 'rejected'),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name_en', name_en, 'name_ar', name_ar) order by sort), '[]'::jsonb)
                   from categories where kind = 'category' and listable and parent_id is not null),
    'rules', (select coalesce(jsonb_agg(to_jsonb(r) - 'updated_by' order by r.level, r.sort), '[]'::jsonb) from policy_rules r where r.active),
    'settings', (select to_jsonb(s) from mp_settings s where id = 1));
end $$;
revoke all on function mp_listing_check_context(uuid) from public, anon, authenticated;

-- Staff editing products directly through the API (current_user is then the API role, not a function owner) may
-- reject or suspend a seller's listing, but only the approval function (service role) puts one live or into the queue,
-- so photos are always published by it, and a blocked listing only comes back through an override with a reason.
create or replace function products_staff_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.seller_id is not null and current_user = 'authenticated' and private.is_staff()
     and new.listing_status is distinct from old.listing_status and new.listing_status in ('approved', 'pending_review', 'check_pending') then
    raise exception 'Approve listings from the listings queue (it publishes the photos); use an override to send a rejected listing to the queue';
  end if;
  return new;
end $$;
create trigger products_staff_guard before update on products for each row execute function products_staff_guard();

-- Model B shipping and the country rulebook.
--
-- Shipping (model B): sellers pack and ship their own parcels, but ONLY through carriers Al Mukarramah selects and
-- contracts (through shipping aggregators). The seller prints our label from the seller dashboard, the carrier picks
-- up from the seller's address, tracking flows back by webhook, and the PLATFORM sets the delivery price the customer
-- pays. A marketplace warehouse comes later: shipments.fulfilment already has a 'warehouse' value for it.
--
-- Rulebook: every order line is decided from (ship-from country, ship-to country, product compliance):
--   allowed or not; who invoices and under which regime; which VAT; duties shown as paid (DDP) or not; which approved
--   carrier services may carry it; which permits it needs. The decision is made on the server by
--   supabase/functions/_shared/rules.ts from the tables below; rates and permissions live here, never in code.
--
-- Corridors (from -> to) open in phases from the admin panel, each only after a tax adviser signs off:
--   Phase 1 (open):   SA sellers -> SA customers, and Al Mukarramah's own products worldwide (existing house shipping)
--   Phase 2 (closed): AE, KW, QA sellers domestically and into SA
--   Phase 3 (closed): India -> GCC
--
-- Nothing here moves money. Payout statements are views for reading; transfers are made by hand and recorded.

-- audit_trigger() expects an "id" column; these tables are keyed by a code or a composite key, named as the
-- trigger's arguments (e.g. audit_keyed('country', 'hs_prefix')).
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

-- ================================================================ countries
create table countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_en text not null,
  name_ar text not null,
  currency char(3) not null,
  vat_rate_bp int not null default 0 check (vat_rate_bp between 0 and 5000),   -- 1500 = 15.00%
  tax_name text not null default 'VAT' check (tax_name in ('VAT', 'GST', 'none')),
  our_tax_registration text,          -- Al Mukarramah's own VAT/GST number in this country (null: not registered)
  einvoicing text not null default 'none' check (einvoicing in ('zatca', 'planned', 'none')),
  import_duty_bp int not null default 500 check (import_duty_bp between 0 and 10000),   -- default customs duty
  de_minimis_sar int not null default 0 check (de_minimis_sar >= 0),   -- halalas: consignments below pay no duty
  customs_union text,                 -- 'GCC': goods of GCC origin move duty-free between members
  notes text,
  updated_at timestamptz not null default now()
);

insert into countries (code, name_en, name_ar, currency, vat_rate_bp, tax_name, einvoicing, import_duty_bp, de_minimis_sar, customs_union, notes) values
  ('SA', 'Saudi Arabia', 'المملكة العربية السعودية', 'SAR', 1500, 'VAT', 'zatca', 500, 100000, 'GCC',
   'Our VAT number is store_settings.vat_number. Duty de minimis SAR 1,000: confirm with the adviser.'),
  ('AE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'AED', 500, 'VAT', 'planned', 500, 100000, 'GCC',
   'Not VAT-registered in the UAE. De minimis about AED 1,000: confirm.'),
  ('KW', 'Kuwait', 'الكويت', 'KWD', 0, 'none', 'none', 500, 0, 'GCC', 'No VAT today. De minimis to confirm.'),
  ('QA', 'Qatar', 'قطر', 'QAR', 0, 'none', 'none', 500, 0, 'GCC', 'No VAT today. De minimis to confirm.'),
  ('OM', 'Oman', 'عُمان', 'OMR', 500, 'VAT', 'none', 500, 0, 'GCC', 'De minimis to confirm.'),
  ('BH', 'Bahrain', 'البحرين', 'BHD', 1000, 'VAT', 'none', 500, 0, 'GCC', 'De minimis to confirm.'),
  ('IN', 'India', 'الهند', 'INR', 0, 'GST', 'none', 0, 0, null,
   'Ship-from only for now. Exports from India are zero-rated for GST (under a LUT); GST rates are product-specific.');

-- Customs duty by HS code prefix, where it differs from the country default (longest prefix wins).
create table duty_rates (
  country char(2) not null references countries on delete cascade,
  hs_prefix text not null check (hs_prefix ~ '^[0-9]{2,10}$'),
  duty_bp int not null check (duty_bp between 0 and 10000),
  notes text,
  primary key (country, hs_prefix)
);

-- ================================================================ corridors
create table corridors (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('house', 'marketplace')),   -- house: Al Mukarramah's own products
  from_country char(2) not null references countries,
  to_country text not null check (to_country = '*' or to_country ~ '^[A-Z]{2}$'),   -- '*': any other country
  phase int not null default 1 check (phase between 1 and 9),
  status text not null default 'closed' check (status in ('closed', 'pilot', 'open')),
  -- who issues the customer's invoice: the platform as deemed supplier (ZATCA e-invoice), or the seller
  invoicer text not null check (invoicer in ('platform', 'seller')),
  -- which VAT goes on that invoice: the ship-from country's, the ship-to country's, or none (zero-rated)
  vat_mode text not null check (vat_mode in ('origin', 'destination', 'zero')),
  -- duties and import taxes: none (domestic), ddp (quoted and collected at checkout), dap (paid by the customer on delivery)
  duties_mode text not null default 'none' check (duties_mode in ('none', 'ddp', 'dap')),
  pilot_seller_ids uuid[] not null default '{}',    -- while 'pilot': only these sellers
  adviser_name text,
  adviser_signed_off_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  unique (scope, from_country, to_country),
  check (scope = 'marketplace' or invoicer = 'platform')
);

-- A corridor opens (pilot or open) only with a tax adviser's sign-off on record, and its tax terms cannot change
-- while it is open without a new sign-off. The phase 1 rows below are seeded open (the business already trades on
-- them); record the adviser's sign-off for them from the admin panel.
create or replace function corridors_guard() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    if new.status <> 'closed' and new.adviser_signed_off_at is null and auth.role() is not null then
      raise exception 'A corridor can only open after a tax adviser signs off: record the adviser and the date first';
    end if;
    return new;
  end if;
  if new.status <> 'closed' and new.status is distinct from old.status and new.adviser_signed_off_at is null then
    raise exception 'A corridor can only open after a tax adviser signs off: record the adviser and the date first';
  end if;
  if new.status <> 'closed'
     and (new.invoicer, new.vat_mode, new.duties_mode) is distinct from (old.invoicer, old.vat_mode, old.duties_mode)
     and new.adviser_signed_off_at is not distinct from old.adviser_signed_off_at then
    raise exception 'Changing who invoices, the VAT or the duties of an open corridor needs a new adviser sign-off';
  end if;
  return new;
end $$;
create trigger corridors_guard before insert or update on corridors for each row execute function corridors_guard();

insert into corridors (scope, from_country, to_country, phase, status, invoicer, vat_mode, duties_mode, notes) values
  -- Phase 1: open now
  ('house', 'SA', 'SA', 1, 'open', 'platform', 'origin', 'none', 'Our own products in Saudi Arabia (existing).'),
  ('house', 'SA', '*', 1, 'open', 'platform', 'origin', 'dap',
   'Our own products worldwide (existing house shipping). VAT as today (store_settings.zero_rate_exports); duties paid by the customer on delivery until a landed-cost provider is live.'),
  ('marketplace', 'SA', 'SA', 1, 'open', 'platform', 'origin', 'none',
   'Saudi sellers to Saudi customers. Al Mukarramah issues the ZATCA invoice; commission per line.'),
  -- Phase 2: closed until the adviser signs off
  ('marketplace', 'AE', 'AE', 2, 'closed', 'seller', 'destination', 'none', 'UAE sellers in the UAE: the seller invoices under UAE VAT.'),
  ('marketplace', 'KW', 'KW', 2, 'closed', 'seller', 'zero', 'none', 'Kuwaiti sellers in Kuwait (no VAT).'),
  ('marketplace', 'QA', 'QA', 2, 'closed', 'seller', 'zero', 'none', 'Qatari sellers in Qatar (no VAT).'),
  ('marketplace', 'AE', 'SA', 2, 'closed', 'platform', 'destination', 'ddp', 'UAE sellers into Saudi Arabia: platform as deemed supplier, Saudi VAT, duties paid.'),
  ('marketplace', 'KW', 'SA', 2, 'closed', 'platform', 'destination', 'ddp', 'Kuwaiti sellers into Saudi Arabia.'),
  ('marketplace', 'QA', 'SA', 2, 'closed', 'platform', 'destination', 'ddp', 'Qatari sellers into Saudi Arabia.'),
  -- Phase 3: closed
  ('marketplace', 'IN', 'SA', 3, 'closed', 'platform', 'destination', 'ddp', 'Indian sellers into Saudi Arabia (IEC and GSTIN required).'),
  ('marketplace', 'IN', 'AE', 3, 'closed', 'seller', 'zero', 'ddp', 'Indian sellers into the UAE: export invoice by the seller; import VAT and duty collected at checkout.'),
  ('marketplace', 'IN', 'KW', 3, 'closed', 'seller', 'zero', 'ddp', null),
  ('marketplace', 'IN', 'QA', 3, 'closed', 'seller', 'zero', 'ddp', null),
  ('marketplace', 'IN', 'OM', 3, 'closed', 'seller', 'zero', 'ddp', null),
  ('marketplace', 'IN', 'BH', 3, 'closed', 'seller', 'zero', 'ddp', null);

-- Public, non-sensitive view of which corridors trade (the sell page and seller dashboard show it).
create or replace function open_corridors() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('scope', scope, 'from', from_country, 'to', to_country, 'phase', phase, 'status', status)
                            order by phase, from_country, to_country), '[]'::jsonb)
  from corridors where status <> 'closed';
$$;
grant execute on function open_corridors() to anon, authenticated;

-- ================================================================ permits
-- A product shipped to `to_country` needs `permit_key` when its HS code starts with one of hs_prefixes, its ship class
-- is one of ship_classes, or it is listed in one of category_slugs. Sellers enter the reference in products.permits;
-- staff check it in the compliance queue before the product can be bought there.
create table permit_rules (
  id uuid primary key default gen_random_uuid(),
  to_country char(2) not null references countries,
  permit_key text not null check (permit_key ~ '^[a-z0-9_]{2,40}$'),
  label_en text not null,
  label_ar text not null,
  hs_prefixes text[] not null default '{}',
  ship_classes text[] not null default '{}',
  category_slugs text[] not null default '{}',
  imports_only boolean not null default false,       -- only when the parcel comes from another country
  applies_to_house boolean not null default false,   -- our own products are checked by our team instead
  active boolean not null default true,
  notes text
);
insert into permit_rules (to_country, permit_key, label_en, label_ar, hs_prefixes, ship_classes, category_slugs, notes) values
  ('SA', 'sfda_ecosma', 'SFDA eCosma listing (perfume and cosmetics)', 'إدراج في نظام eCosma لدى هيئة الغذاء والدواء (العطور ومستحضرات التجميل)',
   '{3303,3304,3305,3307}', '{perfume_spray,perfume_oil}', '{perfumes,oud-oils}', 'Perfume, oud oil and cosmetics sold into Saudi Arabia.'),
  ('SA', 'sfda_food', 'SFDA food registration', 'تسجيل الغذاء لدى هيئة الغذاء والدواء',
   '{0804,0409,1704,1806,2101}', '{}', '{dates}', 'Dates, honey and packaged food sold into Saudi Arabia.');

-- ================================================================ seller KYC (by country)
alter table seller_private
  add column legal_entity_type text,
  add column export_code text,                      -- India: Importer-Exporter Code (IEC)
  add column iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  add column bank_name text,
  add column account_holder text,
  add column kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'submitted', 'approved', 'rejected', 'expired')),
  add column kyc_note text,
  add column kyc_reviewed_at timestamptz,
  add column kyc_reviewed_by uuid references auth.users;

-- Documents each country requires before a seller from there can sell.
create table kyc_requirements (
  country char(2) not null references countries,
  doc_type text not null check (doc_type ~ '^[a-z_]{2,40}$'),
  label_en text not null,
  label_ar text not null,
  sort int not null default 0,
  primary key (country, doc_type)
);
insert into kyc_requirements (country, doc_type, label_en, label_ar, sort) values
  ('SA', 'commercial_registration', 'Commercial registration (CR)', 'السجل التجاري', 1),
  ('SA', 'vat_certificate', 'VAT registration certificate', 'شهادة التسجيل في ضريبة القيمة المضافة', 2),
  ('AE', 'trade_licence', 'Trade licence', 'الرخصة التجارية', 1),
  ('AE', 'trn_certificate', 'Tax registration number (TRN) certificate', 'شهادة رقم التسجيل الضريبي', 2),
  ('KW', 'commercial_licence', 'Commercial licence', 'الرخصة التجارية', 1),
  ('QA', 'commercial_licence', 'Commercial licence', 'الرخصة التجارية', 1),
  ('IN', 'gstin_certificate', 'GST registration (GSTIN)', 'شهادة التسجيل في ضريبة السلع والخدمات (GSTIN)', 1),
  ('IN', 'iec_certificate', 'Importer-Exporter Code (IEC)', 'رمز المستورد والمصدّر (IEC)', 2);

create table seller_documents (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers on delete cascade,
  doc_type text not null check (doc_type ~ '^[a-z_]{2,40}$'),
  path text not null unique,                  -- seller-kyc bucket: <seller id>/<file>
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  note text,
  expires_on date,
  uploaded_by uuid default auth.uid() references auth.users,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz
);
create index seller_documents_seller on seller_documents (seller_id);
alter table seller_documents enable row level security;
alter table kyc_requirements enable row level security;
create policy "read kyc requirements" on kyc_requirements for select using (true);
create policy "staff edit kyc requirements" on kyc_requirements for all using (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "members and staff read documents" on seller_documents for select
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'finance']::staff_role[]));
create policy "members add documents" on seller_documents for insert
  with check (private.is_seller_member(seller_id) and path like seller_id::text || '/%');
create policy "members remove unreviewed documents" on seller_documents for delete
  using (private.is_seller_member(seller_id) and status <> 'accepted');
create policy "staff review documents" on seller_documents for update
  using (private.is_staff(array['owner', 'manager']::staff_role[]));

create or replace function seller_documents_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if private.is_staff() or coalesce(auth.role(), '') <> 'authenticated' then
    if new.status is distinct from old.status then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
    return new;
  end if;
  new.status := 'pending';
  new.note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end $$;
create trigger seller_documents_guard before insert or update on seller_documents for each row execute function seller_documents_guard();
create trigger audit_seller_documents after insert or update or delete on seller_documents for each row execute function audit_trigger();

-- Sellers set their own legal and bank details but never their KYC decision; once approved, changing a legal or
-- bank detail sends the account back for review.
create or replace function seller_private_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if private.is_staff() or coalesce(auth.role(), '') <> 'authenticated' then
    if new.kyc_status is distinct from old.kyc_status and new.kyc_status in ('approved', 'rejected') then
      new.kyc_reviewed_at := now();
      new.kyc_reviewed_by := auth.uid();
    end if;
    return new;
  end if;
  new.internal_notes := old.internal_notes;
  new.kyc_note := old.kyc_note;
  new.kyc_reviewed_at := old.kyc_reviewed_at;
  new.kyc_reviewed_by := old.kyc_reviewed_by;
  -- the only change a seller may make to the status: send it for review
  if new.kyc_status is distinct from old.kyc_status
     and not (new.kyc_status = 'submitted' and old.kyc_status in ('not_started', 'rejected', 'expired')) then
    new.kyc_status := old.kyc_status;
  end if;
  if old.kyc_status = 'approved'
     and (new.legal_name, new.legal_entity_type, new.registration_no, new.tax_registration_no, new.export_code, new.iban, new.account_holder)
         is distinct from (old.legal_name, old.legal_entity_type, old.registration_no, old.tax_registration_no, old.export_code, old.iban, old.account_holder) then
    new.kyc_status := 'submitted';
  end if;
  return new;
end $$;
create trigger audit_seller_private after insert or update or delete on seller_private for each row execute function audit_keyed('seller_id');

-- seller-kyc: PRIVATE documents bucket (PDF or photos, 10 MB). Sellers write only in their own folder; an accepted
-- document cannot be deleted by the seller.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-kyc', 'seller-kyc', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "sellers and staff read kyc files" on storage.objects for select to authenticated
  using (bucket_id = 'seller-kyc' and (private.member_of_folder((storage.foldername(name))[1]) or private.is_staff(array['owner', 'manager', 'finance']::staff_role[])));
create policy "sellers upload kyc files" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-kyc' and private.member_of_folder((storage.foldername(name))[1]));
create policy "sellers delete unreviewed kyc files" on storage.objects for delete to authenticated
  using (bucket_id = 'seller-kyc' and private.member_of_folder((storage.foldername(name))[1])
         and not exists (select 1 from public.seller_documents d where d.path = name and d.status = 'accepted'));

-- ================================================================ product compliance
alter table products
  add column hs_code text check (hs_code is null or hs_code ~ '^[0-9]{6,12}$'),
  add column origin_country char(2) check (origin_country is null or origin_country ~ '^[A-Z]{2}$'),
  add column dangerous_goods boolean not null default false,   -- e.g. alcohol-based perfume (UN1266, flammable)
  add column length_mm int check (length_mm is null or length_mm between 1 and 3000),   -- one unit, packed
  add column width_mm int check (width_mm is null or width_mm between 1 and 3000),
  add column height_mm int check (height_mm is null or height_mm between 1 and 3000),
  add column permits jsonb not null default '{}' check (jsonb_typeof(permits) = 'object'),   -- {"sfda_ecosma": "ECM-..."}
  add column allowed_destinations text[],   -- null: wherever the rulebook allows; otherwise only these countries
  add column compliance_status text not null default 'unreviewed'
    check (compliance_status in ('unreviewed', 'pending', 'cleared', 'rejected')),
  add column compliance_note text,
  add column compliance_reviewed_at timestamptz,
  add column compliance_reviewed_by uuid references auth.users;
comment on column products.restricted_countries is 'Blocked destinations (ISO codes). The rulebook never sells there.';
create index products_compliance_queue on products (compliance_status) where compliance_status = 'pending';

-- Alcohol-based sprays are always dangerous goods, whoever edits the product.
update products set dangerous_goods = true where ship_class = 'perfume_spray';
create or replace function products_dg_sync() returns trigger language plpgsql set search_path = public as $$
begin
  if new.ship_class = 'perfume_spray' then new.dangerous_goods := true; end if;
  return new;
end $$;
create trigger products_dg_sync before insert or update on products for each row execute function products_dg_sync();

-- The seller guard from 0009, extended: compliance details (HS code, origin, dangerous goods, parcel size, permits,
-- destinations) do not send a listing back for content approval, but any change to them puts the product in the
-- staff compliance queue, and only staff record the compliance decision.
create or replace function products_seller_guard() returns trigger language plpgsql set search_path = public as $$
declare
  content_changed boolean;
  compliance_changed boolean;
  img text;
  staff_keys text[] := array['stock', 'is_active', 'updated_at', 'listing_status', 'submitted_at', 'ai_check', 'ai_checked_at', 'review_note', 'reviewed_at', 'reviewed_by',
                              'compliance_status', 'compliance_note', 'compliance_reviewed_at', 'compliance_reviewed_by'];
  compliance_keys text[] := array['hs_code', 'origin_country', 'dangerous_goods', 'length_mm', 'width_mm', 'height_mm', 'permits', 'allowed_destinations', 'restricted_countries'];
begin
  if private.is_staff() or coalesce(auth.role(), '') <> 'authenticated' then
    if tg_op = 'UPDATE' and new.compliance_status is distinct from old.compliance_status and new.compliance_status in ('cleared', 'rejected') then
      new.compliance_reviewed_at := now();
      new.compliance_reviewed_by := auth.uid();
    end if;
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
  new.compliance_note := case when tg_op = 'INSERT' then null else old.compliance_note end;
  new.compliance_reviewed_at := case when tg_op = 'INSERT' then null else old.compliance_reviewed_at end;
  new.compliance_reviewed_by := case when tg_op = 'INSERT' then null else old.compliance_reviewed_by end;

  if tg_op = 'INSERT' then
    new.listing_status := 'draft';
    new.ai_check := null;
    new.ai_checked_at := null;
    new.submitted_at := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_note := null;
    new.is_featured := false;
    new.compliance_status := 'pending';
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

  compliance_changed := (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(compliance_keys) k)
                        is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(compliance_keys) k);
  new.compliance_status := case when compliance_changed then 'pending' else old.compliance_status end;

  content_changed := (to_jsonb(new) - staff_keys - compliance_keys) is distinct from (to_jsonb(old) - staff_keys - compliance_keys);
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

-- ================================================================ seller pickup addresses and parcel defaults
alter table sellers add column parcel_defaults jsonb not null
  default '{"length_mm": 300, "width_mm": 220, "height_mm": 120, "packaging_g": 150}'
  check (jsonb_typeof(parcel_defaults) = 'object'
         and coalesce((parcel_defaults ->> 'length_mm')::int, 0) between 10 and 2000
         and coalesce((parcel_defaults ->> 'width_mm')::int, 0) between 10 and 2000
         and coalesce((parcel_defaults ->> 'height_mm')::int, 0) between 10 and 2000
         and coalesce((parcel_defaults ->> 'packaging_g')::int, 0) between 0 and 5000);

create table seller_locations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers on delete cascade,
  label text not null default 'Main' check (char_length(label) between 1 and 40),
  contact_name text not null,
  phone text not null,
  country char(2) not null,           -- always the seller's own (KYC) country: the ship-from country
  city text not null,
  district text,
  line1 text not null,
  line2 text,
  postal_code text,
  short_address text,                 -- Saudi National Address short code, e.g. RRRD2929
  pickup_from time not null default '10:00',
  pickup_to time not null default '18:00',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup_to > pickup_from)
);
create index seller_locations_seller on seller_locations (seller_id);
create unique index seller_locations_one_default on seller_locations (seller_id) where is_default and active;
alter table seller_locations enable row level security;
create policy "members and staff read locations" on seller_locations for select
  using (private.is_seller_member(seller_id) or private.is_staff());
create policy "members manage locations" on seller_locations for all
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'operations']::staff_role[]))
  with check (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'operations']::staff_role[]));

create or replace function seller_locations_guard() returns trigger language plpgsql set search_path = public as $$
declare home char(2);
begin
  select country into home from sellers where id = new.seller_id;
  if new.country is distinct from home then
    raise exception 'Pickup addresses must be in your registered country (%)', home;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger seller_locations_guard before insert or update on seller_locations for each row execute function seller_locations_guard();
create trigger audit_seller_locations after insert or update or delete on seller_locations for each row execute function audit_trigger();

-- ================================================================ approved carriers (through aggregators)
-- Providers are the aggregator platforms we integrate with (API keys are Supabase secrets set by Afzal; only their
-- NAMES are stored here). Services are the carrier services we have approved per region.
create table carrier_providers (
  id text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  name text not null,
  kind text not null default 'aggregator' check (kind in ('aggregator', 'duties', 'both')),
  regions text not null,
  mode text not null default 'sandbox' check (mode in ('sandbox', 'test', 'live')),
  active boolean not null default false,
  secret_names text[] not null default '{}',
  supports jsonb not null default '{}',   -- {"quote", "label", "pickup", "track", "cancel", "landed_cost", "webhook"}: true/false
  notes text,
  updated_at timestamptz not null default now()
);
insert into carrier_providers (id, name, kind, regions, mode, active, secret_names, supports, notes) values
  ('sandbox', 'Sandbox (no real parcels)', 'both', 'Everywhere', 'sandbox', true, '{CARRIER_SANDBOX_SECRET}',
   '{"quote": true, "label": true, "pickup": true, "track": true, "cancel": true, "landed_cost": true, "webhook": true}',
   'Deterministic rates from carrier_rate_cards, a sample PDF label and simulated tracking, so the whole flow works before any real account exists.');

create table carrier_services (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references carrier_providers,
  code text not null,                       -- the provider's courier/service code
  carrier_name text not null,
  service_name text not null,
  service_name_ar text,
  from_countries text[] not null,           -- ISO codes; '*' = any
  to_countries text[] not null,
  domestic_only boolean not null default false,   -- only when from and to are the same country
  dangerous_goods boolean not null default false, -- accepts alcohol-based perfume and other DG
  cash_on_delivery boolean not null default false,
  pickup boolean not null default true,
  ddp boolean not null default false,       -- can deliver duties-paid across borders
  days_min int not null check (days_min >= 0),
  days_max int not null check (days_max >= days_min),
  active boolean not null default true,
  sort int not null default 0,
  unique (provider_id, code)
);
insert into carrier_services (provider_id, code, carrier_name, service_name, service_name_ar, from_countries, to_countries, domestic_only, dangerous_goods, cash_on_delivery, ddp, days_min, days_max, sort) values
  ('sandbox', 'sbx-sa-road', 'Sandbox road courier', 'Saudi domestic (road)', 'شحن محلي بري داخل المملكة', '{SA}', '{SA}', true, true, true, false, 1, 3, 1),
  ('sandbox', 'sbx-gcc-local', 'Sandbox local courier', 'Domestic (road)', 'شحن محلي بري', '{AE,KW,QA,OM,BH}', '{AE,KW,QA,OM,BH}', true, true, true, false, 1, 2, 2),
  ('sandbox', 'sbx-gcc-express', 'Sandbox express', 'GCC express, duties paid', 'شحن سريع خليجي، الرسوم مدفوعة', '{SA,AE,KW,QA,OM,BH}', '{SA,AE,KW,QA,OM,BH}', false, false, false, true, 2, 5, 3),
  ('sandbox', 'sbx-in-gcc', 'Sandbox international', 'India to GCC, duties paid', 'من الهند إلى الخليج، الرسوم مدفوعة', '{IN}', '{SA,AE,KW,QA,OM,BH}', false, false, false, true, 4, 8, 4);

-- What the carrier charges US (sandbox rates; real providers return live rates). Never shown to customers.
create table carrier_rate_cards (
  service_id uuid not null references carrier_services on delete cascade,
  from_country text not null check (from_country = '*' or from_country ~ '^[A-Z]{2}$'),
  to_country text not null check (to_country = '*' or to_country ~ '^[A-Z]{2}$'),
  first_kg_sar int not null check (first_kg_sar >= 0),    -- halalas
  extra_kg_sar int not null check (extra_kg_sar >= 0),
  primary key (service_id, from_country, to_country)
);
insert into carrier_rate_cards (service_id, from_country, to_country, first_kg_sar, extra_kg_sar)
select id, '*', '*', v.first, v.extra from carrier_services s
join (values ('sbx-sa-road', 1800, 300), ('sbx-gcc-local', 1500, 300), ('sbx-gcc-express', 4800, 1300), ('sbx-in-gcc', 6500, 2200)) as v(code, first, extra)
  on v.code = s.code where s.provider_id = 'sandbox';

-- What the CUSTOMER pays for delivery, set by the platform per corridor (most specific row wins:
-- exact from/to and service, then exact from/to, then wildcards). Sellers never set shipping prices.
create table delivery_prices (
  id uuid primary key default gen_random_uuid(),
  from_country text not null check (from_country = '*' or from_country ~ '^[A-Z]{2}$'),
  to_country text not null check (to_country = '*' or to_country ~ '^[A-Z]{2}$'),
  service_id uuid references carrier_services on delete cascade,   -- null: any approved service
  first_kg_sar int not null check (first_kg_sar >= 0),    -- halalas, VAT inclusive
  extra_kg_sar int not null check (extra_kg_sar >= 0),
  free_over_sar int check (free_over_sar >= 0),           -- free delivery when the seller's items reach this
  active boolean not null default true,
  notes text
);
insert into delivery_prices (from_country, to_country, first_kg_sar, extra_kg_sar, notes) values
  ('SA', 'SA', 3000, 500, 'Same as the existing Saudi Arabia zone.'),
  ('*', '*', 6500, 1500, 'Across the GCC: same as the existing GCC zone.'),
  ('IN', '*', 9500, 2500, 'India to the GCC (phase 3).');

alter table carrier_providers enable row level security;
alter table carrier_services enable row level security;
alter table carrier_rate_cards enable row level security;
alter table delivery_prices enable row level security;
alter table countries enable row level security;
alter table duty_rates enable row level security;
alter table corridors enable row level security;
alter table permit_rules enable row level security;

create policy "read countries" on countries for select using (true);
create policy "read permit rules" on permit_rules for select using (true);
create policy "staff read rulebook" on corridors for select using (private.is_staff());
create policy "staff read duty rates" on duty_rates for select using (private.is_staff());
create policy "staff read providers" on carrier_providers for select using (private.is_staff());
create policy "staff read services" on carrier_services for select using (private.is_staff());
create policy "staff read rate cards" on carrier_rate_cards for select using (private.is_staff());
create policy "staff read delivery prices" on delivery_prices for select using (private.is_staff());
-- Only owner/manager change the rulebook; operations also manage carriers and delivery prices. Every change is audited.
create policy "owner and manager edit countries" on countries for all using (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "owner and manager edit duty rates" on duty_rates for all using (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "owner and manager edit corridors" on corridors for all using (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "owner and manager edit permit rules" on permit_rules for all using (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "ops edit providers" on carrier_providers for all using (private.is_staff(array['owner', 'manager', 'operations']::staff_role[]));
create policy "ops edit services" on carrier_services for all using (private.is_staff(array['owner', 'manager', 'operations']::staff_role[]));
create policy "ops edit rate cards" on carrier_rate_cards for all using (private.is_staff(array['owner', 'manager', 'operations']::staff_role[]));
create policy "owner and manager edit delivery prices" on delivery_prices for all using (private.is_staff(array['owner', 'manager']::staff_role[]));

create trigger audit_countries after insert or update or delete on countries for each row execute function audit_keyed('code');
create trigger audit_duty_rates after insert or update or delete on duty_rates for each row execute function audit_keyed('country', 'hs_prefix');
create trigger audit_corridors after insert or update or delete on corridors for each row execute function audit_trigger();
create trigger audit_permit_rules after insert or update or delete on permit_rules for each row execute function audit_trigger();
create trigger audit_carrier_providers after insert or update or delete on carrier_providers for each row execute function audit_trigger();
create trigger audit_carrier_services after insert or update or delete on carrier_services for each row execute function audit_trigger();
create trigger audit_rate_cards after insert or update or delete on carrier_rate_cards for each row execute function audit_keyed('service_id', 'from_country', 'to_country');
create trigger audit_delivery_prices after insert or update or delete on delivery_prices for each row execute function audit_trigger();
create trigger audit_kyc_requirements after insert or update or delete on kyc_requirements for each row execute function audit_keyed('country', 'doc_type');

-- ================================================================ orders and shipments
alter table orders
  add column duties_minor int not null default 0 check (duties_minor >= 0),   -- DDP duties and import taxes collected
  add column duties jsonb;                                                    -- breakdown per shipment

-- One shipment per seller per order (and one for anything Al Mukarramah ships itself).
create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  seller_id uuid references sellers,                -- null: Al Mukarramah's own products (house)
  fulfilment text not null default 'seller' check (fulfilment in ('seller', 'house', 'warehouse')),   -- 'warehouse': later phase
  status text not null default 'pending' check (status in ('pending', 'label_created', 'pickup_booked', 'picked_up', 'in_transit',
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled')),
  ship_from_country char(2) not null,
  ship_to_country char(2) not null,
  location_id uuid references seller_locations,
  ship_from jsonb,                                  -- pickup address snapshot at label time
  provider_id text references carrier_providers,
  service_id uuid references carrier_services,
  zone_id uuid references shipping_zones,           -- house shipments: the delivery zone chosen at checkout
  carrier_name text,
  service_name text,
  price_minor int not null default 0 check (price_minor >= 0),     -- delivery charged to the customer (order currency)
  duties_minor int not null default 0 check (duties_minor >= 0),   -- duties and import taxes collected (DDP)
  duties_mode text not null default 'none' check (duties_mode in ('none', 'ddp', 'dap')),
  dangerous_goods boolean not null default false,
  parcels jsonb not null default '[]',
  provider_shipment_id text,
  tracking_number text,
  tracking_url text,
  label_path text,                                  -- shipping-labels bucket: <seller id or 'house'>/<shipment id>.pdf
  pickup_ref text,
  pickup_date date,
  label_created_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shipments_one_per_seller on shipments (order_id, coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index shipments_seller on shipments (seller_id, created_at desc);
create index shipments_tracking on shipments (tracking_number) where tracking_number is not null;
create index shipments_provider_ref on shipments (provider_id, provider_shipment_id) where provider_shipment_id is not null;

-- What the carrier charged us for a shipment: staff only (it is our margin).
create table shipment_costs (
  shipment_id uuid primary key references shipments on delete cascade,
  cost_minor int not null,
  currency char(3) not null default 'SAR',
  quote jsonb,
  created_at timestamptz not null default now()
);

create table shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references shipments on delete cascade,
  at timestamptz not null default now(),
  status text not null,
  code text,
  description text,
  location text,
  source text not null check (source in ('provider', 'sandbox', 'seller', 'staff', 'system')),
  raw jsonb
);
create index shipment_events_shipment on shipment_events (shipment_id, at);

alter table order_items
  add column shipment_id uuid references shipments,
  add column invoicer text check (invoicer in ('platform', 'seller')),
  add column vat_rate_bp int,
  add column rule jsonb;                          -- the rulebook decision for this line, kept with the order

-- Customers read their own order lines (row-level security is unchanged), but never our commission or the rulebook
-- working: those columns are left out of what the API can select. Staff see them through the statement functions.
revoke select on order_items from anon, authenticated;
grant select (id, order_id, product_id, name_en, name_ar, unit_price_minor, quantity, line_total_minor, custom, seller_id, shipment_id, invoicer, vat_rate_bp)
  on order_items to anon, authenticated;

alter table shipments enable row level security;
alter table shipment_costs enable row level security;
alter table shipment_events enable row level security;
create policy "customer, seller and staff read shipments" on shipments for select using (
  private.is_staff() or private.is_seller_member(seller_id)
  or exists (select 1 from orders o where o.id = shipments.order_id and o.user_id = auth.uid())
);
create policy "staff edit shipments" on shipments for update using (private.is_staff(array['owner', 'manager', 'operations', 'support']::staff_role[]));
create policy "staff read costs" on shipment_costs for select using (private.is_staff(array['owner', 'manager', 'operations', 'finance']::staff_role[]));
create policy "read events of visible shipments" on shipment_events for select using (
  exists (select 1 from shipments s where s.id = shipment_events.shipment_id
          and (private.is_staff() or private.is_seller_member(s.seller_id)
               or exists (select 1 from orders o where o.id = s.order_id and o.user_id = auth.uid())))
);
-- Shipments and events are written by server functions (create-payment, create-shipment, carrier-webhook).
create trigger audit_shipments after insert or update or delete on shipments for each row execute function audit_trigger();

-- shipping-labels: PRIVATE. Written only by the server; sellers read their own folder, staff read everything.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shipping-labels', 'shipping-labels', false, 5242880, array['application/pdf', 'image/png', 'application/zpl'])
on conflict (id) do nothing;
create policy "sellers and staff read labels" on storage.objects for select to authenticated
  using (bucket_id = 'shipping-labels' and (private.member_of_folder((storage.foldername(name))[1]) or private.is_staff()));

-- A seller sees only their part of paid orders: the delivery details they need, their lines and their shipment.
create or replace function seller_orders(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (private.is_seller_member(p_seller) or private.is_staff()) then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'paid_at' desc nulls last) from (
      select jsonb_build_object(
        'shipment_id', s.id, 'status', s.status, 'carrier_name', s.carrier_name, 'service_name', s.service_name,
        'tracking_number', s.tracking_number, 'tracking_url', s.tracking_url, 'label_path', s.label_path,
        'pickup_ref', s.pickup_ref, 'pickup_date', s.pickup_date, 'dangerous_goods', s.dangerous_goods,
        'ship_to_country', s.ship_to_country, 'duties_mode', s.duties_mode, 'parcels', s.parcels,
        'order_number', o.number, 'created_at', o.created_at, 'paid_at', o.paid_at, 'currency', o.currency,
        'ship_to', o.ship_to - 'email', 'gift_message', o.gift_message,
        'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'description', e.description, 'location', e.location) order by e.at desc), '[]'::jsonb)
                   from shipment_events e where e.shipment_id = s.id),
        'items', (select jsonb_agg(jsonb_build_object('name_en', i.name_en, 'name_ar', i.name_ar, 'quantity', i.quantity,
                    'unit_price_minor', i.unit_price_minor, 'line_total_minor', i.line_total_minor, 'commission_minor', i.commission_minor, 'custom', i.custom))
                  from order_items i where i.order_id = o.id and i.seller_id = p_seller)
      ) as x
      from shipments s join orders o on o.id = s.order_id
      where s.seller_id = p_seller and o.status not in ('pending_payment', 'cancelled')
    ) t
  ), '[]'::jsonb);
end $$;
revoke all on function seller_orders(uuid) from public, anon;
grant execute on function seller_orders(uuid) to authenticated;

-- ================================================================ payout statements (read-only; no automated transfers)
-- One row per seller order line from paid orders. Refunded orders count in gross and again as a refund.
create view statement_lines with (security_invoker = true) as
  select i.id as order_item_id, i.seller_id, s.name_en as seller_name,
         date_trunc('month', o.paid_at at time zone 'Asia/Riyadh')::date as month,
         o.id as order_id, o.number as order_number, o.paid_at, o.status as order_status, o.currency,
         i.name_en, i.quantity, i.line_total_minor,
         coalesce(i.commission_minor, 0) as commission_minor,
         case when o.status = 'refunded' then i.line_total_minor else 0 end as refund_minor,
         case when o.status = 'refunded' then 0 else i.line_total_minor - coalesce(i.commission_minor, 0) end as net_minor
  from order_items i
  join orders o on o.id = i.order_id
  join sellers s on s.id = i.seller_id
  where i.seller_id is not null and o.paid_at is not null and o.status not in ('pending_payment', 'cancelled');

-- Payouts are made by hand (bank transfer) and recorded here by finance, so statements show what was paid.
create table payout_records (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers,
  month date not null check (extract(day from month) = 1),
  currency char(3) not null,
  amount_minor int not null check (amount_minor > 0),
  paid_on date not null,
  reference text not null,
  recorded_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
alter table payout_records enable row level security;
create policy "finance reads payouts" on payout_records for select using (private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) or private.is_seller_member(seller_id));
create policy "finance records payouts" on payout_records for insert with check (private.is_staff(array['owner', 'finance']::staff_role[]));
create trigger audit_payout_records after insert or update or delete on payout_records for each row execute function audit_trigger();

create view monthly_statements with (security_invoker = true) as
  select l.seller_id, l.seller_name, l.month, l.currency,
         count(distinct l.order_id) as orders,
         sum(l.line_total_minor) as gross_minor,
         sum(case when l.order_status = 'refunded' then 0 else l.commission_minor end) as commission_minor,
         sum(l.refund_minor) as refunds_minor,
         sum(l.net_minor) as net_minor,
         coalesce((select sum(p.amount_minor) from payout_records p where p.seller_id = l.seller_id and p.month = l.month and p.currency = l.currency), 0) as paid_minor
  from statement_lines l
  group by l.seller_id, l.seller_name, l.month, l.currency;

-- The views hold commission, so the API cannot read them directly; sellers and staff use the functions below.
revoke all on statement_lines, monthly_statements from anon, authenticated;

-- Staff: every seller's statement for a month (or every month when p_month is null).
create or replace function admin_statements(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.month desc, m.seller_name)
                   from monthly_statements m where p_month is null or m.month = p_month), '[]'::jsonb);
end $$;
revoke all on function admin_statements(date) from public, anon;
grant execute on function admin_statements(date) to authenticated;

-- A seller's statement for one month (or the list of months with sales when p_month is null).
create or replace function seller_statement(p_seller uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (private.is_seller_member(p_seller) or private.is_staff()) then raise exception 'Not allowed'; end if;
  if p_month is null then
    return coalesce((select jsonb_agg(to_jsonb(m) order by m.month desc) from monthly_statements m where m.seller_id = p_seller), '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'summary', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from monthly_statements m where m.seller_id = p_seller and m.month = p_month),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('order_number', l.order_number, 'paid_at', l.paid_at, 'name_en', l.name_en,
               'quantity', l.quantity, 'currency', l.currency, 'line_total_minor', l.line_total_minor, 'commission_minor', l.commission_minor,
               'refund_minor', l.refund_minor, 'net_minor', l.net_minor, 'order_status', l.order_status) order by l.paid_at), '[]'::jsonb)
              from statement_lines l where l.seller_id = p_seller and l.month = p_month),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('amount_minor', p.amount_minor, 'currency', p.currency, 'paid_on', p.paid_on, 'reference', p.reference)), '[]'::jsonb)
                from payout_records p where p.seller_id = p_seller and p.month = p_month)
  );
end $$;
revoke all on function seller_statement(uuid, date) from public, anon;
grant execute on function seller_statement(uuid, date) to authenticated;

-- ================================================================ staff: the seller list gains KYC and documents
create or replace function admin_sellers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff() then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'seller', to_jsonb(s), 'private', to_jsonb(p),
      'live', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'approved' and x.is_active),
      'waiting', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'pending_review'),
      'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.uploaded_at desc), '[]'::jsonb) from seller_documents d where d.seller_id = s.id),
      'required', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from kyc_requirements r where r.country = s.country),
      'locations', (select count(*) from seller_locations l where l.seller_id = s.id and l.active)
    ) order by (s.status = 'pending') desc, (p.kyc_status = 'submitted') desc, s.created_at desc)
    from sellers s left join seller_private p on p.seller_id = s.id
  ), '[]'::jsonb);
end $$;

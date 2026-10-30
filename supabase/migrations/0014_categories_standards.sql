-- Marketplace (3 of 9): the curated category tree for a Muslim home, each category's policy (commission, photos,
-- documents, returns, shipping restrictions) and attributes, the Al Mukarramah Islamic standard as policy rows, the
-- premium-standard settings, document types and the made-to-measure garment styles.
--
-- Religious rulings are never decided in code: what is prohibited or restricted lives in policy_rules, edited by
-- owner/manager (audited) and, for contested items, confirmed by Afzal's scholar. The AI screening (0015) reads these
-- rows to build its instructions, and records which version it used.

-- ================================================================ marketplace settings (one row; owner/manager, audited)
create table mp_settings (
  id int primary key default 1 check (id = 1),
  -- photos of people: the default is NO human models (flat-lay, mannequin or ghost mannequin only)
  allow_modest_models_in_fashion boolean not null default false,
  min_quality_score int not null default 70 check (min_quality_score between 0 and 100),
  quality_weights jsonb not null default
    '{"photo_count": 20, "photo_resolution": 15, "photo_clean": 20, "photo_background": 10, "attributes": 20, "bilingual": 15}'
    check (jsonb_typeof(quality_weights) = 'object'),
  default_commission_bps int not null default 2500 check (default_commission_bps between 2500 and 5000),
  default_min_photos int not null default 3 check (default_min_photos between 1 and 10),
  default_min_long_side_px int not null default 1600 check (default_min_long_side_px between 800 and 6000),
  default_return_window_days int not null default 14 check (default_return_window_days between 0 and 60),
  price_change_review_bps int not null default 3000 check (price_change_review_bps between 500 and 10000),
  -- strikes: hard violations within the window before the seller is suspended pending review
  strike_limit int not null default 3 check (strike_limit between 1 and 10),
  strike_window_days int not null default 90 check (strike_window_days between 7 and 365),
  quarantine_retention_days int not null default 30 check (quarantine_retention_days between 1 and 365),
  uploads_per_hour int not null default 120 check (uploads_per_hour between 1 and 2000),
  listing_checks_per_day int not null default 60 check (listing_checks_per_day between 1 and 1000),
  -- the fast screening pass escalates to the stronger model when it is not sure enough of a "pass"
  escalate_below_confidence numeric(3,2) not null default 0.85 check (escalate_below_confidence between 0 and 1),
  perf_window_days int not null default 90 check (perf_window_days between 30 and 365),
  perf_thresholds jsonb not null default
    '{"late_shipment_bps": {"warn": 500, "suspend": 1500}, "cancellation_bps": {"warn": 250, "suspend": 1000},
      "return_bps": {"warn": 1000, "suspend": 2500}, "rating_x100": {"warn": 400, "suspend": 350}, "min_orders": 10}'
    check (jsonb_typeof(perf_thresholds) = 'object'),
  perf_auto_suspend boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into mp_settings (id) values (1);
alter table mp_settings enable row level security;
create policy "staff read marketplace settings" on mp_settings for select using (private.is_staff());
create policy "owner and manager edit marketplace settings" on mp_settings for update
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create or replace function mp_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger mp_settings_touch before update on mp_settings for each row execute function mp_touch();
create trigger audit_mp_settings after insert or update or delete on mp_settings for each row execute function audit_trigger();

-- What sellers and the website may know of the settings.
create or replace function mp_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allow_modest_models_in_fashion', allow_modest_models_in_fashion, 'min_quality_score', min_quality_score,
    'quality_weights', quality_weights, 'default_min_photos', default_min_photos, 'default_min_long_side_px', default_min_long_side_px,
    'price_change_review_bps', price_change_review_bps, 'strike_limit', strike_limit, 'strike_window_days', strike_window_days,
    'perf_window_days', perf_window_days, 'perf_thresholds', perf_thresholds,
    'max_upload_bytes', 10485760, 'upload_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp'))
  from mp_settings where id = 1;
$$;
grant execute on function mp_public_settings() to anon, authenticated;

-- ================================================================ document types
create table document_types (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  scope text not null check (scope in ('kyc', 'brand', 'product')),
  label_en text not null,
  label_ar text not null,
  help_en text,
  help_ar text,
  sort int not null default 0
);
insert into document_types (code, scope, label_en, label_ar, help_en, help_ar, sort) values
  ('commercial_registration', 'kyc', 'Commercial registration (CR)', 'السجل التجاري', null, null, 1),
  ('vat_certificate', 'kyc', 'VAT registration certificate', 'شهادة التسجيل في ضريبة القيمة المضافة', null, null, 2),
  ('trade_licence', 'kyc', 'Trade licence', 'الرخصة التجارية', null, null, 3),
  ('trn_certificate', 'kyc', 'Tax registration number (TRN) certificate', 'شهادة رقم التسجيل الضريبي', null, null, 4),
  ('commercial_licence', 'kyc', 'Commercial licence', 'الرخصة التجارية', null, null, 5),
  ('gstin_certificate', 'kyc', 'GST registration (GSTIN)', 'شهادة التسجيل في ضريبة السلع والخدمات (GSTIN)', null, null, 6),
  ('iec_certificate', 'kyc', 'Importer-Exporter Code (IEC)', 'رمز المستورد والمصدّر (IEC)', null, null, 7),
  ('bank_letter', 'kyc', 'Bank letter or IBAN certificate', 'خطاب بنكي أو شهادة الآيبان', 'Shows the account holder name matches your legal entity.', 'يثبت أن اسم صاحب الحساب يطابق الكيان النظامي.', 8),
  ('authorised_distributor_letter', 'brand', 'Authorised distributor letter', 'خطاب الموزّع المعتمد',
   'Needed for every brand you do not own: a signed letter from the brand owner naming you as an authorised seller.',
   'مطلوب لكل علامة تجارية لا تملكها: خطاب موقّع من مالك العلامة يسمّيك بائعًا معتمدًا.', 20),
  ('brand_registration', 'brand', 'Trademark registration', 'شهادة تسجيل العلامة التجارية', 'For your own brand.', 'لعلامتك التجارية الخاصة.', 21),
  ('halal_certificate', 'product', 'Halal certificate', 'شهادة الحلال', 'From a recognised halal certification body, valid on the day you list.', 'صادرة من جهة اعتماد حلال معترف بها وسارية عند الإدراج.', 30),
  ('printer_licence', 'product', 'Licensed Quran printer certificate', 'ترخيص مطبعة المصحف',
   'Printed mushafs are accepted only from printers licensed to print the Quran, with the licence or authorised copy.',
   'لا تُقبل المصاحف المطبوعة إلا من مطابع مرخّص لها بطباعة المصحف، مع الترخيص أو ما يثبت أن النسخة معتمدة.', 31),
  ('content_approval', 'product', 'Content approval for books', 'فسح المحتوى للكتب', 'The publishing permit or content approval for the title.', 'فسح النشر أو موافقة المحتوى لهذا العنوان.', 32),
  ('lab_report', 'product', 'Laboratory test report', 'تقرير مختبر', null, null, 33),
  ('provenance', 'product', 'Provenance documents', 'وثائق المصدر', 'For antiques and items with an origin claim.', 'للقطع الأثرية والقطع التي يُدّعى لها مصدر معيّن.', 34);
alter table document_types enable row level security;
create policy "read document types" on document_types for select using (true);
create policy "owner and manager edit document types" on document_types for all
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create trigger audit_document_types after insert or update or delete on document_types for each row execute function audit_keyed('code');

-- ================================================================ the category tree and its policies
-- department > (group >) category. Policies are inherited: a category uses its own value, else its group's, else its
-- department's, else the marketplace default (mp_settings). Sellers list only in "listable" categories.
alter table categories
  add column parent_id uuid references categories on delete restrict,
  add column kind text not null default 'category' check (kind in ('department', 'group', 'category')),
  add column listable boolean not null default true,
  add column commission_bps int check (commission_bps is null or commission_bps between 2500 and 5000),
  add column min_photos int check (min_photos is null or min_photos between 1 and 10),
  add column min_long_side_px int check (min_long_side_px is null or min_long_side_px between 800 and 6000),
  add column return_policy text check (return_policy is null or return_policy in ('standard', 'unopened_only', 'faulty_only', 'none')),
  add column return_window_days int check (return_window_days is null or return_window_days between 0 and 60),
  add column mtm_return_policy text check (mtm_return_policy is null or mtm_return_policy in ('standard', 'faulty_only', 'none')),
  add column min_price_minor int check (min_price_minor is null or min_price_minor >= 0),   -- optional, off (null) by default
  add column ship_domestic_only boolean,
  add column ship_to_countries text[],
  add column ship_from_countries text[],
  add column dangerous_goods boolean,
  add column required_documents text[],
  add column always_review boolean,              -- staff decide even when the AI passes (e.g. books: content review)
  add column allow_made_to_measure boolean,
  add column min_shelf_days int check (min_shelf_days is null or min_shelf_days between 0 and 730),
  add column guidance_en text,
  add column guidance_ar text,
  add column accepted_examples jsonb not null default '[]' check (jsonb_typeof(accepted_examples) = 'array'),
  add column rejected_examples jsonb not null default '[]' check (jsonb_typeof(rejected_examples) = 'array'),
  add column updated_at timestamptz not null default now(),
  add constraint categories_not_own_parent check (parent_id is distinct from id);
create index categories_parent on categories (parent_id, sort);

-- Marketing may rename or re-photograph a category; its policy (commission, rules) is owner/manager only.
create or replace function categories_policy_guard() returns trigger language plpgsql set search_path = public as $$
declare
  policy_keys text[] := array['parent_id', 'kind', 'listable', 'commission_bps', 'min_photos', 'min_long_side_px', 'return_policy',
    'return_window_days', 'mtm_return_policy', 'min_price_minor', 'ship_domestic_only', 'ship_to_countries', 'ship_from_countries',
    'dangerous_goods', 'required_documents', 'always_review', 'allow_made_to_measure', 'min_shelf_days', 'department'];
  k text;
begin
  new.updated_at := now();
  if coalesce(auth.role(), '') <> 'authenticated' or private.is_staff(array['owner', 'manager']::staff_role[]) then return new; end if;
  foreach k in array policy_keys loop
    if tg_op = 'UPDATE' and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'Only the owner or a manager can change a category''s policy (%)', k;
    end if;
  end loop;
  if tg_op = 'INSERT' and (new.commission_bps is not null or new.required_documents is not null or new.parent_id is not null) then
    raise exception 'Only the owner or a manager can add categories to the marketplace tree';
  end if;
  return new;
end $$;
create trigger categories_policy_guard before insert or update on categories for each row execute function categories_policy_guard();
create trigger audit_categories after insert or update or delete on categories for each row execute function audit_trigger();

-- Attributes a listing in a category may (or must) fill; inherited by the categories below.
create table category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label_en text not null,
  label_ar text not null,
  type text not null check (type in ('text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'country')),
  unit text check (unit is null or unit in ('ml', 'g', 'kg', 'cm', 'mm', 'pcs', 'days', 'pages')),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),   -- [{"value": "edp", "en": "...", "ar": "..."}]
  required boolean not null default false,
  filterable boolean not null default false,       -- shown as a search facet
  min_value numeric,
  max_value numeric,
  max_length int check (max_length is null or max_length between 1 and 4000),
  help_en text,
  help_ar text,
  sort int not null default 0,
  active boolean not null default true,
  unique (category_id, key)
);
alter table category_attributes enable row level security;
create policy "read category attributes" on category_attributes for select using (true);
create policy "owner and manager edit attributes" on category_attributes for all
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create trigger audit_category_attributes after insert or update or delete on category_attributes for each row execute function audit_trigger();

-- ---------------------------------------------------------------- the tree
insert into categories (slug, name_en, name_ar, kind, listable, sort, department, is_active, blurb_en, blurb_ar) values
  ('fragrance-oud', 'Fragrance & oud', 'العطور والعود', 'department', false, 100, 'gifts', false, 'Perfume oils, oud, bakhoor and the vessels that carry them.', 'العطور الزيتية والعود والبخور وما يحملها.'),
  ('prayer-worship', 'Prayer & worship', 'الصلاة والعبادة', 'department', false, 200, 'gifts', false, 'For the prayer and the remembrance of Allah.', 'للصلاة وذكر الله.'),
  ('quran-books', 'Quran & Islamic books', 'المصاحف والكتب الإسلامية', 'department', false, 300, 'gifts', false, 'Mushafs from licensed printers and reviewed books.', 'مصاحف من مطابع مرخّصة وكتب تمت مراجعتها.'),
  ('modest-fashion', 'Modest fashion', 'الأزياء المحتشمة', 'department', false, 400, 'fashion', false, 'Thobes, abayas and modest wear, ready-made or made to measure.', 'ثياب وعبايات وأزياء محتشمة، جاهزة أو مفصّلة.'),
  ('home-art', 'Home & Islamic art', 'المنزل والفن الإسلامي', 'department', false, 500, 'gifts', false, 'Calligraphy, lanterns and pieces for a Muslim home.', 'الخط العربي والفوانيس وقطع لبيت المسلم.'),
  ('dates-food', 'Dates & food', 'التمور والأطعمة', 'department', false, 600, 'gifts', false, 'Dates, honey, Arabic coffee and sweets.', 'التمور والعسل والقهوة العربية والحلويات.'),
  ('gifts-occasions', 'Gifts & occasions', 'الهدايا والمناسبات', 'department', false, 700, 'gifts', false, 'Hajj and Umrah, Ramadan, Eid and new arrivals.', 'الحج والعمرة ورمضان والعيد والمواليد.'),
  ('natural-care', 'Natural care', 'العناية الطبيعية', 'department', false, 800, 'gifts', false, 'Black seed oil and halal cosmetics.', 'زيت الحبة السوداء ومستحضرات التجميل الحلال.'),
  ('kids-learning', 'Kids & learning', 'الأطفال والتعلم', 'department', false, 900, 'gifts', false, 'Arabic, Quran and learning for children.', 'العربية والقرآن والتعلم للأطفال.'),
  ('accessories', 'Accessories', 'الإكسسوارات', 'department', false, 1000, 'gifts', false, 'Men''s silver rings and fine accessories.', 'خواتم الفضة للرجال والإكسسوارات الراقية.')
on conflict (slug) do nothing;

insert into categories (slug, name_en, name_ar, kind, listable, sort, department, is_active, parent_id)
select v.slug, v.name_en, v.name_ar, 'group', false, v.sort, 'fashion', false, (select id from categories where slug = 'modest-fashion')
from (values ('mens-fashion', 'Men', 'الرجال', 410), ('womens-fashion', 'Women', 'النساء', 420), ('kids-fashion', 'Children', 'الأطفال', 430)) as v(slug, name_en, name_ar, sort)
on conflict (slug) do nothing;

insert into categories (slug, name_en, name_ar, kind, listable, sort, department, is_active, parent_id)
select v.slug, v.name_en, v.name_ar, 'category', true, v.sort, v.dept, false, (select id from categories where slug = v.parent)
from (values
  ('attar', 'Perfume oils & attar', 'العطور الزيتية والدهن', 'fragrance-oud', 101, 'gifts'),
  ('incense-burners', 'Incense burners', 'المباخر', 'fragrance-oud', 105, 'gifts'),
  ('fragrance-gift-sets', 'Fragrance gift sets', 'أطقم العطور', 'fragrance-oud', 106, 'gifts'),
  ('tasbih', 'Tasbih & misbaha', 'السبح والمسابح', 'prayer-worship', 203, 'gifts'),
  ('prayer-clothing', 'Prayer clothing', 'ملابس الصلاة', 'prayer-worship', 204, 'gifts'),
  ('quran-stands', 'Quran stands', 'حوامل المصحف', 'prayer-worship', 205, 'gifts'),
  ('qibla-tools', 'Qibla compasses & tools', 'أدوات تحديد القبلة', 'prayer-worship', 206, 'gifts'),
  ('miswak', 'Miswak', 'المسواك', 'prayer-worship', 207, 'gifts'),
  ('mushaf', 'Printed mushafs', 'المصاحف المطبوعة', 'quran-books', 301, 'gifts'),
  ('islamic-books', 'Islamic books', 'الكتب الإسلامية', 'quran-books', 302, 'gifts'),
  ('ghutra-shemagh', 'Ghutra & shemagh', 'الغتر والشماغ', 'mens-fashion', 412, 'fashion'),
  ('bisht', 'Bisht', 'البشوت', 'mens-fashion', 413, 'fashion'),
  ('kufi', 'Kufi & prayer caps', 'الطواقي والكوفيات', 'mens-fashion', 414, 'fashion'),
  ('calligraphy', 'Calligraphy & wall art', 'الخط العربي واللوحات', 'home-art', 501, 'gifts'),
  ('lanterns', 'Lanterns & lighting', 'الفوانيس والإضاءة', 'home-art', 502, 'gifts'),
  ('ramadan-eid-decor', 'Ramadan & Eid décor', 'زينة رمضان والعيد', 'home-art', 503, 'gifts'),
  ('coffee-sets', 'Arabic coffee sets', 'أطقم القهوة العربية', 'home-art', 504, 'gifts'),
  ('home-textiles', 'Textiles & cushions', 'المنسوجات والوسائد', 'home-art', 505, 'gifts'),
  ('honey', 'Honey', 'العسل', 'dates-food', 602, 'gifts'),
  ('arabic-coffee', 'Arabic coffee', 'القهوة العربية', 'dates-food', 603, 'gifts'),
  ('sweets', 'Sweets', 'الحلويات', 'dates-food', 604, 'gifts'),
  ('hajj-umrah-gifts', 'Hajj & Umrah gifts', 'هدايا الحج والعمرة', 'gifts-occasions', 701, 'gifts'),
  ('ramadan-gifts', 'Ramadan gifts', 'هدايا رمضان', 'gifts-occasions', 702, 'gifts'),
  ('eid-gifts', 'Eid gifts', 'هدايا العيد', 'gifts-occasions', 703, 'gifts'),
  ('newborn-gifts', 'Newborn gifts', 'هدايا المواليد', 'gifts-occasions', 704, 'gifts'),
  ('black-seed-oil', 'Black seed oil', 'زيت الحبة السوداء', 'natural-care', 801, 'gifts'),
  ('halal-cosmetics', 'Halal cosmetics', 'مستحضرات التجميل الحلال', 'natural-care', 802, 'gifts'),
  ('learning-toys', 'Learning toys & games', 'ألعاب تعليمية', 'kids-learning', 901, 'gifts'),
  ('kids-books', 'Children''s books', 'كتب الأطفال', 'kids-learning', 902, 'gifts'),
  ('silver-rings', 'Men''s silver rings', 'خواتم الفضة للرجال', 'accessories', 1001, 'gifts')
) as v(slug, name_en, name_ar, parent, sort, dept)
on conflict (slug) do nothing;

-- Existing storefront collections become categories in the tree (names and pages unchanged).
update categories c set parent_id = p.id
from (values ('perfumes', 'fragrance-oud'), ('oud-oils', 'fragrance-oud'), ('bakhoor', 'fragrance-oud'), ('fragrance', 'fragrance-oud'),
             ('prayer-mats', 'prayer-worship'), ('woven-rugs', 'prayer-worship'), ('prayer', 'prayer-worship'),
             ('thobes', 'mens-fashion'), ('abayas', 'womens-fashion'), ('modest-dresses', 'womens-fashion'), ('hijabs', 'womens-fashion'),
             ('kids-modest', 'kids-fashion'), ('dates', 'dates-food'), ('gift-sets', 'gifts-occasions'), ('keepsakes', 'gifts-occasions'),
             ('hampers', 'gifts-occasions')) as m(child, parent)
join categories p on p.slug = m.parent
where c.slug = m.child;
-- Older catch-all collections stay for the shop but are not offered to sellers.
update categories set listable = false where slug in ('fragrance', 'prayer');

-- ---------------------------------------------------------------- policies
update categories set required_documents = '{}', guidance_en = 'Every fragrance needs its volume, concentration, notes and origin, and an honest statement of whether it contains alcohol. Brands you do not own need an authorised-distributor letter.',
  guidance_ar = 'يجب أن يذكر كل عطر حجمه وتركيزه ونفحاته وبلد منشئه، وأن يبيّن بصدق هل يحتوي على كحول. والعلامات التي لا تملكها تحتاج إلى خطاب موزّع معتمد.',
  return_policy = 'unopened_only', return_window_days = 7,
  accepted_examples = '[{"en": "Pure Cambodian oud oil, 3 ml, in a sealed crystal bottle, photographed on a plain stone surface", "ar": "دهن عود كمبودي صافٍ ٣ مل في زجاجة كريستال مختومة مصوّرة على سطح حجري سادة"}]',
  rejected_examples = '[{"en": "A spray described as \"inspired by\" a designer perfume", "ar": "عطر بخاخ موصوف بأنه «مستوحى من» عطر مصمم عالمي"}, {"en": "A bottle photographed in a model''s hand with her face visible", "ar": "زجاجة مصوّرة في يد عارضة يظهر وجهها"}]'
where slug = 'fragrance-oud';
update categories set dangerous_goods = true, ship_domestic_only = true, ship_to_countries = '{SA}', ship_from_countries = '{SA}',
  guidance_en = 'Alcohol-based perfume is dangerous goods (UN1266). For now it can only be sold by sellers in Saudi Arabia to customers in Saudi Arabia, by road courier.',
  guidance_ar = 'العطر المحتوي على الكحول من البضائع الخطرة (UN1266)، ولا يُباع حاليًا إلا من بائعين في السعودية إلى عملاء في السعودية عبر الشحن البري.'
where slug = 'perfumes';
update categories set guidance_en = 'Bakhoor and oud chips: state the weight, the wood''s origin and how it was blended. No claims of healing or protection.',
  guidance_ar = 'البخور ورقائق العود: اذكر الوزن ومنشأ الخشب وطريقة الخلط، ولا ادعاءات للشفاء أو الحماية.' where slug = 'bakhoor';

update categories set return_policy = 'standard', return_window_days = 14,
  guidance_en = 'Prayer items must be fit for the prayer: no images of living beings, and never Quran verses or the name of Allah on anything that is stepped on.',
  guidance_ar = 'يجب أن تكون مستلزمات الصلاة لائقة بها: بلا صور لذوات الأرواح، ولا آيات قرآنية أو اسم الله على ما يُداس.',
  accepted_examples = '[{"en": "A woven prayer mat with a geometric mihrab design, shown flat from above", "ar": "سجادة صلاة منسوجة بتصميم محراب هندسي مصوّرة مسطّحة من الأعلى"}]',
  rejected_examples = '[{"en": "A prayer mat or doormat with the name of Allah woven into it", "ar": "سجادة صلاة أو ممسحة أرجل نُسج عليها اسم الله"}]'
where slug = 'prayer-worship';
update categories set return_policy = 'unopened_only', return_window_days = 7, min_shelf_days = 180 where slug = 'miswak';

update categories set always_review = true, return_policy = 'standard', return_window_days = 14,
  guidance_en = 'Every book is reviewed by our team before it goes live. Give the publisher, author and language. Printed mushafs are accepted only from licensed Quran printers.',
  guidance_ar = 'يراجع فريقنا كل كتاب قبل نشره. اذكر الناشر والمؤلف واللغة. ولا تُقبل المصاحف المطبوعة إلا من مطابع المصحف المرخّصة.',
  accepted_examples = '[{"en": "A tafsir set from a known publisher, with the publisher and edition in the details", "ar": "مجموعة تفسير من ناشر معروف مع ذكر الناشر والطبعة في التفاصيل"}]',
  rejected_examples = '[{"en": "A mushaf from an unknown printer, or a self-printed copy", "ar": "مصحف من مطبعة غير معروفة أو نسخة مطبوعة ذاتيًا"}]'
where slug = 'quran-books';
update categories set required_documents = '{printer_licence}' where slug = 'mushaf';
update categories set required_documents = '{content_approval}' where slug in ('islamic-books');

update categories set min_photos = 5, allow_made_to_measure = true, return_policy = 'standard', return_window_days = 14, mtm_return_policy = 'faulty_only',
  guidance_en = 'Show garments flat, on a hanger, on a mannequin or a ghost mannequin. Give the fabric, care and sizes (or the measurements you need for made to measure). Made-to-measure pieces can only be returned if they are faulty or differ from the order.',
  guidance_ar = 'اعرض الملابس مسطّحة أو على علّاقة أو على مجسّم أو مجسّم شفاف. اذكر القماش وطريقة العناية والمقاسات (أو المقاسات المطلوبة للتفصيل). ولا تُرجع القطع المفصّلة إلا إذا كان بها عيب أو اختلفت عن الطلب.',
  accepted_examples = '[{"en": "A black abaya on a ghost mannequin against an ivory wall, five photos including the fabric close-up", "ar": "عباية سوداء على مجسّم شفاف أمام جدار عاجي، خمس صور منها صورة قريبة للقماش"}]',
  rejected_examples = '[{"en": "An abaya worn by a model with her face showing", "ar": "عباية ترتديها عارضة يظهر وجهها"}, {"en": "A tight or see-through dress", "ar": "فستان ضيّق أو شفاف"}]'
where slug = 'modest-fashion';

update categories set return_policy = 'standard', return_window_days = 14,
  guidance_en = 'Calligraphy and art carrying Quran verses or the names of Allah must be made to hang or stand with respect: never on floor rugs, doormats, cushions to sit on or anything disposable. Write out the text shown so our team can check it.',
  guidance_ar = 'يجب أن تُعلّق أو توضع اللوحات التي تحمل آيات قرآنية أو أسماء الله بما يليق بها: لا على سجاد الأرضيات ولا ممسحات الأرجل ولا الوسائد التي يُجلس عليها ولا ما يُرمى. واكتب النص الظاهر ليراجعه فريقنا.'
where slug = 'home-art';
update categories set always_review = true where slug = 'calligraphy';

update categories set return_policy = 'faulty_only', return_window_days = 3, min_shelf_days = 90,
  guidance_en = 'Food must be sealed and labelled, with origin, net weight, best-before date (at least 90 days away when you list), storage and ingredients, and SFDA registration for Saudi Arabia.',
  guidance_ar = 'يجب أن يكون الطعام مغلّفًا ومُعلَّمًا، مع بلد المنشأ والوزن الصافي وتاريخ انتهاء لا يقل عن ٩٠ يومًا عند الإدراج وطريقة الحفظ والمكونات، وتسجيل هيئة الغذاء والدواء للبيع في السعودية.',
  accepted_examples = '[{"en": "Ajwa dates, 1 kg, sealed box, best before in eight months, SFDA registered", "ar": "تمر عجوة ١ كغ في علبة مختومة، ينتهي بعد ثمانية أشهر، مسجّل لدى هيئة الغذاء والدواء"}]',
  rejected_examples = '[{"en": "Loose dates in an unlabelled bag", "ar": "تمر سائب في كيس بلا بطاقة"}]'
where slug = 'dates-food';
update categories set required_documents = '{halal_certificate}' where slug = 'sweets';

update categories set return_policy = 'standard', return_window_days = 14 where slug in ('gifts-occasions', 'kids-learning', 'accessories');
update categories set always_review = true where slug = 'kids-books';

update categories set return_policy = 'unopened_only', return_window_days = 7, min_shelf_days = 180,
  guidance_en = 'Natural care products need SFDA (eCosma) registration for Saudi Arabia and full ingredients. No medical or healing claims. A "halal" claim needs a halal certificate.',
  guidance_ar = 'تحتاج منتجات العناية الطبيعية إلى تسجيل هيئة الغذاء والدواء (eCosma) للبيع في السعودية مع المكونات كاملة، ولا ادعاءات علاجية أو شفائية، وادعاء «حلال» يحتاج إلى شهادة حلال.'
where slug = 'natural-care';
update categories set required_documents = '{halal_certificate}' where slug = 'halal-cosmetics';

update categories set guidance_en = 'Rings for men must be silver (or another permissible metal), never gold. State the metal and its purity.',
  guidance_ar = 'خواتم الرجال من الفضة (أو معدن مباح آخر) ولا تكون من الذهب أبدًا. اذكر المعدن ونقاوته.' where slug = 'silver-rings';

-- ---------------------------------------------------------------- attributes
-- helper for the seed: (category slug, key, en, ar, type, unit, options, required, filterable, sort)
create function pg_temp.attr(cat text, k text, en text, ar text, t text, u text, opts jsonb, req boolean, filt boolean, srt int)
returns void language sql as $$
  insert into category_attributes (category_id, key, label_en, label_ar, type, unit, options, required, filterable, sort)
  select id, k, en, ar, t, u, coalesce(opts, '[]'::jsonb), req, filt, srt from categories where slug = cat;
$$;
create function pg_temp.o(variadic pairs text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('value', pairs[i], 'en', pairs[i + 1], 'ar', pairs[i + 2]) order by i)
  from generate_series(1, array_length(pairs, 1), 3) i;
$$;

-- every department: the brand and the seller's relationship to it (authenticity), and the origin
select pg_temp.attr(d, 'brand', 'Brand or maker', 'العلامة التجارية أو الصانع', 'text', null, null, true, true, 1),
       pg_temp.attr(d, 'brand_relationship', 'Your relationship to the brand', 'علاقتك بالعلامة التجارية', 'select', null,
         pg_temp.o('own', 'It is my own brand or I make it', 'علامتي الخاصة أو أنا الصانع', 'authorised', 'Authorised distributor or reseller', 'موزّع أو بائع معتمد'), true, false, 2),
       pg_temp.attr(d, 'origin_country', 'Country of origin', 'بلد المنشأ', 'country', null, null, true, true, 3)
from unnest(array['fragrance-oud', 'prayer-worship', 'quran-books', 'modest-fashion', 'home-art', 'dates-food', 'gifts-occasions', 'natural-care', 'kids-learning', 'accessories']) d;

-- fragrance
select pg_temp.attr('fragrance-oud', 'volume_ml', 'Volume', 'الحجم', 'number', 'ml', null, true, true, 10);
select pg_temp.attr('fragrance-oud', 'contains_alcohol', 'Contains alcohol', 'يحتوي على كحول', 'boolean', null, null, true, true, 11);
select pg_temp.attr('fragrance-oud', 'notes', 'Fragrance notes', 'النفحات العطرية', 'text', null, null, true, false, 12);
select pg_temp.attr('fragrance-oud', 'concentration', 'Concentration', 'التركيز', 'select', null,
  pg_temp.o('pure_oil', 'Pure oil', 'دهن صافٍ', 'blended_oil', 'Blended perfume oil', 'دهن ممزوج', 'attar', 'Attar', 'عطر زيتي (عطّار)',
            'extrait', 'Extrait de parfum', 'خلاصة عطر', 'edp', 'Eau de parfum', 'ماء عطر (EDP)', 'edt', 'Eau de toilette', 'ماء تواليت (EDT)'), true, true, 13);
select pg_temp.attr('oud-oils', 'oud_origin', 'Oud origin', 'منشأ العود', 'select', null,
  pg_temp.o('cambodi', 'Cambodian', 'كمبودي', 'hindi', 'Indian (Hindi)', 'هندي', 'malaysian', 'Malaysian', 'ماليزي', 'indonesian', 'Indonesian', 'إندونيسي',
            'thai', 'Thai', 'تايلندي', 'other', 'Other', 'أخرى'), false, true, 20);
select pg_temp.attr('bakhoor', 'weight_g', 'Net weight', 'الوزن الصافي', 'number', 'g', null, true, true, 20);
select pg_temp.attr('bakhoor', 'form', 'Form', 'الشكل', 'select', null,
  pg_temp.o('chips', 'Oud chips', 'رقائق عود', 'muattar', 'Muattar (scented)', 'معطّر', 'mabthooth', 'Mabthooth', 'مبثوث', 'tablets', 'Tablets', 'أقراص'), true, true, 21);
select pg_temp.attr('incense-burners', 'material', 'Material', 'الخامة', 'text', null, null, true, true, 20);
select pg_temp.attr('incense-burners', 'power', 'Power', 'طريقة التشغيل', 'select', null,
  pg_temp.o('charcoal', 'Charcoal', 'فحم', 'electric', 'Electric', 'كهربائي', 'usb', 'Rechargeable (USB)', 'قابل للشحن'), true, true, 21);
select pg_temp.attr('fragrance-gift-sets', 'contents', 'What is in the set', 'محتويات الطقم', 'textarea', null, null, true, false, 20);
-- Incense burners and bakhoor are not liquids; a gift set may hold anything: the inherited fields are hidden or optional.
insert into category_attributes (category_id, key, label_en, label_ar, type, unit, required, filterable, sort, active)
select c.id, a.key, a.en, a.ar, a.t, a.u, false, false, a.s, a.on_ from categories c
join (values
  ('incense-burners', 'volume_ml', 'Volume', 'الحجم', 'number', 'ml', 10, false),
  ('incense-burners', 'contains_alcohol', 'Contains alcohol', 'يحتوي على كحول', 'boolean', null, 11, false),
  ('incense-burners', 'notes', 'Fragrance notes', 'النفحات العطرية', 'text', null, 12, false),
  ('incense-burners', 'concentration', 'Concentration', 'التركيز', 'select', null, 13, false),
  ('bakhoor', 'volume_ml', 'Volume', 'الحجم', 'number', 'ml', 10, false),
  ('bakhoor', 'contains_alcohol', 'Contains alcohol', 'يحتوي على كحول', 'boolean', null, 11, false),
  ('bakhoor', 'notes', 'Fragrance notes', 'النفحات العطرية', 'text', null, 12, true),
  ('bakhoor', 'concentration', 'Concentration', 'التركيز', 'select', null, 13, false),
  ('fragrance-gift-sets', 'volume_ml', 'Volume', 'الحجم', 'number', 'ml', 10, true),
  ('fragrance-gift-sets', 'notes', 'Fragrance notes', 'النفحات العطرية', 'text', null, 12, true),
  ('fragrance-gift-sets', 'concentration', 'Concentration', 'التركيز', 'select', null, 13, false)
) as a(cat, key, en, ar, t, u, s, on_) on a.cat = c.slug;

-- prayer & worship
select pg_temp.attr('prayer-worship', 'material', 'Material', 'الخامة', 'text', null, null, true, true, 10);
select pg_temp.attr('prayer-worship', 'dimensions_cm', 'Size (cm)', 'المقاس (سم)', 'text', null, null, false, false, 11);
select pg_temp.attr('tasbih', 'bead_count', 'Number of beads', 'عدد الحبات', 'select', null, pg_temp.o('33', '33', '٣٣', '99', '99', '٩٩', '100', '100', '١٠٠', '1000', '1000', '١٠٠٠'), true, true, 20);
select pg_temp.attr('qibla-tools', 'tool_type', 'Type', 'النوع', 'select', null, pg_temp.o('compass', 'Compass', 'بوصلة', 'digital', 'Digital', 'رقمي'), true, true, 20);
select pg_temp.attr('miswak', 'pack_count', 'Sticks in a pack', 'عدد الأعواد', 'number', 'pcs', null, true, false, 20);
select pg_temp.attr('miswak', 'best_before', 'Best before', 'يُستهلك قبل', 'date', null, null, true, false, 21);
select pg_temp.attr('prayer-clothing', 'care', 'Care', 'طريقة العناية', 'text', null, null, true, false, 20);

-- quran & books
select pg_temp.attr('quran-books', 'publisher', 'Publisher', 'الناشر', 'text', null, null, true, true, 10);
select pg_temp.attr('quran-books', 'language', 'Language', 'اللغة', 'select', null,
  pg_temp.o('ar', 'Arabic', 'العربية', 'en', 'English', 'الإنجليزية', 'ur', 'Urdu', 'الأردية', 'fr', 'French', 'الفرنسية', 'id', 'Indonesian', 'الإندونيسية',
            'tr', 'Turkish', 'التركية', 'bilingual', 'Arabic with translation', 'عربي مع ترجمة'), true, true, 11);
select pg_temp.attr('quran-books', 'pages', 'Pages', 'عدد الصفحات', 'number', 'pages', null, false, false, 12);
select pg_temp.attr('quran-books', 'isbn', 'ISBN', 'الرقم الدولي (ISBN)', 'text', null, null, false, false, 13);
select pg_temp.attr('mushaf', 'printer', 'Licensed printer', 'المطبعة المرخّصة', 'text', null, null, true, true, 20);
select pg_temp.attr('mushaf', 'riwayah', 'Riwayah', 'الرواية', 'select', null,
  pg_temp.o('hafs', 'Hafs ''an ''Asim', 'حفص عن عاصم', 'warsh', 'Warsh ''an Nafi''', 'ورش عن نافع', 'qalun', 'Qalun ''an Nafi''', 'قالون عن نافع',
            'shubah', 'Shu''bah ''an ''Asim', 'شعبة عن عاصم', 'duri', 'Al-Duri ''an Abi ''Amr', 'الدوري عن أبي عمرو'), true, true, 21);
select pg_temp.attr('mushaf', 'licence_no', 'Printing licence or approval number', 'رقم ترخيص الطباعة أو الاعتماد', 'text', null, null, true, false, 22);
select pg_temp.attr('mushaf', 'mushaf_size', 'Size', 'الحجم', 'select', null, pg_temp.o('pocket', 'Pocket', 'جيب', 'medium', 'Medium', 'وسط', 'large', 'Large', 'كبير'), true, true, 23);
select pg_temp.attr('islamic-books', 'author', 'Author', 'المؤلف', 'text', null, null, true, true, 20);
select pg_temp.attr('islamic-books', 'subject', 'Subject', 'الموضوع', 'select', null,
  pg_temp.o('tafsir', 'Tafsir', 'التفسير', 'seerah', 'Seerah', 'السيرة', 'hadith', 'Hadith', 'الحديث', 'fiqh', 'Fiqh', 'الفقه', 'aqeedah', 'Aqeedah', 'العقيدة',
            'arabic', 'Arabic language', 'اللغة العربية', 'family', 'Family', 'الأسرة', 'other', 'Other', 'أخرى'), true, true, 21);
select pg_temp.attr('islamic-books', 'translator', 'Translator', 'المترجم', 'text', null, null, false, false, 22);

-- modest fashion
select pg_temp.attr('modest-fashion', 'material', 'Fabric', 'القماش', 'text', null, null, true, true, 10);
select pg_temp.attr('modest-fashion', 'care', 'Care', 'طريقة العناية', 'text', null, null, true, false, 11);
select pg_temp.attr('modest-fashion', 'colour', 'Colour', 'اللون', 'text', null, null, true, true, 12);
select pg_temp.attr('modest-fashion', 'season', 'Season', 'الموسم', 'select', null, pg_temp.o('summer', 'Summer', 'صيفي', 'winter', 'Winter', 'شتوي', 'all', 'All year', 'طوال العام'), false, true, 13);

-- home & art
select pg_temp.attr('home-art', 'material', 'Material', 'الخامة', 'text', null, null, true, true, 10);
select pg_temp.attr('home-art', 'dimensions_cm', 'Size (cm)', 'المقاس (سم)', 'text', null, null, true, false, 11);
select pg_temp.attr('calligraphy', 'technique', 'Technique', 'طريقة التنفيذ', 'select', null,
  pg_temp.o('hand', 'Hand-written', 'خط يدوي', 'print', 'Fine art print', 'طباعة فنية', 'carved', 'Carved or engraved', 'محفور أو منقوش', 'embroidered', 'Embroidered', 'مطرّز'), true, true, 20);
select pg_temp.attr('calligraphy', 'text_shown', 'The words shown (in Arabic)', 'النص الظاهر في العمل', 'textarea', null, null, true, false, 21);
select pg_temp.attr('calligraphy', 'script', 'Script', 'نوع الخط', 'select', null,
  pg_temp.o('thuluth', 'Thuluth', 'الثلث', 'naskh', 'Naskh', 'النسخ', 'diwani', 'Diwani', 'الديواني', 'kufi', 'Kufic', 'الكوفي', 'ruqah', 'Ruq''ah', 'الرقعة', 'other', 'Other', 'أخرى'), false, true, 22);
select pg_temp.attr('lanterns', 'power', 'Power', 'طريقة الإضاءة', 'select', null, pg_temp.o('electric', 'Electric', 'كهربائي', 'battery', 'Battery', 'بطارية', 'candle', 'Candle', 'شمعة'), true, true, 20);
select pg_temp.attr('coffee-sets', 'pieces', 'Pieces in the set', 'عدد القطع', 'number', 'pcs', null, true, false, 20);
select pg_temp.attr('home-textiles', 'care', 'Care', 'طريقة العناية', 'text', null, null, true, false, 20);

-- dates & food
select pg_temp.attr('dates-food', 'net_weight_g', 'Net weight', 'الوزن الصافي', 'number', 'g', null, true, true, 10);
select pg_temp.attr('dates-food', 'best_before', 'Best before (current stock)', 'تاريخ الانتهاء (للمخزون الحالي)', 'date', null, null, true, false, 11);
select pg_temp.attr('dates-food', 'storage', 'Storage', 'طريقة الحفظ', 'select', null,
  pg_temp.o('ambient', 'Cool and dry place', 'مكان بارد وجاف', 'chilled', 'Refrigerated', 'مبرّد', 'frozen', 'Frozen', 'مجمّد'), true, true, 12);
select pg_temp.attr('dates-food', 'ingredients', 'Ingredients', 'المكونات', 'textarea', null, null, true, false, 13);
select pg_temp.attr('dates', 'variety', 'Variety', 'الصنف', 'select', null,
  pg_temp.o('ajwa', 'Ajwa', 'عجوة', 'sukkari', 'Sukkari', 'سكري', 'safawi', 'Safawi', 'صفاوي', 'medjool', 'Medjool', 'مجدول', 'khudri', 'Khudri', 'خضري',
            'sagai', 'Sagai', 'صقعي', 'rabia', 'Rabia', 'ربيعة', 'mabroom', 'Mabroom', 'مبروم', 'other', 'Other', 'أخرى'), true, true, 20);
select pg_temp.attr('honey', 'floral_source', 'Floral source', 'المصدر الزهري', 'text', null, null, true, true, 20);
select pg_temp.attr('arabic-coffee', 'roast', 'Roast', 'درجة التحميص', 'select', null, pg_temp.o('light', 'Light (Saudi)', 'فاتح (سعودي)', 'medium', 'Medium', 'متوسط', 'dark', 'Dark', 'غامق'), true, true, 20);
select pg_temp.attr('sweets', 'halal_certified', 'Halal certified', 'حاصل على شهادة حلال', 'boolean', null, null, true, true, 20);

-- gifts
select pg_temp.attr('gifts-occasions', 'contents', 'What is in the gift', 'محتويات الهدية', 'textarea', null, null, true, false, 10);
select pg_temp.attr('gifts-occasions', 'occasion', 'Occasion', 'المناسبة', 'multiselect', null,
  pg_temp.o('hajj', 'Hajj', 'الحج', 'umrah', 'Umrah', 'العمرة', 'ramadan', 'Ramadan', 'رمضان', 'eid', 'Eid', 'العيد', 'nikah', 'Nikah', 'عقد القران', 'newborn', 'Newborn', 'مولود جديد'), false, true, 11);

-- natural care
select pg_temp.attr('natural-care', 'ingredients', 'Ingredients', 'المكونات', 'textarea', null, null, true, false, 10);
select pg_temp.attr('natural-care', 'size', 'Size (ml or g)', 'الحجم (مل أو غ)', 'number', null, null, true, false, 11);
select pg_temp.attr('natural-care', 'how_to_use', 'How to use', 'طريقة الاستخدام', 'textarea', null, null, true, false, 12);
select pg_temp.attr('natural-care', 'best_before', 'Best before (current stock)', 'تاريخ الانتهاء (للمخزون الحالي)', 'date', null, null, true, false, 13);

-- kids
select pg_temp.attr('kids-learning', 'age_range', 'Age', 'العمر', 'select', null,
  pg_temp.o('0-2', '0 to 2 years', 'من ٠ إلى ٢', '3-5', '3 to 5 years', 'من ٣ إلى ٥', '6-8', '6 to 8 years', 'من ٦ إلى ٨', '9-12', '9 to 12 years', 'من ٩ إلى ١٢'), true, true, 10);
select pg_temp.attr('kids-learning', 'material', 'Material', 'الخامة', 'text', null, null, true, false, 11);
select pg_temp.attr('kids-learning', 'safety_standard', 'Toy safety standard', 'معيار سلامة الألعاب', 'text', null, null, false, false, 12);

-- accessories
select pg_temp.attr('silver-rings', 'metal', 'Metal', 'المعدن', 'select', null,
  pg_temp.o('silver_925', 'Sterling silver 925', 'فضة ٩٢٥', 'silver_999', 'Fine silver 999', 'فضة ٩٩٩', 'titanium', 'Titanium', 'تيتانيوم', 'other', 'Other permissible metal', 'معدن مباح آخر'), true, true, 10);
select pg_temp.attr('silver-rings', 'stone', 'Stone', 'الحجر', 'text', null, null, false, true, 11);
select pg_temp.attr('silver-rings', 'weight_g', 'Weight', 'الوزن', 'number', 'g', null, false, false, 12);

-- ================================================================ effective policy, attributes and requirements
-- The category and its parents, nearest first.
create or replace function mp_category_chain(p_cat uuid) returns table (id uuid, depth int)
language sql stable security definer set search_path = public as $$
  with recursive up as (
    select c.id, c.parent_id, 0 as depth from categories c where c.id = p_cat
    union all
    select p.id, p.parent_id, up.depth + 1 from categories p join up on p.id = up.parent_id where up.depth < 6
  ) select up.id, up.depth from up;
$$;

create or replace function mp_category_policy(p_cat uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s mp_settings;
  r jsonb;
  c record;
  k text;
  v jsonb;
  inherit text[] := array['commission_bps', 'min_photos', 'min_long_side_px', 'return_policy', 'return_window_days', 'mtm_return_policy',
    'min_price_minor', 'ship_domestic_only', 'ship_to_countries', 'ship_from_countries', 'dangerous_goods', 'required_documents',
    'always_review', 'allow_made_to_measure', 'min_shelf_days'];
  g_en text[] := '{}';
  g_ar text[] := '{}';
  accepted jsonb := '[]';
  rejected jsonb := '[]';
  path jsonb := '[]';
begin
  if not exists (select 1 from categories where id = p_cat) then return null; end if;
  select * into s from mp_settings where id = 1;
  r := jsonb_build_object('commission_bps', s.default_commission_bps, 'min_photos', s.default_min_photos,
    'min_long_side_px', s.default_min_long_side_px, 'return_policy', 'standard', 'return_window_days', s.default_return_window_days,
    'mtm_return_policy', 'faulty_only', 'min_price_minor', null, 'ship_domestic_only', false, 'ship_to_countries', null,
    'ship_from_countries', null, 'dangerous_goods', false, 'required_documents', '[]'::jsonb, 'always_review', false,
    'allow_made_to_measure', false, 'min_shelf_days', null);
  for c in select to_jsonb(cat) as j, ch.depth from mp_category_chain(p_cat) ch join categories cat on cat.id = ch.id order by ch.depth desc loop
    foreach k in array inherit loop
      v := c.j -> k;
      if v is not null and v <> 'null'::jsonb then r := r || jsonb_build_object(k, v); end if;
    end loop;
    if c.j ->> 'guidance_en' is not null then g_en := g_en || (c.j ->> 'guidance_en'); end if;
    if c.j ->> 'guidance_ar' is not null then g_ar := g_ar || (c.j ->> 'guidance_ar'); end if;
    accepted := accepted || coalesce(c.j -> 'accepted_examples', '[]');
    rejected := rejected || coalesce(c.j -> 'rejected_examples', '[]');
    path := path || jsonb_build_object('id', c.j -> 'id', 'slug', c.j -> 'slug', 'name_en', c.j -> 'name_en', 'name_ar', c.j -> 'name_ar', 'kind', c.j -> 'kind');
  end loop;
  select r || jsonb_build_object('id', id, 'slug', slug, 'name_en', name_en, 'name_ar', name_ar, 'kind', kind,
           'listable', listable and kind = 'category' and parent_id is not null,
           'department', department, 'path', path, 'guidance_en', to_jsonb(g_en), 'guidance_ar', to_jsonb(g_ar),
           'accepted_examples', accepted, 'rejected_examples', rejected)
    into r from categories where id = p_cat;
  return r;
end $$;
grant execute on function mp_category_policy(uuid) to anon, authenticated;

-- Attributes for a category: its own and its parents' (the nearest definition of a key wins).
create or replace function mp_category_attributes(p_cat uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  -- an inactive row on a category hides the attribute it would otherwise inherit
  select coalesce(jsonb_agg(to_jsonb(x) - 'category_id' - 'depth' - 'active' order by x.sort, x.key), '[]'::jsonb)
  from (
    select distinct on (a.key) a.*, ch.depth from mp_category_chain(p_cat) ch join category_attributes a on a.category_id = ch.id
    order by a.key, ch.depth
  ) x where x.active;
$$;
grant execute on function mp_category_attributes(uuid) to anon, authenticated;

-- Everything the listing form shows while a seller works: policy, attributes, documents and permits.
create or replace function mp_category_requirements(p_cat uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pol jsonb;
begin
  pol := mp_category_policy(p_cat);
  if pol is null then return null; end if;
  return jsonb_build_object(
    'policy', pol,
    'attributes', mp_category_attributes(p_cat),
    'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort), '[]'::jsonb) from document_types d
                  where d.code in (select jsonb_array_elements_text(pol -> 'required_documents'))),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('to_country', r.to_country, 'permit_key', r.permit_key, 'label_en', r.label_en, 'label_ar', r.label_ar)), '[]'::jsonb)
                from permit_rules r where r.active and exists (
                  select 1 from mp_category_chain(p_cat) ch join categories c on c.id = ch.id where c.slug = any(r.category_slugs))),
    'settings', mp_public_settings());
end $$;
grant execute on function mp_category_requirements(uuid) to anon, authenticated;

-- The whole tree for the website (sell pages, search facets). Each node carries its effective policy (small) and only
-- its OWN guidance, examples and attributes; the website walks up the tree to show inherited ones (display only: the
-- listing form asks mp_category_requirements, and the server decides).
create or replace function mp_category_tree() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar, 'kind', c.kind, 'parent_id', c.parent_id,
      'sort', c.sort, 'department', c.department, 'is_active', c.is_active, 'listable', c.listable and c.kind = 'category' and c.parent_id is not null,
      'blurb_en', c.blurb_en, 'blurb_ar', c.blurb_ar, 'image', c.image,
      'guidance_en', c.guidance_en, 'guidance_ar', c.guidance_ar, 'accepted_examples', c.accepted_examples, 'rejected_examples', c.rejected_examples,
      'policy', case when c.kind = 'category' then mp_category_policy(c.id) - 'path' - 'guidance_en' - 'guidance_ar' - 'accepted_examples'
                       - 'rejected_examples' - 'id' - 'slug' - 'name_en' - 'name_ar' - 'kind' - 'department' - 'listable' else null end,
      'attributes', (select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(a) - 'id' - 'category_id') order by a.sort, a.key), '[]'::jsonb)
                     from category_attributes a where a.category_id = c.id)
    ) order by c.sort, c.name_en), '[]'::jsonb)
  from categories c where c.kind <> 'category' or c.parent_id is not null;
$$;
grant execute on function mp_category_tree() to anon, authenticated;

-- ================================================================ the Al Mukarramah Islamic standard
create table policy_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,60}$'),
  level text not null check (level in ('prohibited', 'restricted')),
  -- prohibited only: "severe" suspends the listing at once and flags the seller; "hard" counts as a strike
  severity text not null default 'hard' check (severity in ('hard', 'severe')),
  applies_to text not null default 'both' check (applies_to in ('text', 'image', 'both')),
  title_en text not null,
  title_ar text not null,
  guidance_en text not null,
  guidance_ar text not null,
  rejected_examples jsonb not null default '[]' check (jsonb_typeof(rejected_examples) = 'array'),
  accepted_examples jsonb not null default '[]' check (jsonb_typeof(accepted_examples) = 'array'),
  ai_instruction text not null,           -- what the screening model looks for (English)
  keywords jsonb not null default '{"en": [], "ar": []}' check (jsonb_typeof(keywords) = 'object'),   -- words that send a listing to staff review
  needs_scholar_confirmation boolean not null default false,
  scholar_confirmed_by text,
  scholar_confirmed_at timestamptz,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);
alter table policy_rules enable row level security;
create policy "staff read policy rules" on policy_rules for select using (private.is_staff());
create policy "owner and manager edit policy rules" on policy_rules for all
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create or replace function policy_rules_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger policy_rules_touch before insert or update on policy_rules for each row execute function policy_rules_touch();
create trigger audit_policy_rules after insert or update or delete on policy_rules for each row execute function audit_trigger();

insert into policy_rules (code, level, severity, applies_to, sort, title_en, title_ar, guidance_en, guidance_ar, rejected_examples, accepted_examples, ai_instruction, keywords) values
('alcohol_drinks', 'prohibited', 'hard', 'both', 10, 'Alcoholic drinks', 'المشروبات الكحولية',
 'No alcoholic drinks, and nothing made for drinking alcohol. Alcohol-based perfume is a fragrance, not a drink: it is allowed under Perfume sprays (Saudi Arabia only).',
 'لا مشروبات كحولية ولا ما صُنع لشربها. أما العطر المحتوي على الكحول فهو عطر لا شراب، ومسموح في فئة العطور البخاخة (داخل السعودية فقط).',
 '[{"en": "A bottle of wine or a whisky decanter set", "ar": "زجاجة نبيذ أو طقم دورق ويسكي"}]',
 '[{"en": "An eau de parfum that contains alcohol, listed honestly as alcohol-based", "ar": "ماء عطر يحتوي على كحول مُدرج بصدق على أنه كحولي"}]',
 'Alcoholic beverages or items marketed for drinking alcohol (wine, beer, spirits, bar sets). Alcohol-based PERFUME is not a drink and is allowed.',
 '{"en": ["wine", "beer", "vodka", "whisky", "whiskey", "liquor", "champagne", "spirits", "cocktail"], "ar": ["خمر", "نبيذ", "بيرة", "ويسكي", "فودكا", "مشروب كحولي"]}'),
('pork_non_halal', 'prohibited', 'hard', 'both', 20, 'Pork and non-halal food', 'لحم الخنزير والأطعمة غير الحلال',
 'No pork, pork products or food that is not halal. Food containing animal ingredients (such as gelatine) needs a halal certificate.',
 'لا لحم خنزير ولا منتجاته ولا أي طعام غير حلال. والأطعمة التي تحتوي على مكونات حيوانية (كالجيلاتين) تحتاج إلى شهادة حلال.',
 '[{"en": "Sweets made with pork gelatine", "ar": "حلويات مصنوعة بجيلاتين الخنزير"}]', '[]',
 'Pork, pork-derived ingredients, or food that is clearly not halal.',
 '{"en": ["pork", "bacon", "ham", "lard", "gelatin", "gelatine", "pepperoni"], "ar": ["خنزير", "لحم الخنزير", "شحم الخنزير", "جيلاتين"]}'),
('gambling', 'prohibited', 'hard', 'both', 30, 'Gambling', 'القمار',
 'Nothing made for gambling or betting.', 'لا شيء مما صُنع للقمار أو المراهنة.',
 '[{"en": "Poker chips, roulette wheels or lottery products", "ar": "رقائق البوكر أو عجلات الروليت أو منتجات اليانصيب"}]', '[]',
 'Items for gambling or betting (casino equipment, poker sets, lottery products).',
 '{"en": ["casino", "poker", "roulette", "betting", "lottery", "gambling"], "ar": ["قمار", "كازينو", "يانصيب", "مراهنة", "روليت"]}'),
('drugs', 'prohibited', 'severe', 'both', 40, 'Drugs', 'المخدرات',
 'No drugs, narcotics or anything sold for their use.', 'لا مخدرات ولا ما يُباع لتعاطيها.',
 '[{"en": "Cannabis or CBD products, or smoking paraphernalia for them", "ar": "منتجات القنب أو الـCBD أو أدوات تعاطيها"}]', '[]',
 'Narcotics, cannabis or CBD, or paraphernalia for drug use.',
 '{"en": ["cannabis", "marijuana", "cbd", "thc", "hashish", "narcotic"], "ar": ["حشيش", "مخدرات", "ماريجوانا", "قنب"]}'),
('weapons', 'prohibited', 'severe', 'both', 50, 'Weapons', 'الأسلحة',
 'No firearms, ammunition, combat knives, stun devices or sprays. Ceremonial swords and khanjars are a staff decision (see restricted items).',
 'لا أسلحة نارية ولا ذخيرة ولا سكاكين قتالية ولا أجهزة صعق أو بخاخات. أما السيوف والخناجر التراثية فقرارها لفريقنا (انظر المنتجات المقيّدة).',
 '[{"en": "A replica pistol or a tactical knife", "ar": "مسدس مقلّد أو سكين تكتيكية"}]', '[]',
 'Firearms, replicas of firearms, ammunition, combat or tactical knives, stun guns, pepper spray.',
 '{"en": ["gun", "firearm", "pistol", "rifle", "ammunition", "taser", "stun gun", "pepper spray"], "ar": ["سلاح", "مسدس", "بندقية", "ذخيرة", "صاعق"]}'),
('adult_immodest', 'prohibited', 'severe', 'both', 60, 'Adult or immodest products and imagery', 'المنتجات والصور غير المحتشمة أو الخاصة بالبالغين',
 'No adult products, and no immodest imagery anywhere: no nudity, revealing or tight clothing, suggestive poses, or women used as marketing models.',
 'لا منتجات للبالغين، ولا صور غير محتشمة في أي مكان: لا عري ولا ملابس كاشفة أو ضيقة ولا أوضاع موحية ولا استخدام النساء عارضاتٍ للتسويق.',
 '[{"en": "A perfume photographed with a woman in revealing clothes", "ar": "عطر مصوّر مع امرأة بملابس كاشفة"}, {"en": "A see-through or tight dress", "ar": "فستان شفاف أو ضيّق"}]',
 '[{"en": "An abaya on a ghost mannequin", "ar": "عباية على مجسّم شفاف"}]',
 'Nudity, sexual content, lingerie or swimwear shown on people, revealing or tight clothing, suggestive poses, or any woman used as a marketing model.',
 '{"en": ["sexy", "erotic", "lingerie", "bikini", "nude", "adult toy"], "ar": ["مثير", "إباحي", "عاري", "بكيني", "ملابس داخلية"]}'),
('idols_other_worship', 'prohibited', 'hard', 'both', 70, 'Idols and items for the worship of other faiths', 'الأصنام وما يُستعمل لعبادة غير الله',
 'No idols, statues of deities or items made for the worship or rituals of other faiths.',
 'لا أصنام ولا تماثيل آلهة ولا ما صُنع لعبادة غير الله أو طقوسها.',
 '[{"en": "A Buddha statue or a crucifix", "ar": "تمثال بوذا أو صليب"}]', '[]',
 'Idols, statues of deities, religious symbols or objects of worship of other faiths (crucifixes, Buddha statues, Hindu idols).',
 '{"en": ["idol", "buddha", "deity", "crucifix", "ganesh"], "ar": ["صنم", "بوذا", "صليب", "تمثال إله"]}'),
('sorcery_fortune', 'prohibited', 'hard', 'both', 80, 'Sorcery and fortune-telling', 'السحر والكهانة',
 'No items for sorcery, magic, fortune-telling or astrology, and no claims that an item brings luck or wards off harm.',
 'لا شيء مما يُستعمل للسحر أو الكهانة أو التنجيم، ولا ادعاء أن قطعة تجلب الحظ أو تدفع الضر.',
 '[{"en": "Tarot cards, a spell kit or a horoscope charm", "ar": "بطاقات تاروت أو أدوات سحر أو تعويذة أبراج"}]', '[]',
 'Tarot, ouija, spell kits, fortune-telling, astrology, or claims of luck, magic or supernatural protection.',
 '{"en": ["tarot", "ouija", "spell", "fortune telling", "horoscope", "astrology", "witchcraft", "lucky charm"], "ar": ["سحر", "شعوذة", "تاروت", "أبراج", "عرافة", "طلاسم", "جلب الحظ"]}'),
('counterfeit', 'prohibited', 'hard', 'both', 90, 'Counterfeits', 'المنتجات المقلّدة',
 'No fakes, replicas, "inspired by" or "dupe" products, and no brand you are not authorised to sell.',
 'لا منتجات مقلّدة أو مستنسخة أو «مستوحاة» أو «بديلة»، ولا علامة تجارية غير مفوَّض ببيعها.',
 '[{"en": "A perfume \"inspired by\" a designer fragrance, or a bag with a copied logo", "ar": "عطر «مستوحى من» عطر مصمم، أو حقيبة بشعار منسوخ"}]', '[]',
 'Counterfeit or replica goods, copied logos, products described as inspired by, dupe of, or copy of another brand.',
 '{"en": ["replica", "inspired by", "dupe", "first copy", "master copy", "1:1"], "ar": ["تقليد", "مقلد", "طبق الأصل", "هاي كوبي", "ماستر كوبي"]}'),
('zamzam', 'prohibited', 'hard', 'both', 100, 'Zamzam water', 'ماء زمزم',
 'Zamzam water is not sold on Al Mukarramah.', 'لا يُباع ماء زمزم في المكرمة.',
 '[{"en": "Bottled Zamzam water or Zamzam gift sets", "ar": "ماء زمزم معبأ أو أطقم هدايا بماء زمزم"}]', '[]',
 'Zamzam water in any form or quantity.',
 '{"en": ["zamzam", "zam zam"], "ar": ["زمزم"]}'),
('sacred_text_misuse', 'prohibited', 'severe', 'both', 110, 'Sacred text where it is disrespected', 'النصوص المقدسة في مواضع الامتهان',
 'Quran verses, the name of Allah or the name of the Prophet ﷺ must never appear on things for the floor, the feet or the bathroom, or on things likely to be thrown away.',
 'لا تظهر الآيات القرآنية ولا اسم الله ولا اسم النبي ﷺ أبدًا على ما يُفرش على الأرض أو يُلبس في القدمين أو يُستعمل في دورات المياه أو ما يُرجّح رميه.',
 '[{"en": "A floor rug, doormat or bath mat with a verse", "ar": "سجادة أرضية أو ممسحة أرجل أو دواسة حمّام عليها آية"}, {"en": "Disposable plates, napkins or gift wrap printed with the name of Allah", "ar": "أطباق أو مناديل أو ورق تغليف للاستعمال مرة واحدة مطبوع عليها اسم الله"}]',
 '[{"en": "Framed calligraphy of Ayat al-Kursi to hang on a wall", "ar": "لوحة خط لآية الكرسي في إطار للتعليق"}]',
 'Quran verses, the name of Allah or of the Prophet Muhammad on floor items (rugs, doormats, prayer-mat surfaces), footwear, socks, bathroom items, or disposable items (tissues, plates, wrapping paper).',
 '{"en": [], "ar": []}'),
('gold_silk_men', 'prohibited', 'hard', 'both', 120, 'Gold jewellery and silk garments for men', 'الذهب والحرير للرجال',
 'No gold jewellery and no pure-silk garments for men. Silver rings for men are welcome.',
 'لا مجوهرات ذهبية ولا ملابس من الحرير الخالص للرجال. وخواتم الفضة للرجال مرحّب بها.',
 '[{"en": "A men''s 21-karat gold ring", "ar": "خاتم رجالي من الذهب عيار ٢١"}]', '[{"en": "A men''s sterling silver ring with an agate stone", "ar": "خاتم رجالي من الفضة ٩٢٥ بحجر عقيق"}]',
 'Jewellery of gold marketed for men, or garments of pure silk marketed for men. Gold-plated or silk-blend items for men: mark for staff review instead of blocking.',
 '{"en": ["gold ring for men", "men''s gold", "pure silk"], "ar": ["خاتم ذهب رجالي", "حرير طبيعي للرجال"]}'),
('tobacco_shisha_vapes', 'prohibited', 'hard', 'both', 130, 'Tobacco, shisha and vapes', 'التبغ والشيشة والسجائر الإلكترونية',
 'No tobacco, shisha, vapes or their accessories.', 'لا تبغ ولا شيشة ولا سجائر إلكترونية ولا ملحقاتها.',
 '[{"en": "A shisha set, vape pens or flavoured tobacco", "ar": "طقم شيشة أو سجائر إلكترونية أو معسّل"}]', '[]',
 'Tobacco, cigarettes, cigars, shisha or hookah sets, shisha tobacco, vapes or e-cigarettes and their accessories.',
 '{"en": ["tobacco", "cigarette", "cigar", "shisha", "hookah", "vape", "e-cigarette", "nicotine"], "ar": ["تبغ", "سجائر", "سيجار", "شيشة", "أرجيلة", "معسل", "سيجارة إلكترونية", "نيكوتين"]}'),
('prophet_depictions', 'prohibited', 'severe', 'both', 140, 'Depictions of prophets and Companions', 'تصوير الأنبياء والصحابة',
 'No images, figures or illustrations of any prophet, the Prophet''s family or the Companions.',
 'لا صور ولا مجسمات ولا رسومات لأي نبي أو لآل بيت النبي أو للصحابة.',
 '[{"en": "A children''s book illustrating a prophet''s face", "ar": "كتاب أطفال يرسم وجه نبي"}]', '[]',
 'Any visual depiction of a prophet, the family of the Prophet Muhammad, or the Companions.', '{"en": [], "ar": []}'),
('extremist_sectarian', 'prohibited', 'hard', 'both', 150, 'Extremist, sectarian or offensive material', 'المحتوى المتطرف أو الطائفي أو المسيء',
 'No extremist, sectarian or political material, and nothing that mocks any faith or people.',
 'لا محتوى متطرفًا أو طائفيًا أو سياسيًا، ولا ما يسخر من أي دين أو قوم.', '[]', '[]',
 'Extremist, sectarian or political propaganda, hate speech, or content mocking a religion or people.', '{"en": [], "ar": []}');

insert into policy_rules (code, level, applies_to, sort, needs_scholar_confirmation, title_en, title_ar, guidance_en, guidance_ar, rejected_examples, accepted_examples, ai_instruction, keywords) values
('musical_instruments', 'restricted', 'both', 210, true, 'Musical instruments', 'الآلات الموسيقية',
 'Musical instruments are a staff decision while our scholar confirms the standard. The daff is widely accepted for weddings and Eid.',
 'الآلات الموسيقية قرارها لفريقنا إلى أن يؤكد عالمنا المعيار. والدف مقبول على نطاق واسع للأعراس والأعياد.',
 '[]', '[]', 'Musical instruments of any kind (string, wind, percussion, electronic). NOTE: "oud" in this marketplace usually means agarwood fragrance, not the lute.',
 '{"en": ["guitar", "piano", "violin", "drum", "flute", "keyboard instrument", "ukulele"], "ar": ["آلة موسيقية", "جيتار", "بيانو", "كمان", "طبلة", "ناي"]}'),
('figurines_living_beings', 'restricted', 'both', 220, true, 'Figurines, dolls and images of living beings', 'المجسمات والدمى وصور ذوات الأرواح',
 'Dolls, figurines and toys with faces, and decorative images of people or animals, are a staff decision while our scholar confirms the standard.',
 'الدمى والمجسمات والألعاب ذات الوجوه، والصور الزخرفية للناس أو الحيوانات، قرارها لفريقنا إلى أن يؤكد عالمنا المعيار.',
 '[]', '[{"en": "Wooden Arabic-letter blocks without faces", "ar": "مكعبات حروف عربية خشبية بلا وجوه"}]',
 'Dolls, figurines, statues or toys of people or animals with faces; decorative pictures of people or animals.',
 '{"en": ["doll", "figurine", "action figure", "statue"], "ar": ["دمية", "عروسة", "مجسم", "تمثال"]}'),
('amulets_taweez', 'restricted', 'both', 230, true, 'Amulets and ta''weez', 'التمائم والتعاويذ',
 'Amulets, ta''weez and "evil eye" items are a staff decision while our scholar confirms the standard. Claims of protection or healing are never allowed.',
 'التمائم والتعاويذ وما يُعلّق لدفع العين قرارها لفريقنا إلى أن يؤكد عالمنا المعيار، ولا تُقبل أبدًا ادعاءات الحماية أو الشفاء.',
 '[]', '[]', 'Amulets, talismans, ta''weez, evil-eye (nazar) charms, hamsa hands, or any item sold for protection.',
 '{"en": ["amulet", "talisman", "taweez", "tawiz", "evil eye", "nazar", "hamsa"], "ar": ["تميمة", "تعويذة", "خرزة زرقاء", "عين حسود", "كف"]}'),
('antiques', 'restricted', 'both', 240, true, 'Antiques', 'القطع الأثرية',
 'Antiques need provenance documents and any export permits; our team decides each one.',
 'تحتاج القطع الأثرية إلى وثائق المصدر وأي تصاريح تصدير، ويقرر فريقنا في كل قطعة.',
 '[]', '[]', 'Antiques or items claimed to be historic, old or from an earlier era.',
 '{"en": ["antique", "ottoman era", "century old"], "ar": ["أثري", "قطعة أثرية", "عثماني قديم"]}'),
('kiswah_claims', 'restricted', 'both', 250, true, 'Claimed Kiswah pieces', 'قطع يُدّعى أنها من الكسوة',
 'Pieces claimed to be from the Kiswah of the Kaaba or the Haramain need official documents; our team decides each one.',
 'القطع التي يُدّعى أنها من كسوة الكعبة أو من الحرمين تحتاج إلى وثائق رسمية، ويقرر فريقنا في كل قطعة.',
 '[]', '[{"en": "Calligraphy inspired by the Kiswah, clearly described as a new artwork", "ar": "لوحة خط مستوحاة من الكسوة موصوفة بوضوح بأنها عمل فني جديد"}]',
 'Items claimed to be pieces of the Kiswah, the Kaaba covering, or original items from the Haramain.',
 '{"en": ["kiswah", "kiswa", "from the kaaba"], "ar": ["كسوة", "كسوة الكعبة", "ستارة الكعبة"]}'),
('books_content_review', 'restricted', 'text', 260, true, 'Books needing content review', 'الكتب التي تحتاج إلى مراجعة المحتوى',
 'Every book is checked by our team before it goes live.', 'يراجع فريقنا كل كتاب قبل نشره.',
 '[]', '[]', 'Books: mark for staff content review (title, author, publisher, subject).', '{"en": [], "ar": []}'),
('ceremonial_blades', 'restricted', 'both', 270, true, 'Ceremonial swords and khanjars', 'السيوف والخناجر التراثية',
 'Traditional swords and khanjars sold as heritage pieces are a staff decision.', 'السيوف والخناجر التقليدية المباعة قطعًا تراثية قرارها لفريقنا.',
 '[]', '[]', 'Swords, khanjars or daggers presented as traditional or ceremonial pieces.',
 '{"en": ["sword", "khanjar", "dagger"], "ar": ["سيف", "خنجر"]}');

-- What the public guidance pages show: no keywords or AI instructions (they would help people get around them).
create or replace function mp_guidance() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', mp_category_tree(),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'level', level, 'severity', severity, 'title_en', title_en, 'title_ar', title_ar,
               'guidance_en', guidance_en, 'guidance_ar', guidance_ar, 'rejected_examples', rejected_examples, 'accepted_examples', accepted_examples,
               'needs_scholar_confirmation', needs_scholar_confirmation and scholar_confirmed_at is null) order by level, sort), '[]'::jsonb)
              from policy_rules where active),
    'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort), '[]'::jsonb) from document_types d),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('to_country', to_country, 'permit_key', permit_key, 'label_en', label_en,
                'label_ar', label_ar, 'category_slugs', category_slugs) order by to_country, permit_key), '[]'::jsonb) from permit_rules where active),
    'settings', mp_public_settings());
$$;
grant execute on function mp_guidance() to anon, authenticated;

-- ================================================================ made-to-measure garment styles (the tailoring seam)
-- Regional styles a made-to-measure listing can be made in. The measurements each brand needs are declared on the
-- listing (products.tailoring -> measurements); default_measurements here is filled by the tailoring workstream.
create table garment_styles (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  garment text not null check (garment ~ '^[a-z_]{2,30}$'),
  label_en text not null,
  label_ar text not null,
  countries text[] not null default '{}',
  default_measurements jsonb not null default '[]' check (jsonb_typeof(default_measurements) = 'array'),
  active boolean not null default true,
  sort int not null default 0
);
insert into garment_styles (code, garment, label_en, label_ar, countries, sort, active) values
  ('saudi_thobe', 'thobe', 'Saudi thobe', 'الثوب السعودي', '{SA}', 1, true),
  ('emirati_kandura', 'thobe', 'Emirati kandura', 'الكندورة الإماراتية', '{AE}', 2, true),
  ('kuwaiti_dishdasha', 'thobe', 'Kuwaiti dishdasha', 'الدشداشة الكويتية', '{KW}', 3, true),
  ('omani_dishdasha', 'thobe', 'Omani dishdasha', 'الدشداشة العمانية', '{OM}', 4, true),
  ('qatari_thobe', 'thobe', 'Qatari thobe', 'الثوب القطري', '{QA}', 5, true),
  ('bahraini_thobe', 'thobe', 'Bahraini thobe', 'الثوب البحريني', '{BH}', 6, true),
  ('abaya', 'abaya', 'Abaya', 'العباية', '{}', 10, false),
  ('ghutra', 'ghutra', 'Ghutra and shemagh', 'الغترة والشماغ', '{}', 11, false);
alter table garment_styles enable row level security;
create policy "read garment styles" on garment_styles for select using (true);
create policy "owner and manager edit garment styles" on garment_styles for all
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create trigger audit_garment_styles after insert or update or delete on garment_styles for each row execute function audit_keyed('code');

alter table products add column garment_style text references garment_styles(code);

-- Commission for a line: the seller's negotiated rate, else the category's, else the marketplace default.
create or replace function mp_commission_bps(p_seller uuid, p_cat uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select commission_bps from sellers where id = p_seller),
                  (mp_category_policy(p_cat) ->> 'commission_bps')::int,
                  (select default_commission_bps from mp_settings where id = 1));
$$;
revoke all on function mp_commission_bps(uuid, uuid) from public, anon, authenticated;

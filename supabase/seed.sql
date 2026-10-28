-- Sample data so the app has something to show. Replace with the real catalogue (Claude can import it).
insert into categories (slug, name_en, name_ar, sort) values
  ('dates', 'Dates', 'التمور', 1),
  ('prayer', 'Prayer essentials', 'مستلزمات الصلاة', 2),
  ('fragrance', 'Oud and fragrance', 'العود والعطور', 3),
  ('hampers', 'Gift hampers', 'سلال الهدايا', 4);

insert into tags (kind, slug, name_en, name_ar, icon, sort) values
  ('occasion', 'hajj', 'Hajj', 'الحج', 'kaaba', 1),
  ('occasion', 'umrah', 'Umrah', 'العمرة', 'mosque', 2),
  ('occasion', 'ramadan', 'Ramadan', 'رمضان', 'moon', 3),
  ('occasion', 'eid', 'Eid', 'العيد', 'star', 4),
  ('occasion', 'nikah', 'Nikah', 'عقد القران', 'rings', 5),
  ('occasion', 'new-baby', 'New baby', 'مولود جديد', 'baby', 6),
  ('recipient', 'her', 'For her', 'لها', null, 1),
  ('recipient', 'him', 'For him', 'له', null, 2),
  ('recipient', 'kids', 'For kids', 'للأطفال', null, 3),
  ('recipient', 'corporate', 'Corporate', 'للشركات', null, 4);

insert into products (slug, category_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, is_featured, restricted_countries) values
  ('ajwa-gift-box-500', (select id from categories where slug='dates'), 'Ajwa dates gift box, 500 g', 'علبة هدايا تمر عجوة، ٥٠٠ غ',
   'Madinah Ajwa dates in a brass-trimmed gift box.', 'تمر عجوة المدينة في علبة هدايا فاخرة.', 14500, 40, 700, true, '{}'),
  ('travel-prayer-set', (select id from categories where slug='prayer'), 'Travel prayer set', 'طقم صلاة للسفر',
   'Folding prayer mat, tasbih and compass in a zip case.', 'سجادة صلاة قابلة للطي ومسبحة وبوصلة في حقيبة.', 18900, 25, 600, true, '{}'),
  ('oud-attar-12ml', (select id from categories where slug='fragrance'), 'Oud attar, 12 ml', 'دهن عود، ١٢ مل',
   'Concentrated oud oil in a crystal bottle.', 'دهن عود مركز في زجاجة كريستال.', 32000, 15, 250, true, '{US}'),
  ('ramadan-family-hamper', (select id from categories where slug='hampers'), 'Ramadan family hamper', 'سلة رمضان العائلية',
   'Dates, Arabic coffee, sweets and a prayer mat.', 'تمور وقهوة عربية وحلويات وسجادة صلاة.', 59500, 30, 3500, true, '{}');

insert into product_tags (product_id, tag_id)
select p.id, t.id from products p, tags t where
  (p.slug = 'ajwa-gift-box-500' and t.slug in ('umrah','hajj','ramadan','him','her','corporate')) or
  (p.slug = 'travel-prayer-set' and t.slug in ('hajj','umrah','him','her')) or
  (p.slug = 'oud-attar-12ml' and t.slug in ('eid','nikah','him')) or
  (p.slug = 'ramadan-family-hamper' and t.slug in ('ramadan','eid','corporate'));

insert into shipping_zones (name, countries, cities, carrier, service, first_kg_sar, extra_kg_sar, days_min, days_max) values
  ('Madinah same day', '{SA}', '{Madinah,المدينة المنورة}', 'own-driver', 'Hotel or home delivery', 2500, 0, 0, 1),
  ('Saudi Arabia', '{SA}', null, 'SMSA', 'Standard', 3000, 500, 1, 3),
  ('GCC', '{AE,KW,QA,BH,OM}', null, 'Aramex', 'Express', 6500, 1500, 2, 5),
  ('UK and Europe', '{GB,FR,DE,NL,BE,IE,ES,IT,SE}', null, 'DHL Express', 'Express', 14000, 3500, 3, 6),
  ('Rest of world', '{*}', null, 'DHL Express', 'Express', 17500, 4500, 4, 8);

insert into plans (slug, kind, name_en, name_ar, description_en, description_ar, price_sar) values
  ('member-monthly', 'membership', 'Member', 'العضوية',
   'Quran Trail and Seerah Trail, member prices, early access, free gift wrapping.',
   'رحلة القرآن ورحلة السيرة، أسعار الأعضاء، وصول مبكر، تغليف هدايا مجاني.', 2900),
  ('dates-club', 'box', 'Dates Club', 'نادي التمور',
   'A box of premium Madinah dates every month.', 'صندوق من تمور المدينة الفاخرة كل شهر.', 12900);

insert into programmes (slug, name_en, name_ar) values
  ('quran-trail', 'Quran Trail', 'رحلة القرآن'),
  ('seerah-trail', 'Seerah Trail', 'رحلة السيرة');

insert into lessons (programme_id, day, title_en, title_ar, quran_ref, published, reviewed_by)
select id, d, 'Day ' || d || ': page ' || d, 'اليوم ' || d || ': الصفحة ' || d, 'page:' || d, true, 'Quran text from Quran Foundation (unaltered)'
from programmes, generate_series(1, 30) d where slug = 'quran-trail';

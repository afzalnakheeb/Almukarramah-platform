-- The live database as it is before the marketplace migrations (categories, delivery zones and a few of our own
-- products), so the tests run the marketplace migrations against the same starting point. Applied after 0008.
insert into categories (slug, name_en, name_ar, sort, is_active) values
  ('prayer-mats', 'Prayer Mats', 'سجادات الصلاة', 1, true),
  ('prayer', 'Prayer essentials', 'مستلزمات الصلاة', 2, false),
  ('gift-sets', 'Gift Sets', 'أطقم الهدايا', 2, true),
  ('woven-rugs', 'Rawdah Woven Rugs', 'سجادات الروضة المنسوجة', 3, true),
  ('fragrance', 'Oud and fragrance', 'العود والعطور', 3, false),
  ('dates', 'Madinah Dates', 'تمور المدينة', 4, true),
  ('hampers', 'Gift hampers', 'سلال الهدايا', 4, false),
  ('keepsakes', 'Madinah Keepsakes', 'تذكارات المدينة', 5, true),
  ('perfumes', 'Perfumes', 'العطور', 6, true),
  ('oud-oils', 'Oud and Perfume Oils', 'دهن العود والعطور الزيتية', 7, true),
  ('bakhoor', 'Bakhoor and Oud', 'البخور والعود', 80, false);

insert into shipping_zones (name, countries, cities, carrier, service, first_kg_sar, extra_kg_sar, days_min, days_max, accepts_perfume_spray) values
  ('Madinah same day', '{SA}', '{Madinah,المدينة المنورة}', 'own-driver', 'Hotel or home delivery', 2500, 0, 0, 1, true),
  ('Saudi Arabia', '{SA}', null, 'SMSA', 'Standard', 3000, 500, 1, 3, true),
  ('GCC', '{AE,KW,QA,BH,OM}', null, 'Aramex', 'Express', 6500, 1500, 2, 5, false),
  ('UK and Europe', '{GB,FR,DE,NL,BE,IE,ES,IT,SE}', null, 'DHL Express', 'Express', 14000, 3500, 3, 6, false),
  ('Rest of world', '{*}', null, 'DHL Express', 'Express', 17500, 4500, 4, 8, false);

insert into products (slug, category_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, ship_class, brand, images) values
  ('kaaba-door-prayer-mat', (select id from categories where slug = 'prayer-mats'), 'Kaaba door prayer mat', 'سجادة صلاة باب الكعبة',
   'A woven prayer mat.', 'سجادة صلاة منسوجة.', 29500, 20, 900, 'standard', null, '{/images/products/kaaba-door.jpg}'),
  ('aam-zumar-60-ml', (select id from categories where slug = 'perfumes'), 'Ahmed Al Maghribi Zumar Eau de Parfum 60 ml', 'عطر زمر من أحمد المغربي ٦٠ مل',
   'Eau de parfum.', 'ماء عطر.', 39000, 12, 350, 'perfume_spray', 'Ahmed Al Maghribi', '{/images/products/zumar.jpg}'),
  ('cambodi-oud-oil-3ml', (select id from categories where slug = 'oud-oils'), 'Cambodi oud oil 3 ml', 'دهن عود كمبودي ٣ مل',
   'Oud oil.', 'دهن عود.', 45000, 6, 120, 'perfume_oil', null, '{}'),
  ('ajwa-dates-1kg', (select id from categories where slug = 'dates'), 'Madinah Ajwa dates 1 kg', 'تمر عجوة المدينة ١ كغ',
   'Ajwa dates.', 'تمر عجوة.', 16500, 30, 1100, 'standard', null, '{}');

// Demo catalogue, used only until the Supabase project is connected (EXPO_PUBLIC_SUPABASE_URL not set).
// It mirrors supabase/seed.sql so the website can be previewed on day one.
import type { Plan, Product, Tag } from './types';

const tag = (kind: Tag['kind'], slug: string, name_en: string, name_ar: string): Tag => ({ id: `${kind}-${slug}`, kind, slug, name_en, name_ar, icon: null });

export const demoTags: Tag[] = [
  tag('occasion', 'hajj', 'Hajj', 'الحج'),
  tag('occasion', 'umrah', 'Umrah', 'العمرة'),
  tag('occasion', 'ramadan', 'Ramadan', 'رمضان'),
  tag('occasion', 'eid', 'Eid', 'العيد'),
  tag('occasion', 'nikah', 'Nikah', 'عقد القران'),
  tag('occasion', 'new-baby', 'New baby', 'مولود جديد'),
  tag('recipient', 'her', 'For her', 'لها'),
  tag('recipient', 'him', 'For him', 'له'),
  tag('recipient', 'kids', 'For kids', 'للأطفال'),
  tag('recipient', 'corporate', 'Corporate', 'للشركات'),
];

const withTags = (slugs: string[]) => demoTags.filter((t) => slugs.includes(t.slug)).map((t) => ({ tags: t }));

export const demoProducts: Product[] = [
  {
    id: 'demo-1', slug: 'ajwa-gift-box-500', name_en: 'Ajwa dates gift box, 500 g', name_ar: 'علبة هدايا تمر عجوة، ٥٠٠ غ',
    description_en: 'Madinah Ajwa dates in a brass-trimmed gift box.', description_ar: 'تمر عجوة المدينة في علبة هدايا فاخرة.',
    base_price_sar: 14500, stock: 40, images: [], restricted_countries: [], is_featured: true,
    product_tags: withTags(['umrah', 'hajj', 'ramadan', 'him', 'her', 'corporate']),
  },
  {
    id: 'demo-2', slug: 'travel-prayer-set', name_en: 'Travel prayer set', name_ar: 'طقم صلاة للسفر',
    description_en: 'Folding prayer mat, tasbih and compass in a zip case.', description_ar: 'سجادة صلاة قابلة للطي ومسبحة وبوصلة في حقيبة.',
    base_price_sar: 18900, stock: 25, images: [], restricted_countries: [], is_featured: true,
    product_tags: withTags(['hajj', 'umrah', 'him', 'her']),
  },
  {
    id: 'demo-3', slug: 'oud-attar-12ml', name_en: 'Oud attar, 12 ml', name_ar: 'دهن عود، ١٢ مل',
    description_en: 'Concentrated oud oil in a crystal bottle.', description_ar: 'دهن عود مركز في زجاجة كريستال.',
    base_price_sar: 32000, stock: 15, images: [], restricted_countries: ['US'], is_featured: true,
    product_tags: withTags(['eid', 'nikah', 'him']),
  },
  {
    id: 'demo-4', slug: 'ramadan-family-hamper', name_en: 'Ramadan family hamper', name_ar: 'سلة رمضان العائلية',
    description_en: 'Dates, Arabic coffee, sweets and a prayer mat.', description_ar: 'تمور وقهوة عربية وحلويات وسجادة صلاة.',
    base_price_sar: 59500, stock: 30, images: [], restricted_countries: [], is_featured: true,
    product_tags: withTags(['ramadan', 'eid', 'corporate']),
  },
];

export const demoPlans: Plan[] = [
  {
    id: 'demo-member', slug: 'member-monthly', kind: 'membership', name_en: 'Member', name_ar: 'العضوية',
    description_en: 'Quran Trail and Seerah Trail, member prices, early access, free gift wrapping.',
    description_ar: 'رحلة القرآن ورحلة السيرة، أسعار الأعضاء، وصول مبكر، تغليف هدايا مجاني.',
    price_sar: 2900, period: 'month', store_product_id_ios: null, store_product_id_android: null,
  },
  {
    id: 'demo-dates', slug: 'dates-club', kind: 'box', name_en: 'Dates Club', name_ar: 'نادي التمور',
    description_en: 'A box of premium Madinah dates every month.', description_ar: 'صندوق من تمور المدينة الفاخرة كل شهر.',
    price_sar: 12900, period: 'month', store_product_id_ios: null, store_product_id_android: null,
  },
];

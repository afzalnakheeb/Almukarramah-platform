// Demo data for the marketplace screens, used ONLY in the screenshot build (EXPO_PUBLIC_MARKET_DEMO=1) while the live
// database has no marketplace tables. Nothing here is real: no customer, seller or order. Photos are our own public
// product photos. In every other build these values are never read.
import type { AiCheck, Listing, MediaAsset, MySeller } from './seller';

export const DEMO_SELLER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

export const DEMO_SELLER: MySeller = {
  role: 'owner',
  seller: {
    id: DEMO_SELLER_ID, slug: 'dar-al-oud-madinah', name_en: 'Dar Al Oud Madinah', name_ar: 'دار العود المدينة', country: 'SA', kind: 'marketplace',
    tagline_en: 'Oud oils distilled and aged in Madinah since 2009', tagline_ar: 'دهن العود يُقطّر ويُعتّق في المدينة منذ ٢٠٠٩',
    about_en: 'A family oud house in Madinah. We distil, age and bottle every oil ourselves, and source our wood from the same growers in Cambodia and Assam each season.',
    about_ar: 'دار عود عائلية في المدينة المنورة. نقطّر كل دهن ونعتّقه ونعبّئه بأيدينا، ونختار خشبنا من المزارعين أنفسهم في كمبوديا وآسام كل موسم.',
    city: 'Madinah', logo: null, banner: null, website: 'https://example.com', handling_days: 2, returns_en: null, returns_ar: null,
    status: 'approved', commission_bps: null, review_note: null, created_at: '2026-09-02T09:00:00Z', agreed_guidelines_at: '2026-09-02T09:00:00Z',
  },
  private: {
    seller_id: DEMO_SELLER_ID, contact_name: 'Demo seller', contact_email: 'seller@example.com', contact_phone: null, legal_name: 'Demo Trading Est.',
    registration_no: null, tax_registration_no: null, product_summary: 'Oud oils, attar and bakhoor',
  },
};

const p = (f: string) => `/products/aam/${f}`;
const q = (f: string) => `/products/${f}`;
const asset = (path: string, status: MediaAsset['status'], w = 2400, h = 2400, reasons: MediaAsset['reasons'] = [], flags: string[] = []): MediaAsset =>
  ({ id: path, kind: 'listing_photo', path, status, reasons, flags, width: w, height: h, mime: 'image/jpeg' });

export const DEMO_MEDIA: Record<string, MediaAsset> = {
  [p('aswad-by-ahmed-10-ml-1.jpg')]: asset(p('aswad-by-ahmed-10-ml-1.jpg'), 'passed'),
  [p('aswad-by-ahmed-10-ml-2.jpg')]: asset(p('aswad-by-ahmed-10-ml-2.jpg'), 'passed'),
  [p('ameer-al-oud-100-ml-1.jpg')]: asset(p('ameer-al-oud-100-ml-1.jpg'), 'passed'),
  [p('antee-gift-set-05-1.jpg')]: asset(p('antee-gift-set-05-1.jpg'), 'passed'),
  [p('antee-gift-set-05-2.jpg')]: asset(p('antee-gift-set-05-2.jpg'), 'passed', 1200, 1200, [], ['busy_background']),
  [p('bakhoor-ahmed-10-tabs-1.jpg')]: asset(p('bakhoor-ahmed-10-tabs-1.jpg'), 'passed'),
  [p('bakhoor-ahmed-10-tabs-2.jpg')]: asset(p('bakhoor-ahmed-10-tabs-2.jpg'), 'passed'),
  [p('bakhoor-ahmed-20-tabs-1.jpg')]: asset(p('bakhoor-ahmed-20-tabs-1.jpg'), 'passed'),
  [q('kaaba-kiswah-prayer-mat-1.jpg')]: asset(q('kaaba-kiswah-prayer-mat-1.jpg'), 'passed', 2000, 2500),
  [q('kaaba-kiswah-prayer-mat-2.jpg')]: asset(q('kaaba-kiswah-prayer-mat-2.jpg'), 'passed', 2000, 2500),
  [q('kaaba-kiswah-prayer-mat-3.jpg')]: asset(q('kaaba-kiswah-prayer-mat-3.jpg'), 'review', 2000, 2500,
    [{ code: 'sacred_text', en: 'Shows calligraphy that may be Quranic: check it is shown with respect.', ar: 'تظهر فيها كتابة قد تكون آيات قرآنية: تحقّق من عرضها باحترام.' }], ['sacred_text']),
  [p('ameer-al-oud-100-ml-2.jpg')]: asset(p('ameer-al-oud-100-ml-2.jpg'), 'passed', 1400, 1400, [], ['busy_background']),
};

const CHECK_BLOCKED: AiCheck = {
  verdict: 'block', checked_at: '2026-10-30T18:20:00Z', quality_score: 74,
  summary_en: 'Please fix the points below and submit again.', summary_ar: 'يُرجى تصحيح النقاط أدناه وإعادة الإرسال.',
  reasons: [
    { code: 'contact', field: 'description_en', en: 'Remove contact details from the English description (“WhatsApp 055 123 4567”). Customers reach you through Al Mukarramah messages.', ar: 'احذف بيانات التواصل من الوصف الإنجليزي («WhatsApp 055 123 4567»)، فالعملاء يتواصلون معك عبر رسائل المكرمة.' },
    { code: 'photo_mismatch', photo: 2, en: 'Photo 2 does not seem to show this product.', ar: 'يبدو أن الصورة ٢ لا تُظهر هذا المنتج.' },
    { code: 'claim_medical', field: 'description_en', en: 'Remove the claim that the oil “heals headaches”: healing claims are not allowed.', ar: 'احذف الادعاء بأن الدهن «يشفي الصداع»، فادعاءات الشفاء غير مسموحة.' },
  ],
};
const CHECK_REVIEW: AiCheck = {
  verdict: 'review', checked_at: '2026-10-30T16:05:00Z', quality_score: 91,
  summary_en: 'Sent to our team, with notes for them to check.', summary_ar: 'أُرسل إلى فريقنا مع ملاحظات للتحقق منها.',
  reasons: [
    { code: 'rule_kiswah_claims', en: 'Our team will decide on this listing: Claimed Kiswah pieces. The description says it is woven with thread from the Kiswah; ask for proof of origin.', ar: 'سيقرّر فريقنا في هذا المنتج: قطع يُدّعى أنها من الكسوة. يذكر الوصف أنها منسوجة بخيوط من الكسوة؛ اطلب إثبات المصدر.' },
    { code: 'sacred_text', photo: 3, en: 'Photo 3 shows calligraphy that may be Quranic, on an item placed on the floor.', ar: 'تُظهر الصورة ٣ كتابة قد تكون آيات قرآنية على قطعة توضع على الأرض.' },
  ],
};

const base = {
  seller_id: DEMO_SELLER_ID, weight_g: 300, is_active: true, ship_class: 'perfume_oil' as const, made_to_measure: false, garment: null,
  sizes: null, size_chart: null, tailoring: null, submitted_at: '2026-10-30T16:00:00Z', ai_checked_at: '2026-10-30T16:05:00Z', updated_at: '2026-10-30T16:00:00Z',
};

export const DEMO_LISTINGS: Listing[] = [
  {
    ...base, id: 'demo-blocked', slug: 'demo-oud-attar-gift-set', category_id: null, name_en: 'Royal oud attar gift set', name_ar: 'طقم دهن العود الملكي',
    description_en: 'Three aged oud oils in a velvet case. Heals headaches and calms the mind. Order on WhatsApp 055 123 4567 for a discount.',
    description_ar: 'ثلاثة أنواع من دهن العود المعتّق في علبة مخملية، هدية فاخرة للمناسبات.',
    base_price_sar: 89000, stock: 12, images: [p('antee-gift-set-05-1.jpg'), p('antee-gift-set-05-2.jpg'), p('ameer-al-oud-100-ml-1.jpg')],
    listing_status: 'rejected', review_note: 'Please fix the points below and submit again.', ai_check: CHECK_BLOCKED,
    attributes: { brand: 'Dar Al Oud', brand_relationship: 'own', origin_country: 'SA', contains_alcohol: false, contents: 'Three 3 ml oud oils' },
  },
  {
    ...base, id: 'demo-review', slug: 'demo-kiswah-prayer-mat', category_id: null, name_en: 'Kiswah-pattern prayer mat', name_ar: 'سجادة صلاة بنقش الكسوة',
    description_en: 'Black and gold prayer mat in the pattern of the Kiswah, described by the maker as woven with thread from the Kiswah itself.', description_ar: 'سجادة صلاة سوداء وذهبية بنقش الكسوة، ويصفها الصانع بأنها منسوجة بخيوط من الكسوة نفسها.',
    base_price_sar: 125000, stock: 4, weight_g: 1400, images: [q('kaaba-kiswah-prayer-mat-1.jpg'), q('kaaba-kiswah-prayer-mat-2.jpg'), q('kaaba-kiswah-prayer-mat-3.jpg')],
    listing_status: 'pending_review', review_note: null, ai_check: CHECK_REVIEW,
    attributes: { brand: 'Dar Al Oud', brand_relationship: 'own', origin_country: 'TR' }, ship_class: 'standard',
  },
  {
    ...base, id: 'demo-live', slug: 'demo-cambodi-oud-3ml', category_id: null, name_en: 'Cambodian oud oil, 3 ml', name_ar: 'دهن عود كمبودي ٣ مل',
    description_en: 'Pure Cambodian oud oil, distilled from wild agarwood and aged for two years.', description_ar: 'دهن عود كمبودي صافٍ مقطّر من خشب العود البري ومعتّق لعامين.',
    base_price_sar: 45000, stock: 9, images: [p('aswad-by-ahmed-10-ml-1.jpg'), p('aswad-by-ahmed-10-ml-2.jpg')], listing_status: 'approved', review_note: null,
    ai_check: { ...CHECK_REVIEW, verdict: 'pass', reasons: [], summary_en: 'Sent to our team for approval.', summary_ar: 'أُرسل إلى فريقنا للموافقة.' },
    attributes: { brand: 'Dar Al Oud', brand_relationship: 'own', origin_country: 'KH', volume_ml: 3, contains_alcohol: false, notes: 'Woody, leather, honey', concentration: 'pure_oil' },
  },
  {
    ...base, id: 'demo-queue-oud', slug: 'demo-ameer-al-oud', category_id: null, name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل',
    description_en: 'A deep, sweet Hindi oud oil aged for five years in Madinah. Six millilitres in a hand-cut crystal bottle.', description_ar: 'دهن عود هندي عميق وحلو، معتّق خمس سنوات في المدينة المنورة. ستة ملليلترات في قارورة كريستال مقطوعة يدويًا.',
    base_price_sar: 98000, stock: 6, images: [p('ameer-al-oud-100-ml-1.jpg'), p('ameer-al-oud-100-ml-2.jpg'), p('aswad-by-ahmed-10-ml-1.jpg')], listing_status: 'pending_review', review_note: null,
    ai_check: { verdict: 'pass', checked_at: '2026-10-31T08:40:00Z', quality_score: 86, summary_en: 'Sent to our team for approval.', summary_ar: 'أُرسل إلى فريقنا للموافقة.', reasons: [] },
    attributes: { brand: 'Dar Al Oud', brand_relationship: 'own', origin_country: 'IN', volume_ml: 6, contains_alcohol: false, concentration: 'pure_oil' },
  },
  {
    ...base, id: 'demo-draft', slug: 'demo-bakhoor', category_id: null, name_en: 'Muattar bakhoor, 40 g', name_ar: '', description_en: '', description_ar: '',
    base_price_sar: 18000, stock: 20, images: [p('bakhoor-ahmed-10-tabs-1.jpg')], listing_status: 'draft', review_note: null, ai_check: null, ai_checked_at: null, submitted_at: null,
    attributes: { brand: 'Dar Al Oud' }, ship_class: 'standard',
  },
];

/** The demo listing for a route id, with its category resolved from the handbook snapshot by slug. */
export function demoListing(id: string, categoryIdOf: (slug: string) => string | null): Listing | null {
  const l = DEMO_LISTINGS.find((x) => x.id === id);
  if (!l) return null;
  const slug = id === 'demo-review' ? 'prayer-mats' : id === 'demo-draft' ? 'bakhoor' : id === 'demo-live' || id === 'demo-queue-oud' ? 'oud-oils' : 'fragrance-gift-sets';
  return { ...l, category_id: categoryIdOf(slug) };
}

/** The staff queue in the screenshot build: the seller and category as the admin page reads them. */
export function demoQueue(categoryIdOf: (slug: string) => string | null, nameOf: (id: string | null) => string) {
  return DEMO_LISTINGS.filter((l) => l.id !== 'demo-draft').map((l) => {
    const d = demoListing(l.id, categoryIdOf)!;
    return {
      ...d, categories: { name_en: nameOf(d.category_id) },
      sellers: { name_en: DEMO_SELLER.seller.name_en, country: DEMO_SELLER.seller.country, kind: DEMO_SELLER.seller.kind, status: DEMO_SELLER.seller.status },
      garment_style: null, hs_code: d.id === 'demo-queue-oud' ? '330129' : null, origin_country: (d.attributes.origin_country as string) ?? null,
    };
  });
}

// The premium standard as a listing quality score (0 to 100) with tips in English and Arabic.
// The same function runs in the seller's listing form (live tips while they work) and on the server when the
// listing is submitted (the server's answer is the one that counts, with photo sizes and AI photo flags from the
// screening records). No imports: the app imports this file directly.
//
// Hard requirements ("required" tips) stop a submission whatever the score; everything else lowers the score, and a
// listing below the minimum score (mp_settings.min_quality_score) cannot be submitted either.

export type PhotoFlag =
  | 'watermark' | 'text_overlay' | 'price_overlay' | 'contact_details' | 'sticker' | 'collage'
  | 'busy_background' | 'low_quality' | 'blurry' | 'person' | 'mismatch';

export type QualityPhoto = {
  /** longest side in pixels (from the screening record); null while it is being checked */
  longSidePx: number | null;
  /** screening status of the photo */
  status?: 'pending' | 'passed' | 'review' | 'rejected' | 'blocked' | 'error';
  flags?: PhotoFlag[];
};

export type QualityAttribute = { key: string; label_en: string; label_ar: string; type: string; required: boolean };

export type QualityPolicy = {
  min_photos: number;
  min_long_side_px: number;
  min_price_minor?: number | null;
  min_shelf_days?: number | null;
  required_documents?: string[];
  allow_made_to_measure?: boolean;
};

export type QualityInput = {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceMinor: number;
  photos: QualityPhoto[];
  attributes: Record<string, unknown>;
  categoryAttributes: QualityAttribute[];
  policy: QualityPolicy;
  /** document types on file for this listing (product documents) */
  documents?: string[];
  madeToMeasure?: boolean;
  tailoring?: { style?: string; production_days?: number; measurements?: { key: string }[]; options?: unknown[] } | null;
  weights?: Partial<Weights>;
  minScore?: number;
  /** YYYY-MM-DD; defaults to today (UTC) */
  today?: string;
};

export type Weights = { photo_count: number; photo_resolution: number; photo_clean: number; photo_background: number; attributes: number; bilingual: number };
export const DEFAULT_WEIGHTS: Weights = { photo_count: 20, photo_resolution: 15, photo_clean: 20, photo_background: 10, attributes: 20, bilingual: 15 };

export type Tip = { code: string; level: 'required' | 'improve'; en: string; ar: string; field: string; photo?: number };
export type QualityResult = { score: number; minScore: number; canSubmit: boolean; tips: Tip[]; parts: Record<keyof Weights, number> };

const OVERLAY: PhotoFlag[] = ['watermark', 'text_overlay', 'price_overlay', 'sticker', 'collage'];
const DESC_GOOD = 160;   // characters for a full-marks description in each language
const AR = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

const n = (v: number) => Math.round(v * 10) / 10;
const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Days from `from` (YYYY-MM-DD) to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function scoreListing(i: QualityInput): QualityResult {
  const w: Weights = { ...DEFAULT_WEIGHTS, ...(i.weights ?? {}) };
  const minScore = i.minScore ?? 70;
  const tips: Tip[] = [];
  const req = (code: string, field: string, en: string, ar: string, photo?: number) => tips.push({ code, level: 'required', field, en, ar, photo });
  const imp = (code: string, field: string, en: string, ar: string, photo?: number) => tips.push({ code, level: 'improve', field, en, ar, photo });
  const today = i.today ?? new Date().toISOString().slice(0, 10);
  const photos = i.photos ?? [];
  const minPhotos = Math.max(1, i.policy.min_photos || 1);
  const minPx = i.policy.min_long_side_px || 1600;

  // ---------- photos: count
  const usable = photos.filter((p) => p.status !== 'rejected' && p.status !== 'blocked');
  const countPart = w.photo_count * Math.min(1, usable.length / minPhotos);
  if (usable.length < minPhotos) {
    req('photos_min', 'photos', `Add at least ${minPhotos} photos (you have ${usable.length}).`, `أضف ${minPhotos} صور على الأقل (لديك ${usable.length}).`);
  }
  photos.forEach((p, k) => {
    if (p.status === 'rejected' || p.status === 'blocked') {
      req('photo_refused', 'photos', `Photo ${k + 1} did not pass the photo check: remove it.`, `الصورة ${k + 1} لم تجتز فحص الصور: احذفها.`, k + 1);
    } else if (p.status === 'pending' || p.status === 'error' || p.status === undefined) {
      req('photo_pending', 'photos', `Photo ${k + 1} is still being checked.`, `الصورة ${k + 1} ما زالت قيد الفحص.`, k + 1);
    }
  });

  // ---------- photos: resolution (each photo must reach the minimum)
  const sized = usable.filter((p) => p.longSidePx !== null);
  const sharp = sized.filter((p) => (p.longSidePx ?? 0) >= minPx).length;
  const resPart = w.photo_resolution * (usable.length ? sharp / usable.length : 0);
  usable.forEach((p) => {
    const k = photos.indexOf(p) + 1;
    if (p.longSidePx !== null && p.longSidePx < minPx) {
      req('photo_small', 'photos', `Photo ${k} is ${p.longSidePx} px on its long side; premium listings need at least ${minPx} px.`,
        `الصورة ${k} طول ضلعها الأطول ${p.longSidePx} بكسل، وتحتاج المنتجات الراقية إلى ${minPx} بكسل على الأقل.`, k);
    }
  });

  // ---------- photos: clean (no watermarks, overlays, collages, contact details) and background
  let clean = 0;
  let calm = 0;
  usable.forEach((p) => {
    const k = photos.indexOf(p) + 1;
    const f = p.flags ?? [];
    if (f.includes('contact_details')) {
      req('photo_contact', 'photos', `Photo ${k} shows contact details (a phone number, handle or link). Remove them from the photo.`,
        `تظهر في الصورة ${k} بيانات تواصل (رقم هاتف أو حساب أو رابط). احذفها من الصورة.`, k);
    }
    if (f.includes('person')) {
      req('photo_person', 'photos', `Photo ${k} shows a person. Use a flat-lay, a mannequin or a ghost mannequin.`,
        `تظهر في الصورة ${k} شخص. استخدم التصوير المسطّح أو المجسّم أو المجسّم الشفاف.`, k);
    }
    if (f.includes('mismatch')) {
      req('photo_mismatch', 'photos', `Photo ${k} does not seem to show this product.`, `يبدو أن الصورة ${k} لا تُظهر هذا المنتج.`, k);
    }
    const overlays = f.filter((x) => OVERLAY.includes(x));
    if (!overlays.length && !f.includes('contact_details')) clean++;
    else if (overlays.length) {
      imp('photo_overlay', 'photos', `Photo ${k} has ${overlays.map((x) => x.replace('_', ' ')).join(', ')}: use the clean photo.`,
        `في الصورة ${k} ${overlays.map(arFlag).join('، ')}: استخدم الصورة النظيفة.`, k);
    }
    if (!f.includes('busy_background') && !f.includes('low_quality') && !f.includes('blurry')) calm++;
    else {
      imp('photo_background', 'photos', `Photo ${k}: use a clean, plain or premium background, in focus and well lit.`,
        `الصورة ${k}: استخدم خلفية نظيفة سادة أو راقية، مع وضوح وإضاءة جيدة.`, k);
    }
  });
  const cleanPart = w.photo_clean * (usable.length ? clean / usable.length : 0);
  const bgPart = w.photo_background * (usable.length ? calm / usable.length : 0);

  // ---------- attributes
  const required = i.categoryAttributes.filter((a) => a.required);
  let filled = 0;
  for (const a of required) {
    const v = i.attributes?.[a.key];
    if (!blank(v)) filled++;
    else req(`attr_${a.key}`, `attr:${a.key}`, `Fill in “${a.label_en}”.`, `أكمل حقل «${a.label_ar}».`);
  }
  const optional = i.categoryAttributes.filter((a) => !a.required);
  const optionalFilled = optional.filter((a) => !blank(i.attributes?.[a.key])).length;
  const attrPart = w.attributes * (required.length ? filled / required.length : 1) * (optional.length ? 0.85 + 0.15 * (optionalFilled / optional.length) : 1);

  // best-before far enough away (food, natural care)
  const bb = i.attributes?.best_before;
  if (i.policy.min_shelf_days && typeof bb === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bb)) {
    const days = daysBetween(today, bb);
    if (days < i.policy.min_shelf_days) {
      req('best_before', 'attr:best_before', `The best-before date must be at least ${i.policy.min_shelf_days} days away (it is ${days}).`,
        `يجب أن يكون تاريخ الانتهاء بعد ${i.policy.min_shelf_days} يومًا على الأقل (المتبقي ${days}).`);
    }
  }

  // ---------- bilingual title and description
  const nameEn = (i.nameEn ?? '').trim();
  const nameAr = (i.nameAr ?? '').trim();
  const descEn = (i.descriptionEn ?? '').trim();
  const descAr = (i.descriptionAr ?? '').trim();
  if (nameEn.length < 3 || !LATIN.test(nameEn)) req('name_en', 'name_en', 'Add the product name in English.', 'أضف اسم المنتج بالإنجليزية.');
  if (nameAr.length < 3 || !AR.test(nameAr)) req('name_ar', 'name_ar', 'Add the product name in Arabic.', 'أضف اسم المنتج بالعربية.');
  if (descEn.length < 40) req('desc_en', 'description_en', 'Write a description in English (at least 40 characters).', 'اكتب وصفًا بالإنجليزية (٤٠ حرفًا على الأقل).');
  if (descAr.length < 40 || !AR.test(descAr)) req('desc_ar', 'description_ar', 'Write a description in Arabic (at least 40 characters).', 'اكتب وصفًا بالعربية (٤٠ حرفًا على الأقل).');
  const richness = (s: string) => Math.min(1, s.length / DESC_GOOD);
  const bilPart = w.bilingual * (
    0.2 * (nameEn.length >= 3 ? 1 : 0) + 0.2 * (nameAr.length >= 3 && AR.test(nameAr) ? 1 : 0) +
    0.3 * richness(descEn) + 0.3 * (AR.test(descAr) ? richness(descAr) : 0));
  if (descEn.length >= 40 && descEn.length < DESC_GOOD) imp('desc_en_short', 'description_en', 'Say more in the English description: materials, size, how it is made.', 'أضف تفاصيل أكثر في الوصف الإنجليزي: الخامات والمقاس وطريقة الصنع.');
  if (descAr.length >= 40 && descAr.length < DESC_GOOD) imp('desc_ar_short', 'description_ar', 'Say more in the Arabic description.', 'أضف تفاصيل أكثر في الوصف العربي.');

  // ---------- price, documents, made to measure
  if (!(i.priceMinor > 0)) req('price', 'price', 'Set a price.', 'حدّد السعر.');
  if (i.policy.min_price_minor && i.priceMinor < i.policy.min_price_minor) {
    req('price_min', 'price', `This category has a minimum price of SAR ${(i.policy.min_price_minor / 100).toFixed(2)}.`,
      `الحد الأدنى للسعر في هذه الفئة ${(i.policy.min_price_minor / 100).toFixed(2)} ريال.`);
  }
  for (const d of i.policy.required_documents ?? []) {
    if (!(i.documents ?? []).includes(d)) req(`doc_${d}`, 'documents', `Upload the required document: ${d.replace(/_/g, ' ')}.`, `ارفع المستند المطلوب: ${d.replace(/_/g, ' ')}.`);
  }
  if (i.madeToMeasure) {
    const t = i.tailoring ?? {};
    if (!i.policy.allow_made_to_measure) req('mtm_category', 'tailoring', 'Made-to-measure is not offered in this category.', 'التفصيل حسب المقاس غير متاح في هذه الفئة.');
    if (!t.style) req('mtm_style', 'tailoring', 'Choose the garment style (for example Saudi thobe or Emirati kandura).', 'اختر طراز القطعة (مثل الثوب السعودي أو الكندورة الإماراتية).');
    if (!(Number(t.production_days) >= 1)) req('mtm_days', 'tailoring', 'State the production time in days.', 'اذكر مدة التفصيل بالأيام.');
    if (!(t.measurements?.length)) req('mtm_measurements', 'tailoring', 'List the measurements you need from the customer.', 'حدّد المقاسات التي تحتاجها من العميل.');
  }

  const parts = { photo_count: n(countPart), photo_resolution: n(resPart), photo_clean: n(cleanPart), photo_background: n(bgPart), attributes: n(attrPart), bilingual: n(bilPart) };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 100;
  const score = Math.round(((countPart + resPart + cleanPart + bgPart + attrPart + bilPart) / total) * 100);
  const hard = tips.some((t) => t.level === 'required');
  if (!hard && score < minScore) {
    tips.push({ code: 'score_min', level: 'required', field: 'score', en: `The quality score is ${score}; listings need ${minScore} to be submitted. Follow the tips above.`,
      ar: `درجة الجودة ${score}، ويلزم ${minScore} لإرسال المنتج. اتبع النصائح أعلاه.` });
  }
  return { score, minScore, canSubmit: !hard && score >= minScore, tips, parts };
}

function arFlag(f: PhotoFlag): string {
  const m: Partial<Record<PhotoFlag, string>> = {
    watermark: 'علامة مائية', text_overlay: 'كتابة فوق الصورة', price_overlay: 'سعر فوق الصورة', sticker: 'ملصقات', collage: 'صورة مجمّعة',
  };
  return m[f] ?? f;
}

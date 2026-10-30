// The premium standard: listing quality score and its hard requirements.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { scoreListing, type QualityInput } from '../functions/_shared/quality.ts';

const attrs = [
  { key: 'brand', label_en: 'Brand', label_ar: 'العلامة', type: 'text', required: true },
  { key: 'volume_ml', label_en: 'Volume', label_ar: 'الحجم', type: 'number', required: true },
  { key: 'notes', label_en: 'Notes', label_ar: 'النفحات', type: 'text', required: false },
];
const good = (): QualityInput => ({
  nameEn: 'Cambodian oud oil, 3 ml',
  nameAr: 'دهن عود كمبودي ٣ مل',
  descriptionEn: 'Pure Cambodian oud oil distilled from wild agarwood, aged for two years and presented in a hand-cut crystal bottle with a gold-leaf stopper and a fitted case.',
  descriptionAr: 'دهن عود كمبودي صافٍ مقطّر من خشب العود البري، معتّق لمدة عامين، في زجاجة كريستال مقطوعة يدويًا بسدادة مذهّبة وعلبة مخصّصة تحفظه وتليق بالإهداء والمناسبات.',
  priceMinor: 45000,
  photos: [2400, 2000, 1800].map((px) => ({ longSidePx: px, status: 'passed' as const, flags: [] })),
  attributes: { brand: 'Oud House', volume_ml: 3, notes: 'woody' },
  categoryAttributes: attrs,
  policy: { min_photos: 3, min_long_side_px: 1600 },
  today: '2026-10-30',
});

describe('quality score', () => {
  test('a complete premium listing scores high and can be submitted', () => {
    const r = scoreListing(good());
    assert.equal(r.canSubmit, true);
    assert.ok(r.score >= 95, `score ${r.score}`);
    assert.equal(r.tips.filter((t) => t.level === 'required').length, 0);
  });

  test('too few photos and small photos are hard requirements', () => {
    const i = good();
    i.photos = [{ longSidePx: 1200, status: 'passed', flags: [] }];
    const r = scoreListing(i);
    assert.equal(r.canSubmit, false);
    assert.ok(r.tips.some((t) => t.code === 'photos_min' && t.level === 'required'));
    assert.ok(r.tips.some((t) => t.code === 'photo_small' && t.photo === 1));
    assert.match(r.tips.find((t) => t.code === 'photo_small')!.ar, /بكسل/);
  });

  test('fashion needs five photos (category policy)', () => {
    const i = good();
    i.policy = { min_photos: 5, min_long_side_px: 1600 };
    const r = scoreListing(i);
    assert.equal(r.canSubmit, false);
    assert.match(r.tips.find((t) => t.code === 'photos_min')!.en, /at least 5/);
  });

  test('photos still being checked, or refused, stop submission', () => {
    const i = good();
    i.photos = [...i.photos, { longSidePx: null, status: 'pending' }, { longSidePx: 2000, status: 'blocked' }];
    const r = scoreListing(i);
    assert.ok(r.tips.some((t) => t.code === 'photo_pending' && t.photo === 4));
    assert.ok(r.tips.some((t) => t.code === 'photo_refused' && t.photo === 5));
    assert.equal(r.canSubmit, false);
  });

  test('watermarks and busy backgrounds lower the score; contact details and people are hard', () => {
    const i = good();
    i.photos[0].flags = ['watermark'];
    i.photos[1].flags = ['busy_background'];
    const r1 = scoreListing(i);
    assert.ok(r1.score < scoreListing(good()).score);
    assert.ok(r1.tips.some((t) => t.code === 'photo_overlay' && t.level === 'improve'));
    i.photos[2].flags = ['contact_details'];
    assert.ok(scoreListing(i).tips.some((t) => t.code === 'photo_contact' && t.level === 'required'));
    i.photos[2].flags = ['person'];
    assert.ok(scoreListing(i).tips.some((t) => t.code === 'photo_person' && t.level === 'required'));
  });

  test('required attributes and both languages are hard requirements', () => {
    const i = good();
    i.attributes = { notes: 'woody' };
    i.nameAr = '';
    i.descriptionAr = 'short';
    const r = scoreListing(i);
    const codes = r.tips.filter((t) => t.level === 'required').map((t) => t.code);
    assert.deepEqual(codes.sort(), ['attr_brand', 'attr_volume_ml', 'desc_ar', 'name_ar'].sort());
    assert.match(r.tips.find((t) => t.code === 'attr_brand')!.ar, /العلامة/);
  });

  test('an Arabic field written in English does not count as Arabic', () => {
    const i = good();
    i.nameAr = 'Cambodian oud';
    assert.ok(scoreListing(i).tips.some((t) => t.code === 'name_ar'));
  });

  test('a listing below the minimum score cannot be submitted even without hard problems', () => {
    const i = good();
    i.photos = i.photos.map((p) => ({ ...p, flags: ['watermark', 'busy_background'] }));
    const r = scoreListing({ ...i, minScore: 90 });
    assert.equal(r.tips.filter((t) => t.level === 'required' && t.code !== 'score_min').length, 0);
    assert.equal(r.canSubmit, false);
    assert.ok(r.tips.some((t) => t.code === 'score_min'));
  });

  test('food: best-before must be far enough away; documents and minimum price are enforced when set', () => {
    const i = good();
    i.attributes = { ...i.attributes, best_before: '2026-12-01' };
    i.policy = { min_photos: 3, min_long_side_px: 1600, min_shelf_days: 90, required_documents: ['halal_certificate'], min_price_minor: 50000 };
    const codes = scoreListing(i).tips.filter((t) => t.level === 'required').map((t) => t.code);
    assert.ok(codes.includes('best_before'));
    assert.ok(codes.includes('doc_halal_certificate'));
    assert.ok(codes.includes('price_min'));
    i.attributes.best_before = '2027-06-01';
    i.documents = ['halal_certificate'];
    i.priceMinor = 60000;
    assert.equal(scoreListing(i).canSubmit, true);
  });

  test('made to measure needs the style, production time and the measurements the brand declares', () => {
    const i = { ...good(), madeToMeasure: true, tailoring: { production_days: 0, measurements: [] }, policy: { min_photos: 3, min_long_side_px: 1600, allow_made_to_measure: true } };
    const codes = scoreListing(i).tips.filter((t) => t.level === 'required').map((t) => t.code);
    assert.deepEqual(codes.sort(), ['mtm_days', 'mtm_measurements', 'mtm_style']);
    i.tailoring = { style: 'emirati_kandura', production_days: 12, measurements: [{ key: 'length' }] };
    assert.equal(scoreListing(i).canSubmit, true);
    assert.ok(scoreListing({ ...i, policy: { min_photos: 3, min_long_side_px: 1600 } }).tips.some((t) => t.code === 'mtm_category'));
  });

  test('weights come from settings', () => {
    const r = scoreListing({ ...good(), weights: { photo_count: 50, photo_resolution: 0, photo_clean: 0, photo_background: 0, attributes: 50, bilingual: 0 } });
    assert.equal(r.score, 100);
  });
});

// AI screening with mocked model answers: contact details, the fast pass and its escalation, image and listing
// decisions, strikes, and never failing open.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findContacts, maskContacts } from '../functions/_shared/contact.ts';
import { scoreListing } from '../functions/_shared/quality.ts';
import {
  decideListing, imagePrompt, needsEscalation, normalizeArabic, parseImageResult, screenImage, screenListing, textChecks,
  type ModelCall, type Rule, type ScreeningSettings,
} from '../functions/_shared/screening.ts';

const rules: Rule[] = [
  { code: 'adult_immodest', level: 'prohibited', severity: 'severe', applies_to: 'both', title_en: 'Adult or immodest products and imagery', title_ar: 'غير المحتشم', ai_instruction: 'nudity', keywords: { en: ['lingerie'], ar: ['عاري'] } },
  { code: 'tobacco_shisha_vapes', level: 'prohibited', severity: 'hard', applies_to: 'both', title_en: 'Tobacco, shisha and vapes', title_ar: 'التبغ والشيشة', ai_instruction: 'shisha', keywords: { en: ['shisha', 'vape'], ar: ['شيشة', 'معسل'] } },
  { code: 'alcohol_drinks', level: 'prohibited', severity: 'hard', applies_to: 'both', title_en: 'Alcoholic drinks', title_ar: 'المشروبات الكحولية', ai_instruction: 'wine', keywords: { en: ['wine'], ar: [] } },
  { code: 'counterfeit', level: 'prohibited', severity: 'hard', applies_to: 'both', title_en: 'Counterfeits', title_ar: 'المقلّد', ai_instruction: 'fakes', keywords: { en: ['replica'], ar: [] } },
  { code: 'musical_instruments', level: 'restricted', severity: 'hard', applies_to: 'both', title_en: 'Musical instruments', title_ar: 'الآلات الموسيقية', ai_instruction: 'instruments', keywords: { en: ['guitar'], ar: [] } },
];
const settings: ScreeningSettings = { allow_modest_models_in_fashion: false, escalate_below_confidence: 0.85 };
const models = { fast: 'fast-model', strong: 'strong-model' };
const image = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } };

const img = (o: Record<string, unknown> = {}) => JSON.stringify({ verdict: 'pass', confidence: 0.97, people: 'none', modest: null, immodest: false,
  rule_hits: [], flags: [], background: 'clean', product: 'a bottle', matches_listing: true, summary_en: 'Fine', summary_ar: 'جيد', ...o });

/** A mock model: answers by model name, counts calls; 'throw' simulates an unavailable API. */
function mock(answers: Record<string, string | 'throw'>): ModelCall & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (model: string) => {
    calls.push(model);
    const a = answers[model];
    if (a === 'throw' || a === undefined) throw new Error('503 overloaded');
    return { text: a, model, latencyMs: 5 };
  }) as ModelCall & { calls: string[] };
  fn.calls = calls;
  return fn;
}
const run = (call: ModelCall, extra: Partial<Parameters<typeof screenImage>[0]> = {}) =>
  screenImage({ image, ctx: { kind: 'listing_photo', listing: { name_en: 'Oud oil' } }, rules, settings, models, call, ...extra });

describe('contact details', () => {
  test('phones, emails, links, handles, messaging apps and invitations, in English and Arabic', () => {
    const kinds = (s: string) => findContacts(s).map((h) => h.kind);
    assert.deepEqual(kinds('Call 0551234567'), ['phone']);
    assert.deepEqual(kinds('+966 55 123 4567'), ['phone']);
    assert.deepEqual(kinds('رقمي ٠٥٥١٢٣٤٥٦٧'), ['phone']);
    assert.deepEqual(kinds('info@oudhouse.com'), ['email']);
    assert.deepEqual(kinds('visit www.oudhouse.sa today'), ['url']);
    assert.deepEqual(kinds('order at oudhouse.com'), ['url']);
    assert.deepEqual(kinds('follow @oud_house'), ['handle']);
    assert.deepEqual(kinds('WhatsApp us'), ['messaging', 'solicit']);
    assert.deepEqual(kinds('اطلب عبر واتساب'), ['messaging']);
    assert.deepEqual(kinds('تواصل معي مباشرة'), ['solicit']);
  });

  test('no false alarms on sizes, prices, dates, ISBNs and barcodes', () => {
    for (const s of ['60 ml', 'SAR 1,250.00', 'Sizes 52-54-56', '2026-10-30', 'ISBN 9780141036144', '3.5 ml oud', 'e.g. oud', 'Barcode 6281234567890',
      'Model 1200', 'عطر ١٠٠ مل', 'Ajwa dates 1 kg, 2027-06-01']) {
      assert.deepEqual(findContacts(s), [], s);
    }
  });

  test('masking for messages', () => {
    const m = maskContacts('WhatsApp me on 0551234567 or a@b.com');
    assert.equal(m.text.includes('0551234567'), false);
    assert.equal(m.text.includes('a@b.com'), false);
    assert.ok(m.masked >= 3);
  });
});

describe('image screening', () => {
  test('prompts come from the policy rows and their version follows the rules', () => {
    const a = imagePrompt(rules, settings, { kind: 'listing_photo' });
    assert.match(a.system, /tobacco_shisha_vapes \[prohibited, hard\]/);
    assert.match(a.system, /must not show people/);
    const b = imagePrompt([...rules.slice(0, 4), { ...rules[4], ai_instruction: 'changed' }], settings, { kind: 'listing_photo' });
    assert.notEqual(a.version, b.version);
    const fashion = imagePrompt(rules, { ...settings, allow_modest_models_in_fashion: true }, { kind: 'listing_photo', fashion: true });
    assert.match(fashion.system, /modestly dressed model may appear/);
  });

  test('strict parsing: unknown rule codes and flags are dropped, broken answers are refused', () => {
    const r = parseImageResult(img({ rule_hits: [{ code: 'made_up', confidence: 1 }, { code: 'counterfeit', confidence: 0.4 }], flags: ['watermark', 'sparkles'] }), rules);
    assert.deepEqual(r.rule_hits.map((h) => h.code), ['counterfeit']);
    assert.deepEqual(r.flags, ['watermark']);
    assert.throws(() => parseImageResult('Looks fine to me!', rules));
    assert.throws(() => parseImageResult(img({ verdict: 'ok' }), rules));
    assert.throws(() => parseImageResult(img({ people: 'maybe' }), rules));
  });

  test('a clean, confident pass from the fast model is final (one call)', async () => {
    const call = mock({ 'fast-model': img() });
    const { runs, outcome } = await run(call);
    assert.equal(outcome.status, 'passed');
    assert.deepEqual(call.calls, ['fast-model']);
    assert.deepEqual(runs.map((r) => r.stage), ['fast', 'final']);
    assert.ok(runs[0].prompt_version?.startsWith('img-'));
  });

  test('anything borderline goes to the stronger model', async () => {
    assert.equal(needsEscalation(parseImageResult(img({ confidence: 0.7 }), rules), settings), true);
    assert.equal(needsEscalation(parseImageResult(img({ flags: ['busy_background'] }), rules), settings), false, 'quality alone is not borderline');
    const call = mock({ 'fast-model': img({ flags: ['watermark'], verdict: 'review' }), 'strong-model': img({ flags: ['watermark'], verdict: 'review', confidence: 0.9 }) });
    const { outcome } = await run(call);
    assert.deepEqual(call.calls, ['fast-model', 'strong-model']);
    assert.equal(outcome.status, 'rejected');
    assert.match(outcome.reasons[0].ar, /علامة مائية/);
    assert.equal(outcome.strike, undefined, 'a watermark is fixable, not a strike');
  });

  test('people: no models by default; a modest model in modest fashion only when the setting allows, for staff review', async () => {
    const person = img({ people: 'person', modest: true, verdict: 'review', confidence: 0.9 });
    const r1 = await run(mock({ 'fast-model': person, 'strong-model': person }));
    assert.equal(r1.outcome.status, 'rejected');
    assert.equal(r1.outcome.reasons[0].code, 'person');
    const on = { ...settings, allow_modest_models_in_fashion: true };
    const r2 = await run(mock({ 'fast-model': person, 'strong-model': person }), { settings: on, ctx: { kind: 'listing_photo', fashion: true } });
    assert.equal(r2.outcome.status, 'review');
    const r3 = await run(mock({ 'fast-model': person, 'strong-model': person }), { settings: on, ctx: { kind: 'listing_photo', fashion: false } });
    assert.equal(r3.outcome.status, 'rejected', 'only in modest fashion');
  });

  test('immodest imagery is blocked as severe, confirmed by the stronger model', async () => {
    const bad = img({ verdict: 'block', people: 'person', immodest: true, confidence: 0.95, rule_hits: [{ code: 'adult_immodest', confidence: 0.95 }] });
    const { outcome, runs } = await run(mock({ 'fast-model': bad, 'strong-model': bad }));
    assert.equal(outcome.status, 'blocked');
    assert.equal(outcome.strike, 'severe');
    assert.equal(outcome.policy_code, 'adult_immodest');
    assert.deepEqual(runs.map((r) => r.stage), ['fast', 'strong', 'final']);
  });

  test('prohibited items block with a strike only when the model is sure; restricted items go to staff', async () => {
    const sure = img({ verdict: 'block', confidence: 0.92, rule_hits: [{ code: 'tobacco_shisha_vapes', confidence: 0.92 }] });
    const r1 = await run(mock({ 'fast-model': sure, 'strong-model': sure }));
    assert.equal(r1.outcome.status, 'blocked');
    assert.equal(r1.outcome.strike, 'hard');
    const unsure = img({ verdict: 'review', confidence: 0.5, rule_hits: [{ code: 'tobacco_shisha_vapes', confidence: 0.4 }] });
    assert.equal((await run(mock({ 'fast-model': unsure, 'strong-model': unsure }))).outcome.status, 'review');
    const restricted = img({ verdict: 'review', confidence: 0.9, rule_hits: [{ code: 'musical_instruments', confidence: 0.95 }] });
    const r3 = await run(mock({ 'fast-model': restricted, 'strong-model': restricted }));
    assert.equal(r3.outcome.status, 'review');
    assert.match(r3.outcome.reasons[0].en, /Musical instruments/);
    const fake = img({ verdict: 'review', confidence: 0.8, flags: ['counterfeit_logo'] });
    assert.equal((await run(mock({ 'fast-model': fake, 'strong-model': fake }))).outcome.status, 'blocked');
  });

  test('a model "block" without a rule is never an automatic rejection', async () => {
    const vague = img({ verdict: 'block', confidence: 0.9 });
    assert.equal((await run(mock({ 'fast-model': vague, 'strong-model': vague }))).outcome.status, 'review');
  });

  test('never fail open: if the stronger model is unavailable or unreadable, the image stays pending', async () => {
    const fastBlock = img({ verdict: 'block', confidence: 0.99, rule_hits: [{ code: 'adult_immodest', confidence: 0.99 }] });
    const down = await run(mock({ 'fast-model': fastBlock, 'strong-model': 'throw' }));
    assert.equal(down.outcome.status, 'pending');
    assert.ok(down.runs.some((r) => r.stage === 'strong' && r.verdict === 'error'));
    const garbled = await run(mock({ 'fast-model': 'I think it is fine', 'strong-model': 'also fine' }));
    assert.equal(garbled.outcome.status, 'pending');
    const allDown = await run(mock({}));
    assert.equal(allDown.outcome.status, 'pending');
    assert.match(allDown.outcome.reasons[0].ar, /تلقائيًا/);
  });
});

describe('listing screening', () => {
  const quality = scoreListing({
    nameEn: 'Cambodian oud oil, 3 ml', nameAr: 'دهن عود كمبودي ٣ مل',
    descriptionEn: 'Pure Cambodian oud oil distilled from wild agarwood, aged for two years, in a crystal bottle with a fitted case, ready to give.',
    descriptionAr: 'دهن عود كمبودي صافٍ مقطّر من خشب العود البري، معتّق لمدة عامين، في زجاجة كريستال مع علبة مخصّصة جاهزة للإهداء.',
    priceMinor: 45000, photos: [1, 2, 3].map(() => ({ longSidePx: 2400, status: 'passed' as const, flags: [] })),
    attributes: {}, categoryAttributes: [], policy: { min_photos: 3, min_long_side_px: 1600 },
  });
  const listing = {
    name_en: 'Cambodian oud oil, 3 ml', name_ar: 'دهن عود كمبودي ٣ مل',
    description_en: 'Pure Cambodian oud oil distilled from wild agarwood.', description_ar: 'دهن عود كمبودي صافٍ مقطّر من خشب العود البري.',
    category_path: ['Fragrance & oud', 'Oud oil'], category_slug: 'oud-oils', price_sar: '450.00', attributes: {}, made_to_measure: false, seller_country: 'SA', photo_count: 3,
  };
  const cats = [{ slug: 'oud-oils', name_en: 'Oud oil', name_ar: 'دهن العود' }, { slug: 'bakhoor', name_en: 'Bakhoor', name_ar: 'البخور' }];
  const images = [1, 2, 3].map((position) => ({ position, status: 'passed', block: image }));
  const lst = (o: Record<string, unknown> = {}) => JSON.stringify({ verdict: 'pass', confidence: 0.95, rule_hits: [], category_ok: true, suggested_category: null,
    photos: [{ photo: 1, matches: true }], text_issues: [], quran_text_present: false, summary_en: 'Fine', summary_ar: 'جيد', draft: {}, ...o });
  const go = (call: ModelCall, extra: Record<string, unknown> = {}) => screenListing({ listing, images, quality, rules, documents: [], alwaysReview: false,
    categories: cats, settings, models, call, ...extra } as Parameters<typeof screenListing>[0]);

  test('deterministic text checks, with Arabic normalised', () => {
    const hits = textChecks({ name_en: 'Shisha set', name_ar: 'طقم شِيشة', description_en: 'Cures diabetes. Halal-certified. WhatsApp 0551234567', description_ar: '' }, rules);
    const kinds = hits.map((h) => `${h.kind}:${h.field}`);
    assert.ok(kinds.includes('keyword:name_en'));
    assert.ok(kinds.includes('keyword:name_ar'), 'diacritics do not hide a word');
    assert.ok(kinds.includes('claim_medical:description_en'));
    assert.ok(kinds.includes('claim_halal:description_en'));
    assert.ok(kinds.includes('contact:description_en'));
    assert.equal(normalizeArabic('أَحْمَدُ ـــ مكتبة إسلامية'), 'احمد  مكتبه اسلاميه');
    assert.deepEqual(textChecks({ name_en: 'Black abaya', name_ar: 'عباية سوداء', description_en: 'Nida fabric.', description_ar: 'قماش ندى.' }, rules), []);
  });

  test('a fixable problem is rejected straight back to the seller without calling a model, and is not a strike', async () => {
    const call = mock({});
    const { decision } = await go(call, { listing: { ...listing, description_en: 'Order on WhatsApp 0551234567' } });
    assert.equal(decision.verdict, 'block');
    assert.equal(decision.strike, undefined);
    assert.equal(call.calls.length, 0);
    assert.match(decision.reasons[0].ar, /بيانات التواصل/);
  });

  test('a clean listing: fast model only, then the staff queue', async () => {
    const call = mock({ 'fast-model': lst() });
    const { decision, runs } = await go(call);
    assert.equal(decision.verdict, 'pass');
    assert.deepEqual(call.calls, ['fast-model']);
    assert.deepEqual(runs.map((r) => r.stage), ['rules', 'fast', 'final']);
  });

  test('a prohibited listing is blocked with a strike; a restricted one goes to staff with notes', async () => {
    const bad = lst({ verdict: 'block', confidence: 0.9, rule_hits: [{ code: 'tobacco_shisha_vapes', confidence: 0.9 }] });
    const r1 = await go(mock({ 'fast-model': bad, 'strong-model': bad }));
    assert.equal(r1.decision.verdict, 'block');
    assert.equal(r1.decision.strike, 'hard');
    assert.equal(r1.decision.policy_code, 'tobacco_shisha_vapes');
    const restricted = lst({ verdict: 'review', rule_hits: [{ code: 'musical_instruments', confidence: 0.9 }] });
    const r2 = await go(mock({ 'fast-model': restricted, 'strong-model': restricted }));
    assert.equal(r2.decision.verdict, 'review');
    assert.ok(r2.decision.reasons.some((r) => r.code === 'rule_musical_instruments'));
  });

  test('a keyword alone never rejects: "wine red" goes to staff, not back to the seller', async () => {
    const call = mock({ 'fast-model': lst(), 'strong-model': lst() });
    const { decision } = await go(call, { listing: { ...listing, name_en: 'Wine red velvet abaya' } });
    assert.equal(decision.verdict, 'review');
    assert.deepEqual(call.calls, ['fast-model', 'strong-model'], 'a keyword hit is borderline');
  });

  test('halal claims need the certificate; categories that are always reviewed go to staff', async () => {
    const halal = { ...listing, description_en: 'Certified halal dates.' };
    assert.equal((await go(mock({ 'fast-model': lst(), 'strong-model': lst() }), { listing: halal })).decision.verdict, 'block');
    assert.notEqual((await go(mock({ 'fast-model': lst(), 'strong-model': lst() }), { listing: halal, documents: ['halal_certificate'] })).decision.verdict, 'block');
    const r = await go(mock({ 'fast-model': lst() }), { alwaysReview: true });
    assert.equal(r.decision.verdict, 'review');
  });

  test('wrong category and photos that do not match are sent back with what to do', async () => {
    const wrong = lst({ category_ok: false, suggested_category: 'bakhoor', photos: [{ photo: 2, matches: false }] });
    const { decision } = await go(mock({ 'fast-model': wrong, 'strong-model': wrong }));
    assert.equal(decision.verdict, 'block');
    assert.ok(decision.reasons.some((r) => r.code === 'wrong_category' && /البخور/.test(r.ar)));
    assert.ok(decision.reasons.some((r) => r.code === 'photo_mismatch' && r.photo === 2));
  });

  test('the second language can be drafted for the seller to confirm', async () => {
    const d = lst({ draft: { name_ar: 'دهن عود', description_ar: 'وصف' } });
    const { decision } = await go(mock({ 'fast-model': d }));
    assert.equal(decision.draft?.name_ar, 'دهن عود');
  });

  test('never fail open: models down means check pending, unless a fixable problem was already found', async () => {
    const r = await go(mock({}));
    assert.equal(r.decision.verdict, 'error');
    const pendingPhoto = decideListing({ quality, images: [{ position: 1, status: 'pending' }], textHits: [], ai: JSON.parse(lst()), rules, documents: [], alwaysReview: false, categories: cats, currentCategory: 'oud-oils' });
    assert.equal(pendingPhoto.verdict, 'error');
  });
});

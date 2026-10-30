// After-sale text and photos: contact details masked in what customers and sellers write to each other (English and
// Arabic, Arabic-Indic digits), flags for our team, the return reasons a customer is offered, and the photo decisions
// for customers' review and return photos (mocked model answers; no real images).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cleanText, mergeFlags, returnReasons } from '../functions/_shared/aftersale.ts';
import { decideImage, parseImageResult, type Rule } from '../functions/_shared/screening.ts';

describe('cleaning what people write', () => {
  test('contact details are masked and flagged; ordinary text is untouched', () => {
    const c = cleanText('Lovely oud! WhatsApp me on +966 55 123 4567 or write to shop@example.com', 2000);
    assert.equal(c.text.includes('4567'), false);
    assert.equal(c.text.includes('shop@example.com'), false);
    assert.match(c.text, /Lovely oud!/);
    assert.ok(c.masked >= 2);
    assert.deepEqual(c.flags, ['contact_email', 'contact_messaging', 'contact_phone', 'solicit'], '"WhatsApp me" asks to leave the platform');
    assert.deepEqual(cleanText('The bottle arrived with a cracked cap.', 2000), { text: 'The bottle arrived with a cracked cap.', masked: 0, flags: [] });
  });

  test('Arabic: Arabic-Indic digits, messaging apps and invitations to deal outside the platform', () => {
    const c = cleanText('تواصل معي على واتساب ٠٥٥١٢٣٤٥٦٧ للطلب مباشرة', 2000);
    assert.equal(/[٠-٩]{6,}/.test(c.text), false, 'the number is masked');
    assert.ok(c.flags.includes('solicit'));
    assert.ok(c.flags.includes('contact_phone'));
    assert.ok(c.flags.includes('contact_messaging'));
  });

  test('links and handles; length limit; control characters removed; empty stays empty', () => {
    const c = cleanText('See www.my-shop.com or @myshop.official\u0007 for more', 2000);
    assert.doesNotMatch(c.text, /my-shop\.com|@myshop/);
    assert.deepEqual(c.flags, ['contact_handle', 'contact_url']);
    assert.equal(cleanText('x'.repeat(5000), 100).text.length, 100);
    assert.deepEqual(cleanText(null, 100), { text: '', masked: 0, flags: [] });
    assert.deepEqual(cleanText('   ', 100), { text: '', masked: 0, flags: [] });
    assert.deepEqual(mergeFlags(cleanText('a@b.com', 50), cleanText('call me on 0551234567', 50)), ['contact_email', 'contact_phone', 'solicit']);
  });

  test('numbers that are not phone numbers stay', () => {
    assert.deepEqual(cleanText('Order AM-104923-2, 12 ml, 2 bottles, size 56', 2000).flags, []);
  });
});

describe('return reasons offered', () => {
  test('a change of mind only within the window and for items that allow it; problems for 30 days; not received when overdue', () => {
    assert.deepEqual(returnReasons({ delivered: true, overdue: false, policies: ['standard'], changeMindOpen: true, problemOpen: true }),
      ['changed_mind', 'not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received']);
    assert.deepEqual(returnReasons({ delivered: true, overdue: false, policies: ['faulty_only'], changeMindOpen: true, problemOpen: true }),
      ['not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received'], 'made to measure');
    assert.deepEqual(returnReasons({ delivered: true, overdue: false, policies: ['standard'], changeMindOpen: false, problemOpen: false }), []);
    assert.deepEqual(returnReasons({ delivered: false, overdue: true, policies: ['standard'], changeMindOpen: false, problemOpen: false }), ['not_received']);
    assert.deepEqual(returnReasons({ delivered: false, overdue: false, policies: ['standard'], changeMindOpen: false, problemOpen: false }), []);
  });
});

describe('customers\' photos', () => {
  const rules: Rule[] = [
    { code: 'adult_immodest', level: 'prohibited', severity: 'severe', applies_to: 'both', title_en: 'Adult or immodest products and imagery', title_ar: 'غير المحتشم', ai_instruction: 'nudity', keywords: { en: [], ar: [] } },
  ];
  const answer = (o: Record<string, unknown>) => parseImageResult(JSON.stringify({ verdict: 'pass', confidence: 0.95, people: 'none', modest: null, immodest: false,
    rule_hits: [], flags: [], background: 'busy', product: 'a prayer mat', matches_listing: null, summary_en: 'ok', summary_ar: 'جيد', ...o }), rules);

  test('a person in a review photo is refused for privacy, with a reason customers understand', () => {
    const d = decideImage(answer({ people: 'person' }), rules, { allowModels: true, fashion: true, kind: 'review_photo' });
    assert.equal(d.status, 'rejected');
    assert.match(d.reasons[0].en, /For privacy, photos show the item only/);
    assert.match(d.reasons[0].ar, /حفاظًا على الخصوصية/);
  });

  test('a home background and a photo that does not match a listing are fine for customers', () => {
    assert.equal(decideImage(answer({ flags: ['busy_background', 'mismatch'], matches_listing: false }), rules, { allowModels: false, fashion: false, kind: 'return_photo' }).status, 'passed');
    assert.equal(decideImage(answer({ flags: ['mismatch'], matches_listing: false }), rules, { allowModels: false, fashion: false, kind: 'listing_photo' }).status, 'rejected', 'sellers still must match');
  });

  test('contact details on a customer photo are refused; prohibited content is blocked as for anyone', () => {
    assert.equal(decideImage(answer({ flags: ['contact_details'] }), rules, { allowModels: false, fashion: false, kind: 'review_photo' }).status, 'rejected');
    const b = decideImage(answer({ immodest: true, confidence: 0.95 }), rules, { allowModels: false, fashion: false, kind: 'review_photo' });
    assert.equal(b.status, 'blocked');
    assert.equal(b.policy_code, 'adult_immodest');
  });
});

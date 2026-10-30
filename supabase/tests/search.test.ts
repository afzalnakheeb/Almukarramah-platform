// The in-memory search the website uses before switch-on (and in the screenshot build): the same rules as mp_search.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeForSearch, searchLocal, type SearchDoc } from '../functions/_shared/search.ts';

const doc = (id: string, f: Partial<SearchDoc>): SearchDoc => ({
  id, slug: id, name_en: '', name_ar: '', price: 10000, category_slug: 'oud-oils', category_path: ['fragrance-oud', 'oud-oils'], seller_slug: null, ...f,
});
const docs: SearchDoc[] = [
  doc('royal', { name_en: 'Royal oud oil', name_ar: 'دهن العود الملكي', price: 90000, seller_slug: 'a', attributes: { oud_origin: 'hindi', volume_ml: 12, contains_alcohol: false }, rating_avg: 4.6 }),
  doc('cambodi', { name_en: 'Cambodi oud', name_ar: 'دهن عُود كمبودي', price: 45000, seller_slug: 'a', attributes: { oud_origin: 'cambodi', volume_ml: 3, contains_alcohol: false }, featured: true }),
  doc('rose', { name_en: 'Taif rose spray', name_ar: 'عطر الورد الطائفي', price: 32000, category_slug: 'perfumes', category_path: ['fragrance-oud', 'perfumes'], seller_slug: 'b',
    attributes: { volume_ml: 50, contains_alcohol: true, notes: ['rose', 'musk'] } }),
  doc('mat', { name_en: 'Kaaba door prayer mat', name_ar: 'سجادة صلاة باب الكعبة', price: 29500, category_slug: 'prayer-mats', category_path: ['prayer-worship', 'prayer-mats'] }),
];
const ids = (r: { items: SearchDoc[] }) => r.items.map((d) => d.id).sort();

describe('normalising', () => {
  test('diacritics, tatweel, letter variants and digits', () => {
    assert.equal(normalizeForSearch('  دهن العُود  الملكيّ '), 'دهن العود الملكي');
    assert.equal(normalizeForSearch('أُمّ إبراهيم آمنة ٱلقدس'), 'ام ابراهيم امنه القدس');
    assert.equal(normalizeForSearch('مكتبةـــ ليلى ٣٠ ۱۲'), 'مكتبه ليلي 30 12');
    assert.equal(normalizeForSearch('TAIF Rose'), 'taif rose');
  });
});

describe('local search', () => {
  test('words match as prefixes, in either language, with or without diacritics', () => {
    assert.deepEqual(ids(searchLocal(docs, { q: 'oud' })), ['cambodi', 'royal']);
    assert.deepEqual(ids(searchLocal(docs, { q: 'الملكى' })), ['royal']);
    assert.deepEqual(ids(searchLocal(docs, { q: 'عود كمبودى' })), ['cambodi']);
    assert.deepEqual(ids(searchLocal(docs, { q: 'tai' })), ['rose'], 'attribute keys such as contains_alcohol are not searched');
    assert.deepEqual(ids(searchLocal(docs, { q: 'hindi' })), ['royal'], 'attribute values are');
    assert.deepEqual(ids(searchLocal(docs, { q: 'nothing like this' })), []);
  });

  test('category paths, sellers, prices, ratings and attributes', () => {
    assert.deepEqual(ids(searchLocal(docs, { category: 'fragrance-oud' })), ['cambodi', 'rose', 'royal']);
    assert.deepEqual(ids(searchLocal(docs, { seller: 'b' })), ['rose']);
    assert.deepEqual(ids(searchLocal(docs, { min_price: 30000, max_price: 50000 })), ['cambodi', 'rose']);
    assert.deepEqual(ids(searchLocal(docs, { rating_min: 4 })), ['royal']);
    assert.deepEqual(ids(searchLocal(docs, { attributes: { oud_origin: ['hindi', 'cambodi'] } })), ['cambodi', 'royal']);
    assert.deepEqual(ids(searchLocal(docs, { attributes: { contains_alcohol: [true] } })), ['rose']);
    assert.deepEqual(ids(searchLocal(docs, { attributes: { volume_ml: { min: 10 } } })), ['rose', 'royal']);
    assert.deepEqual(ids(searchLocal(docs, { attributes: { notes: ['musk'] } })), ['rose']);
  });

  test('facets, sorting and pages', () => {
    const r = searchLocal(docs, { category: 'fragrance-oud' }, ['oud_origin', 'volume_ml']);
    assert.deepEqual(r.facets.sellers, [{ value: 'a', count: 2 }, { value: 'b', count: 1 }]);
    assert.deepEqual(r.facets.attributes.oud_origin, [{ value: 'cambodi', count: 1 }, { value: 'hindi', count: 1 }]);
    assert.deepEqual(r.facets.attributes.volume_ml, { min: 3, max: 50 });
    assert.deepEqual(r.facets.price, { min: 32000, max: 90000 });
    assert.deepEqual(searchLocal(docs, { sort: 'price_asc' }).items.map((d) => d.price), [29500, 32000, 45000, 90000]);
    assert.deepEqual(searchLocal(docs, { sort: 'price_desc', page_size: 2, page: 2 }).items.map((d) => d.id), ['rose', 'mat']);
    assert.equal(searchLocal(docs, {}).items[0].id, 'cambodi', 'featured first when nothing is typed');
  });
});

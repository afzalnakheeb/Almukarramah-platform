// M5: variants and stock, the price guard, the review fields kept private, search (Arabic normalisation, filters,
// facets, sorting) and storefronts.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { normalizeForSearch } from '../functions/_shared/search.ts';
import { type Db, freshDb, ids, seedPeople, seedSellers, staffRoles, user } from './lib/db.ts';

let db: Db;
let A = '';
let B = '';
const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);
type Search = {
  total: number; items: { slug: string; price_from: number; seller: { slug: string } | null }[];
  facets: { categories: { slug: string; count: number }[]; sellers: { slug: string; count: number }[]; house: number; price: { min: number; max: number };
            attributes: { key: string; type: string; values: { value: string; count: number; en: string; ar: string }[] | { min: number; max: number } }[] };
};
const search = (p: Record<string, unknown>, as: Parameters<Db['val']>[1] = 'anon') => db.val<Search>(`select mp_search('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`, as);
const slugs = (r: Search) => r.items.map((x) => x.slug).sort();

/** A listing by a seller, then put live as the approval function would. */
function live(seller: string, who: 'sellerA' | 'sellerB', f: { slug: string; name_en: string; name_ar: string; price: number; category: string; attributes?: object; description_en?: string }) {
  const id = db.val<string>(`insert into products (slug, name_en, name_ar, description_en, base_price_sar, seller_id, category_id, attributes)
    values ('${f.slug}', '${f.name_en}', '${f.name_ar}', '${f.description_en ?? ''}', ${f.price}, '${seller}', '${cat(f.category)}', '${JSON.stringify(f.attributes ?? {})}') returning id`, user(who));
  db.exec(`update products set listing_status = 'approved', is_active = true, ai_checked_at = now() where id = '${id}';
           insert into listing_reviews (product_id, review_note, ai_check) values ('${id}', 'Approved', '{"verdict": "pass", "reasons": []}')`, 'service');
  return id;
}

let royal = '';
let cambodi = '';
let draft = '';

before(() => {
  db = freshDb('m5');
  seedPeople(db);
  ({ A, B } = seedSellers(db));
  db.exec(`update sellers set slug = 'oud-house-a' where id = '${A}'; update sellers set slug = 'prayer-house-b' where id = '${B}';`, 'service');
  royal = live(A, 'sellerA', { slug: 'royal-oud', name_en: 'Royal oud oil 12 ml', name_ar: 'دهن العود الملكي ١٢ مل', price: 90000, category: 'oud-oils',
    attributes: { brand: 'Oud House', volume_ml: 12, contains_alcohol: false, concentration: 'pure_oil', oud_origin: 'hindi' }, description_en: 'Aged Hindi oud' });
  cambodi = live(A, 'sellerA', { slug: 'cambodi-oud', name_en: 'Cambodi oud oil 3 ml', name_ar: 'دهن عُود كمبودي ٣ مل', price: 45000, category: 'oud-oils',
    attributes: { brand: 'Oud House', volume_ml: 3, contains_alcohol: false, concentration: 'pure_oil', oud_origin: 'cambodi' } });
  live(B, 'sellerB', { slug: 'muattar-bakhoor', name_en: 'Muattar bakhoor 40 g', name_ar: 'بخور معطّر ٤٠ غرام', price: 18000, category: 'bakhoor',
    attributes: { brand: 'Prayer House', weight_g: 40, form: 'muattar' } });
  live(B, 'sellerB', { slug: 'rose-spray', name_en: 'Taif rose eau de parfum 50 ml', name_ar: 'ماء عطر الورد الطائفي ٥٠ مل', price: 32000, category: 'perfumes',
    attributes: { brand: 'Prayer House', volume_ml: 50, contains_alcohol: true, concentration: 'edp' } });
  draft = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('secret-oud', 'Secret oud draft', 'مسودة', 10000, '${A}', '${cat('oud-oils')}') returning id`, user('sellerA'));
});
after(() => db.drop());

describe('Arabic normalisation', () => {
  test('the database and the app normalise text the same way', () => {
    const cases = ['دهن العُود الملكيّ', 'إبريق أُمّ ٣ ملّ', 'مكتبة ـ الحرمين', 'هدية ليلى', 'Taif ROSE  Oil', 'عطر ۱۲ مل', 'ٱلرحمن'];
    for (const c of cases) assert.equal(db.val(`select private.ar_normalize('${c}')`), normalizeForSearch(c), c);
    assert.equal(normalizeForSearch('دهن العُود الملكيّ'), 'دهن العود الملكي');
    assert.equal(normalizeForSearch('هدية ليلى'), 'هديه ليلي');
    assert.equal(normalizeForSearch('عطر ٣ مل'), 'عطر 3 مل');
  });
});

describe('search', () => {
  test('English and Arabic, with or without diacritics and letter variants, and word prefixes', () => {
    assert.deepEqual(slugs(search({ q: 'oud' })).filter((s) => s !== 'cambodi-oud-oil-3ml'), ['cambodi-oud', 'royal-oud']);
    assert.deepEqual(slugs(search({ q: 'الملكى' })), ['royal-oud'], 'alef maqsura');
    assert.deepEqual(slugs(search({ q: 'عود كمبودى' })).filter((s) => s !== 'cambodi-oud-oil-3ml'), ['cambodi-oud'], 'diacritics in the listing, none in the query');
    assert.deepEqual(slugs(search({ q: 'معطر' })), ['muattar-bakhoor'], 'shadda');
    assert.deepEqual(slugs(search({ q: 'tai' })), ['rose-spray'], 'prefix');
    assert.deepEqual(slugs(search({ q: 'hindi' })), ['royal-oud'], 'attribute values and descriptions are searched');
    assert.equal(search({ q: 'secret' }).total, 0, 'drafts never appear');
    assert.equal(search({ q: "o'ud & | !" }).total >= 0, true, 'operators are harmless');
  });

  test('category (with everything under it), seller, price, rating and attribute filters', () => {
    assert.deepEqual(slugs(search({ category: 'oud-oils' })), ['cambodi-oud', 'cambodi-oud-oil-3ml', 'royal-oud']);
    assert.ok(slugs(search({ category: 'fragrance-oud' })).includes('muattar-bakhoor'), 'a department includes its categories');
    assert.deepEqual(slugs(search({ seller: 'prayer-house-b' })), ['muattar-bakhoor', 'rose-spray']);
    assert.equal(search({ seller: 'nobody' }).total, 0);
    assert.deepEqual(slugs(search({ category: 'fragrance-oud', min_price: 30000, max_price: 50000 })), ['aam-zumar-60-ml', 'cambodi-oud', 'cambodi-oud-oil-3ml', 'rose-spray']);
    assert.deepEqual(slugs(search({ category: 'oud-oils', attributes: { oud_origin: ['hindi'] } })), ['royal-oud']);
    assert.deepEqual(slugs(search({ category: 'fragrance-oud', attributes: { contains_alcohol: true } })), ['rose-spray']);
    assert.deepEqual(slugs(search({ category: 'fragrance-oud', attributes: { volume_ml: { min: 10, max: 60 } } })), ['rose-spray', 'royal-oud']);
    db.exec(`update products set rating_avg = 4.6, rating_count = 12 where id = '${royal}'`, 'service');
    assert.deepEqual(slugs(search({ rating_min: 4 })), ['royal-oud']);
  });

  test('facets count the results; attribute facets carry their labels', () => {
    const r = search({ category: 'fragrance-oud' });
    assert.deepEqual(r.facets.sellers.map((s) => [s.slug, s.count]), [['oud-house-a', 2], ['prayer-house-b', 2]]);
    assert.ok(r.facets.house >= 2, 'our own products are included');
    assert.equal(r.facets.categories.find((c) => c.slug === 'oud-oils')?.count, 3);
    const conc = r.facets.attributes.find((a) => a.key === 'concentration')!;
    assert.deepEqual((conc.values as { value: string; count: number; en: string }[]).map((v) => [v.value, v.count, v.en]), [['pure_oil', 2, 'Pure oil'], ['edp', 1, 'Eau de parfum']]);
    assert.deepEqual(r.facets.attributes.find((a) => a.key === 'volume_ml')?.values, { min: 3, max: 50 });
    assert.equal(r.facets.price.min, 18000);
  });

  test('sorting and pages', () => {
    const asc = search({ category: 'fragrance-oud', sort: 'price_asc' }).items.map((x) => x.price_from);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = search({ category: 'fragrance-oud', sort: 'price_desc' }).items.map((x) => x.price_from);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    const p1 = search({ category: 'fragrance-oud', sort: 'price_asc', page_size: 2, page: 1 });
    const p2 = search({ category: 'fragrance-oud', sort: 'price_asc', page_size: 2, page: 2 });
    assert.equal(p1.items.length, 2);
    assert.notDeepEqual(p1.items.map((x) => x.slug), p2.items.map((x) => x.slug));
    assert.equal(p1.total, p2.total);
  });

  test('a suspended seller disappears from search', () => {
    db.exec(`update sellers set status = 'suspended' where id = '${B}'`, 'service');
    assert.equal(search({ seller: 'prayer-house-b' }).total, 0);
    db.exec(`update sellers set status = 'approved' where id = '${B}'`, 'service');
    assert.equal(search({ seller: 'prayer-house-b' }).total, 2);
  });
});

describe('review fields stay private', () => {
  test('nobody reads AI notes or review notes through the API; sellers and staff get their own through the function', () => {
    // they are not on products (which every client reads with select *: review H4) but in listing_reviews
    for (const who of ['anon', user('customer')] as const) {
      assert.equal(db.rows(`select 1 from listing_reviews where product_id = '${royal}'`, who).length, 0);
      assert.ok(!('review_note' in db.one<Record<string, unknown>>(`select * from products where id = '${royal}'`, who)));
    }
    assert.equal(db.rows(`select 1 from listing_reviews where product_id = '${royal}'`, user('sellerB')).length, 0);
    assert.match(db.error(`update listing_reviews set review_note = 'mine' where product_id = '${royal}'`, user('sellerA')) ?? '', /permission denied/);
    assert.equal(db.val(`select name_en from products where id = '${royal}'`, 'anon'), 'Royal oud oil 12 ml');
    const mine = db.val<{ id: string; review_note: string }[]>(`select mp_listing_private(array['${royal}', '${draft}']::uuid[])`, user('sellerA'));
    assert.equal(mine.length, 2);
    assert.equal(mine.find((x) => x.id === royal)?.review_note, 'Approved');
    assert.deepEqual(db.val(`select mp_listing_private(array['${royal}']::uuid[])`, user('sellerB')), []);
    for (const r of staffRoles) assert.equal(db.val<unknown[]>(`select mp_listing_private(array['${royal}']::uuid[])`, user(r)).length, 1, r);
    assert.match(db.error(`select mp_listing_private(array['${royal}']::uuid[])`, 'anon') ?? '', /permission denied/);
  });
});

describe('the price guard and variants', () => {
  test('a small price change stays live; a big one goes back to our team; other changes go back to draft', () => {
    db.exec(`update products set base_price_sar = 95000 where id = '${royal}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${royal}'`), 'approved', '+5.6%');
    db.exec(`update products set base_price_sar = 140000 where id = '${royal}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${royal}'`), 'pending_review');
    // compared with the price our team approved (90000), not the last step (review M1)
    assert.equal(db.val<{ review_note: string }[]>(`select mp_listing_private(array['${royal}']::uuid[])`, user('sellerA'))[0].review_note,
      'Price changed from 90000 (approved) to 140000 halalas (56%).');
    assert.equal(search({ q: 'royal' }).total, 0, 'off sale until approved');
    db.exec(`update products set listing_status = 'approved' where id = '${royal}'`, 'service');
    db.exec(`update products set description_en = 'Aged Hindi oud, ten years' where id = '${royal}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${royal}'`), 'draft');
    assert.match(db.error(`update products set rating_avg = 5, rating_count = 999 where id = '${cambodi}'`, user('sellerA')) ?? 'ignored', /ignored/);
    assert.deepEqual(db.one(`select rating_avg, rating_count from products where id = '${cambodi}'`), { rating_avg: null, rating_count: 0 });
  });

  test('variants: their own stock (summed on the product) and price; the same guard applies', () => {
    const v = (label: string, price: number | null, stock: number) => db.val<string>(`insert into product_variants (product_id, label_en, label_ar, price_minor, stock, options)
      values ('${royal}', '${label}', '${label}', ${price ?? 'null'}, ${stock}, '{"volume_ml": ${parseInt(label)}}') returning id`, user('sellerA'));
    const v6 = v('6 ml', 52000, 4);
    v('12 ml', null, 7);
    assert.equal(db.val(`select stock from products where id = '${royal}'`), 11);
    assert.match(db.error(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${royal}', 'x', 'x', 1)`, user('sellerB')) ?? '', /row-level security/);
    assert.equal(db.rows(`select 1 from product_variants where product_id = '${royal}'`, 'anon').length, 0, 'not visible while a draft');
    db.exec(`update products set listing_status = 'approved' where id = '${royal}'`, 'service');
    assert.equal(db.rows(`select 1 from product_variants where product_id = '${royal}'`, 'anon').length, 2);
    assert.equal(search({ q: 'royal' }).items[0].price_from, 52000, 'from the cheapest option');
    db.exec(`update product_variants set stock = 1 where id = '${v6}'`, user('sellerA'));
    assert.deepEqual(db.one(`select listing_status, stock from products where id = '${royal}'`), { listing_status: 'approved', stock: 8 });
    db.exec(`update product_variants set price_minor = 80000 where id = '${v6}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${royal}'`), 'pending_review', '+54%');
    db.exec(`update products set listing_status = 'approved' where id = '${royal}'`, 'service');
    db.exec(`update product_variants set label_en = '6 ml travel' where id = '${v6}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${royal}'`), 'draft');
  });
});

describe('storefronts', () => {
  test('the public profile of an approved seller, with what they sell; logos only once published', () => {
    db.exec(`update sellers set logo = '${A}/media/11111111-2222-4333-8444-555555555555.png' where id = '${A}'`, user('sellerA'));
    const s = db.val<{ seller: { slug: string; logo: string | null }; listings: number; categories: { slug: string }[] }>(`select mp_storefront('oud-house-a')`, 'anon');
    assert.equal(s.seller.slug, 'oud-house-a');
    assert.equal(s.seller.logo, null, 'a private file is not shown');
    assert.equal(s.listings, 1);
    assert.deepEqual(s.categories.map((c) => c.slug), ['oud-oils']);
    assert.equal(db.val(`select mp_storefront('nobody')`, 'anon'), null);
    db.exec(`update sellers set status = 'suspended' where id = '${A}'`, 'service');
    assert.equal(db.val(`select mp_storefront('oud-house-a')`, 'anon'), null);
    db.exec(`update sellers set status = 'approved' where id = '${A}'`, 'service');
    assert.ok(ids.owner);
  });
});

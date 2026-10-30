// M2: the category tree and its inherited policies and attributes, the Islamic standard policy rows, marketplace
// settings, document types and garment styles: who can read and change what, and how policies inherit.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, user } from './lib/db.ts';

let db: Db;
let A = '';
const cat = (slug: string) => `(select id from categories where slug = '${slug}')`;

before(() => {
  db = freshDb('m2');
  seedPeople(db);
  ({ A } = seedSellers(db));
});
after(() => db.drop());

describe('category tree', () => {
  test('existing collections keep their names and pages and join the tree', () => {
    const rows = db.rows<{ slug: string; name_en: string; parent: string; listable: boolean }>(
      `select c.slug, c.name_en, p.slug as parent, c.listable from categories c join categories p on p.id = c.parent_id
       where c.slug in ('perfumes', 'oud-oils', 'prayer-mats', 'dates', 'fragrance') order by c.slug`, 'anon');
    assert.deepEqual(rows.map((r) => `${r.slug}>${r.parent}:${r.name_en}:${r.listable}`), [
      'dates>dates-food:Madinah Dates:true', 'fragrance>fragrance-oud:Oud and fragrance:false', 'oud-oils>fragrance-oud:Oud and Perfume Oils:true',
      'perfumes>fragrance-oud:Perfumes:true', 'prayer-mats>prayer-worship:Prayer Mats:true']);
  });

  test('ten departments, sellers list only in categories', () => {
    const tree = db.val<{ slug: string; kind: string; listable: boolean }[]>(`select mp_category_tree()`, 'anon');
    assert.equal(tree.filter((c) => c.kind === 'department').length, 10);
    assert.equal(tree.filter((c) => c.kind === 'group').length, 3);
    assert.ok(tree.filter((c) => c.kind !== 'category').every((c) => !c.listable));
    assert.ok(tree.filter((c) => c.listable).length >= 40);
  });

  test('policies inherit: department, then category; marketplace defaults underneath', () => {
    const spray = db.val<Record<string, unknown>>(`select mp_category_policy(${cat('perfumes')})`, 'anon');
    assert.equal(spray.dangerous_goods, true);
    assert.deepEqual(spray.ship_to_countries, ['SA']);
    assert.equal(spray.return_policy, 'unopened_only', 'from the department');
    assert.equal(spray.commission_bps, 2500, 'marketplace default');
    const thobes = db.val<Record<string, unknown>>(`select mp_category_policy(${cat('thobes')})`, 'anon');
    assert.equal(thobes.min_photos, 5);
    assert.equal(thobes.allow_made_to_measure, true);
    assert.equal(thobes.mtm_return_policy, 'faulty_only');
    assert.deepEqual((thobes.path as { slug: string }[]).map((p) => p.slug), ['modest-fashion', 'mens-fashion', 'thobes']);
    const mushaf = db.val<Record<string, unknown>>(`select mp_category_policy(${cat('mushaf')})`, 'anon');
    assert.deepEqual(mushaf.required_documents, ['printer_licence']);
    assert.equal(mushaf.always_review, true);
  });

  test('attributes inherit; a category can hide or relax an inherited one', () => {
    const keys = (slug: string) => db.val<{ key: string; required: boolean }[]>(`select mp_category_attributes(${cat(slug)})`, 'anon')
      .map((a) => `${a.key}${a.required ? '*' : ''}`);
    assert.deepEqual(keys('perfumes'), ['brand*', 'brand_relationship*', 'origin_country*', 'volume_ml*', 'contains_alcohol*', 'notes*', 'concentration*']);
    assert.ok(!keys('incense-burners').some((k) => k.startsWith('volume_ml')), 'hidden for incense burners');
    assert.ok(keys('bakhoor').includes('notes') && keys('bakhoor').includes('weight_g*'));
    assert.ok(keys('dates').includes('best_before*') && keys('dates').includes('variety*'));
  });

  test('requirements for the listing form bring documents and permits', () => {
    const r = db.val<{ documents: { code: string }[]; permits: { permit_key: string }[] }>(`select mp_category_requirements(${cat('sweets')})`, user('sellerA'));
    assert.deepEqual(r.documents.map((d) => d.code), ['halal_certificate']);
    assert.deepEqual(r.permits.map((p) => p.permit_key), ['sfda_food']);
    const oil = db.val<{ permits: { permit_key: string }[] }>(`select mp_category_requirements(${cat('attar')})`, 'anon');
    assert.deepEqual(oil.permits.map((p) => p.permit_key), ['sfda_ecosma']);
  });

  test('marketing may rename a category but only owner or manager change its policy', () => {
    assert.equal(db.count(`update categories set name_en = 'Attar & perfume oils' where slug = 'attar'`, user('marketing')), 1);
    assert.match(db.error(`update categories set commission_bps = 3000 where slug = 'attar'`, user('marketing')) ?? '', /owner or a manager/);
    assert.match(db.error(`update categories set required_documents = '{}' where slug = 'mushaf'`, user('marketing')) ?? '', /owner or a manager/);
    assert.equal(db.count(`update categories set commission_bps = 3000 where slug = 'attar'`, user('manager')), 1);
    assert.match(db.error(`update categories set commission_bps = 6000 where slug = 'attar'`, user('owner')) ?? '', /check constraint/);
    assert.equal(db.count(`update categories set name_en = 'x' where slug = 'attar'`, user('support')), 0);
    assert.equal(db.count(`update categories set name_en = 'x' where slug = 'attar'`, user('sellerA')), 0);
    assert.ok(db.val<number>(`select count(*) from audit_log where table_name = 'categories'`) >= 2);
    assert.match(db.error(`insert into category_attributes (category_id, key, label_en, label_ar, type) values (${cat('attar')}, 'x_key', 'X', 'س', 'text')`, user('marketing')) ?? '', /row-level security/);
    assert.equal(db.error(`insert into category_attributes (category_id, key, label_en, label_ar, type) values (${cat('attar')}, 'x_key', 'X', 'س', 'text')`, user('manager')), null);
  });

  test('commission: negotiated seller rate, else category, else default', () => {
    assert.equal(db.val(`select mp_commission_bps('${A}', ${cat('attar')})`), 3000);
    assert.equal(db.val(`select mp_commission_bps('${A}', ${cat('tasbih')})`), 2500);
    db.exec(`update sellers set commission_bps = 4000 where id = '${A}'`, user('owner'));
    assert.equal(db.val(`select mp_commission_bps('${A}', ${cat('attar')})`), 4000);
    assert.match(db.error(`select mp_commission_bps('${A}', ${cat('attar')})`, user('sellerA')) ?? '', /permission denied/);
  });
});

describe('the Islamic standard', () => {
  test('policy rows are staff-only; the public guidance leaves out keywords and AI instructions', () => {
    assert.equal(db.rows(`select 1 from policy_rules`, 'anon').length, 0);
    assert.equal(db.rows(`select 1 from policy_rules`, user('sellerA')).length, 0);
    assert.ok(db.rows(`select 1 from policy_rules`, user('support')).length >= 20);
    const g = db.val<{ rules: Record<string, unknown>[] }>(`select mp_guidance()`, 'anon');
    assert.ok(g.rules.length >= 20);
    assert.ok(g.rules.every((r) => !('keywords' in r) && !('ai_instruction' in r)));
    const levels = new Set(g.rules.map((r) => r.level));
    assert.deepEqual([...levels].sort(), ['prohibited', 'restricted']);
    const prohibited = g.rules.filter((r) => r.level === 'prohibited').map((r) => r.code);
    for (const code of ['alcohol_drinks', 'pork_non_halal', 'gambling', 'drugs', 'weapons', 'adult_immodest', 'idols_other_worship',
      'sorcery_fortune', 'counterfeit', 'zamzam', 'sacred_text_misuse', 'gold_silk_men', 'tobacco_shisha_vapes']) {
      assert.ok(prohibited.includes(code), code);
    }
    const restricted = g.rules.filter((r) => r.level === 'restricted');
    assert.ok(restricted.every((r) => r.needs_scholar_confirmation === true), 'contested items wait for the scholar');
  });

  test('only owner and manager edit the standard, and every change is audited with its author', () => {
    assert.equal(db.count(`update policy_rules set active = false where code = 'musical_instruments'`, user('operations')), 0);
    assert.equal(db.count(`update policy_rules set active = false where code = 'musical_instruments'`, user('marketing')), 0);
    assert.equal(db.count(`update policy_rules set scholar_confirmed_by = 'Sheikh X', scholar_confirmed_at = now() where code = 'musical_instruments'`, user('manager')), 1);
    assert.equal(db.val(`select updated_by from policy_rules where code = 'musical_instruments'`), ids.manager);
    assert.equal(db.val(`select count(*) from audit_log where table_name = 'policy_rules' and action = 'UPDATE'`), 1);
    const g = db.val<{ rules: { code: string; needs_scholar_confirmation: boolean }[] }>(`select mp_guidance()`, 'anon');
    assert.equal(g.rules.find((r) => r.code === 'musical_instruments')!.needs_scholar_confirmation, false);
  });
});

describe('settings, documents and styles', () => {
  test('marketplace settings: staff read, owner/manager change (audited), the public sees a safe subset', () => {
    assert.equal(db.rows(`select 1 from mp_settings`, user('sellerA')).length, 0);
    assert.equal(db.val(`select allow_modest_models_in_fashion from mp_settings`, user('support')), false, 'no human models by default');
    assert.equal(db.count(`update mp_settings set min_quality_score = 10`, user('support')), 0);
    assert.equal(db.count(`update mp_settings set min_quality_score = 75`, user('owner')), 1);
    assert.match(db.error(`update mp_settings set default_commission_bps = 1000`, user('owner')) ?? '', /check constraint/);
    const pub = db.val<Record<string, unknown>>(`select mp_public_settings()`, 'anon');
    assert.equal(pub.min_quality_score, 75);
    assert.equal('escalate_below_confidence' in pub, false, 'internal screening settings stay internal');
    assert.ok('perf_thresholds' in pub, 'sellers see the performance thresholds');
    assert.equal(db.val(`select count(*) from audit_log where table_name = 'mp_settings'`), 1);
  });

  test('document types and garment styles are public; only owner/manager edit them', () => {
    assert.ok(db.rows(`select code from document_types`, 'anon').length >= 15);
    const styles = db.rows<{ code: string }>(`select code from garment_styles where active order by sort`, 'anon').map((r) => r.code);
    assert.deepEqual(styles, ['saudi_thobe', 'emirati_kandura', 'kuwaiti_dishdasha', 'omani_dishdasha', 'qatari_thobe', 'bahraini_thobe']);
    assert.equal(db.count(`update garment_styles set active = true where code = 'abaya'`, user('marketing')), 0);
    assert.equal(db.count(`update garment_styles set active = true where code = 'abaya'`, user('manager')), 1);
    assert.equal(db.count(`update document_types set label_en = 'x' where code = 'halal_certificate'`, user('sellerA')), 0);
  });
});

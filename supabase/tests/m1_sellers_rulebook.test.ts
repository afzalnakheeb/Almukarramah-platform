// M1: sellers, listings, the country rulebook, KYC, permits, pickup addresses and storage: row-level security and
// guards, acting as anon, a customer, seller A versus seller B, an applicant and each staff role.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, user } from './lib/db.ts';

let db: Db;
let A = '';
let B = '';

before(() => {
  db = freshDb('m1');
  seedPeople(db);
  ({ A, B } = seedSellers(db));
});
after(() => db.drop());

const product = (seller: string, extra = '') =>
  `insert into products (slug, name_en, name_ar, base_price_sar, seller_id, stock${extra ? ', ' + extra.split('=')[0] : ''})
   values ('p-' || substr(md5(random()::text), 1, 8), 'Oud oil', 'دهن عود', 25000, '${seller}', 5${extra ? ', ' + extra.split('=').slice(1).join('=') : ''}) returning id`;

describe('sellers', () => {
  test('anon reads approved marketplace sellers through public columns only', () => {
    const rows = db.rows<{ slug: string }>(`select slug from sellers order by slug`, 'anon');
    assert.deepEqual(rows.map((r) => r.slug), ['oud-house-a', 'prayer-house-b']);
    assert.match(db.error(`select commission_bps from sellers`, 'anon') ?? '', /permission denied/);
    assert.match(db.error(`select review_note from sellers`, user('customer')) ?? '', /permission denied/);
  });

  test('an applicant applies once; the pending shop is visible only to them and staff', () => {
    const id = db.val<string>(`select apply_as_seller('{"agree": true, "name_en": "New Attar", "country": "SA", "contact_name": "Amina", "product_summary": "attar"}'::jsonb)`, user('applicant'));
    assert.ok(id);
    assert.equal(db.rows(`select id from sellers where id = '${id}'`, 'anon').length, 0);
    assert.equal(db.rows(`select id from sellers where id = '${id}'`, user('customer')).length, 0);
    assert.equal(db.rows(`select id from sellers where id = '${id}'`, user('applicant')).length, 1);
    assert.equal(db.rows(`select id from sellers where id = '${id}'`, user('support')).length, 1);
    const mine = db.val<{ seller: { status: string }; private: Record<string, unknown> }[]>(`select my_sellers()`, user('applicant'));
    assert.equal(mine[0].seller.status, 'pending');
    assert.equal('internal_notes' in mine[0].private, false);
    assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "Again", "country": "SA", "contact_name": "Amina"}'::jsonb)`, user('applicant')) ?? '', /already have a seller account/);
    assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "X", "country": "SA", "contact_name": "Y"}'::jsonb)`, 'anon') ?? '', /permission denied|sign in/i);
  });

  test('a seller cannot approve itself, change commission, kind or country, and the slug locks once approved', () => {
    db.exec(`update sellers set status = 'approved', commission_bps = 2500, kind = 'partner', country = 'AE', slug = 'renamed', name_ar = 'بيت العود' where id = '${A}'`, user('sellerA'));
    const s = db.one<Record<string, unknown>>(`select status, commission_bps, kind, country, slug, name_ar from sellers where id = '${A}'`);
    assert.deepEqual(s, { status: 'approved', commission_bps: null, kind: 'marketplace', country: 'SA', slug: 'oud-house-a', name_ar: 'بيت العود' });
    const pending = db.one<{ id: string }>(`select id from sellers where slug = 'new-attar'`);
    db.exec(`update sellers set status = 'approved' where id = '${pending.id}'`, user('applicant'));
    assert.equal(db.val(`select status from sellers where id = '${pending.id}'`), 'pending');
  });

  test('seller A cannot touch seller B', () => {
    assert.equal(db.count(`update sellers set tagline_en = 'mine now' where id = '${B}'`, user('sellerA')), 0);
    assert.equal(db.rows(`select contact_email from seller_private where seller_id = '${B}'`, user('sellerA')).length, 0);
    assert.equal(db.rows(`select contact_email from seller_private where seller_id = '${A}'`, user('sellerA')).length, 1);
    assert.equal(db.rows(`select user_id from seller_members`, user('sellerA')).length, 1);
    assert.match(db.error(`insert into seller_members (seller_id, user_id) values ('${B}', '${ids.sellerA}')`, user('sellerA')) ?? '', /row-level security/);
  });

  test('seller private details: sellers never edit staff notes; customers and marketing never read them', () => {
    db.exec(`update seller_private set internal_notes = 'trusted', contact_phone = '+966500000000' where seller_id = '${A}'`, user('sellerA'));
    assert.deepEqual(db.one(`select internal_notes, contact_phone from seller_private where seller_id = '${A}'`), { internal_notes: null, contact_phone: '+966500000000' });
    assert.equal(db.rows(`select 1 from seller_private`, user('customer')).length, 0);
    assert.equal(db.rows(`select 1 from seller_private`, user('marketing')).length, 0);
    assert.ok(db.rows(`select 1 from seller_private`, user('support')).length >= 2);
  });

  test('staff powers by role', () => {
    assert.match(db.error(`select admin_sellers()`, user('customer')) ?? '', /Not allowed/);
    assert.ok(Array.isArray(db.val(`select admin_sellers()`, user('support'))));
    assert.match(db.error(`select staff_create_seller('{"name_en": "Partner", "country": "SA"}'::jsonb)`, user('operations')) ?? '', /Not allowed/);
    const pid = db.val<string>(`select staff_create_seller('{"name_en": "Fulfilment Partner", "country": "SA", "kind": "partner"}'::jsonb)`, user('owner'));
    assert.equal(db.val(`select kind from sellers where id = '${pid}'`), 'partner');
    assert.equal(db.rows(`select 1 from sellers where id = '${pid}'`, 'anon').length, 0, 'partners are never public');
    assert.equal(db.count(`update sellers set status = 'suspended' where id = '${B}'`, user('support')), 0);
    assert.match(db.error(`update sellers set commission_bps = 2000 where id = '${B}'`, user('manager')) ?? '', /check constraint/);
  });

  test('seller decisions are audited with the actor', () => {
    db.exec(`select mp_review_seller('${B}', 'suspend', 'Checking the audit trail')`, user('manager'));
    db.exec(`select mp_review_seller('${B}', 'reinstate', 'Checked')`, user('owner'));
    const rows = db.rows<{ actor: string }>(`select actor from audit_log where table_name = 'sellers' and row_id = '${B}' and action = 'UPDATE' order by id desc limit 2`);
    assert.deepEqual(rows.map((r) => r.actor), [ids.owner, ids.manager]);
  });
});

describe('listings', () => {
  let draft = '';
  test('an approved seller adds a draft; staff-only fields are forced', () => {
    draft = db.val<string>(product(A, 'is_featured=true'), user('sellerA'));
    const p = db.one<Record<string, unknown>>(`select listing_status, is_featured, compliance_status, ai_check from products where id = '${draft}'`);
    assert.deepEqual(p, { listing_status: 'draft', is_featured: false, compliance_status: 'pending', ai_check: null });
  });

  test('no listings for another seller or for a seller not yet approved', () => {
    assert.match(db.error(product(B), user('sellerA')) ?? '', /row-level security/);
    const pending = db.val<string>(`select id from sellers where slug = 'new-attar'`);
    assert.match(db.error(product(pending), user('applicant')) ?? '', /row-level security/);
  });

  test('only the server or staff move a listing out of draft', () => {
    for (const st of ['pending_review', 'approved', 'check_pending', 'rejected']) {
      assert.match(db.error(`update products set listing_status = '${st}' where id = '${draft}'`, user('sellerA')) ?? '', /Only Al Mukarramah/);
    }
    assert.equal(db.count(`update products set listing_status = 'pending_review' where id = '${draft}'`, 'service'), 1);
    db.exec(`update products set listing_status = 'draft' where id = '${draft}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${draft}'`), 'draft', 'a seller may withdraw from the queue');
  });

  test('photos must be screened media in the seller folder', () => {
    assert.match(db.error(`update products set images = array['${A}/incoming/x.jpg'] where id = '${draft}'`, user('sellerA')) ?? '', /seller dashboard/);
    assert.match(db.error(`update products set images = array['${B}/media/x.jpg'] where id = '${draft}'`, user('sellerA')) ?? '', /seller dashboard/);
    assert.match(db.error(`update products set images = array['https://evil.example/x.jpg'] where id = '${draft}'`, user('sellerA')) ?? '', /seller dashboard/);
    assert.equal(db.error(`update products set images = array['${A}/media/a1.jpg'] where id = '${draft}'`, user('sellerA')), null);
  });

  test('editing a live listing sends it back; stock does not; compliance edits go to the compliance queue', () => {
    db.exec(`update products set listing_status = 'approved', compliance_status = 'cleared', ai_check = '{"verdict":"pass"}' where id = '${draft}'`, 'service');
    db.exec(`update products set stock = 9 where id = '${draft}'`, user('sellerA'));
    assert.deepEqual(db.one(`select listing_status, stock from products where id = '${draft}'`), { listing_status: 'approved', stock: 9 });
    db.exec(`update products set hs_code = '330749' where id = '${draft}'`, user('sellerA'));
    assert.deepEqual(db.one(`select listing_status, compliance_status from products where id = '${draft}'`), { listing_status: 'approved', compliance_status: 'pending' });
    db.exec(`update products set description_en = 'Changed words' where id = '${draft}'`, user('sellerA'));
    assert.deepEqual(db.one(`select listing_status, ai_check from products where id = '${draft}'`), { listing_status: 'draft', ai_check: null });
  });

  test('visibility: public sees approved listings of approved sellers; B never sees A drafts', () => {
    const live = db.val<string>(product(A), user('sellerA'));
    db.exec(`update products set listing_status = 'approved' where id = '${live}'`, 'service');
    assert.equal(db.rows(`select id from products where id = '${live}'`, 'anon').length, 1);
    assert.equal(db.rows(`select id from products where id = '${draft}'`, 'anon').length, 0);
    assert.equal(db.rows(`select id from products where id = '${draft}'`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select id from products where id = '${draft}'`, user('marketing')).length, 1);
    db.exec(`update sellers set status = 'suspended' where id = '${A}'`, user('owner'));
    assert.equal(db.rows(`select id from products where id = '${live}'`, 'anon').length, 0, 'a suspended seller is hidden');
    db.exec(`select mp_review_seller('${A}', 'reinstate', 'Reviewed with the seller')`, user('owner'));
    assert.equal(db.count(`delete from products where id = '${live}'`, user('sellerA')), 0);
    assert.equal(db.count(`delete from products where id = '${draft}'`, user('sellerA')), 1);
  });

  test('alcohol-based sprays are always dangerous goods', () => {
    const id = db.val<string>(product(A, "ship_class='perfume_spray'"), user('sellerA'));
    db.exec(`update products set dangerous_goods = false where id = '${id}'`, user('sellerA'));
    assert.equal(db.val(`select dangerous_goods from products where id = '${id}'`), true);
  });
});

describe('rulebook tables', () => {
  test('countries are public; corridors, carriers and prices are staff only', () => {
    assert.equal(db.val(`select vat_rate_bp from countries where code = 'SA'`, 'anon'), 1500);
    for (const t of ['corridors', 'carrier_providers', 'carrier_services', 'carrier_rate_cards', 'delivery_prices', 'duty_rates']) {
      assert.equal(db.rows(`select 1 from ${t}`, 'anon').length, 0, `${t} hidden from anon`);
      assert.equal(db.rows(`select 1 from ${t}`, user('sellerA')).length, 0, `${t} hidden from sellers`);
    }
    assert.ok(db.rows(`select 1 from corridors`, user('support')).length > 0);
    const open = db.val<{ from: string; to: string; scope: string }[]>(`select open_corridors()`, 'anon');
    assert.deepEqual(open.map((c) => `${c.scope}:${c.from}>${c.to}`).sort(), ['house:SA>*', 'house:SA>SA', 'marketplace:SA>SA']);
  });

  test('corridors open only with an adviser sign-off, and only owner or manager toggle them', () => {
    const ae = `scope = 'marketplace' and from_country = 'AE' and to_country = 'SA'`;
    assert.equal(db.count(`update corridors set status = 'open' where ${ae}`, user('operations')), 0);
    assert.match(db.error(`update corridors set status = 'open' where ${ae}`, user('manager')) ?? '', /adviser signs off/);
    assert.equal(db.count(`update corridors set status = 'pilot', adviser_name = 'Adviser', adviser_signed_off_at = now(), pilot_seller_ids = array['${A}'::uuid] where ${ae}`, user('manager')), 1);
    assert.match(db.error(`update corridors set vat_mode = 'zero' where ${ae}`, user('owner')) ?? '', /new adviser sign-off/);
    db.exec(`update corridors set status = 'closed' where ${ae}`, user('owner'));
    assert.ok(db.val<number>(`select count(*) from audit_log where table_name = 'corridors'`) >= 2);
  });

  test('carriers: operations manage services; marketing cannot', () => {
    assert.equal(db.count(`update carrier_services set days_max = 4 where code = 'sbx-sa-road'`, user('operations')), 1);
    assert.equal(db.count(`update carrier_services set days_max = 9 where code = 'sbx-sa-road'`, user('marketing')), 0);
    assert.equal(db.count(`update delivery_prices set first_kg_sar = 1 where from_country = 'SA'`, user('operations')), 0, 'customer prices: owner and manager only');
  });
});

describe('KYC, permits and pickup addresses', () => {
  test('documents: own folder only, always pending until staff review, accepted ones stay', () => {
    const doc = db.val<string>(`insert into seller_documents (seller_id, doc_type, path, status) values ('${A}', 'commercial_registration', '${A}/kyc/cr.pdf', 'accepted') returning id`, user('sellerA'));
    assert.equal(db.val(`select status from seller_documents where id = '${doc}'`), 'pending');
    assert.match(db.error(`insert into seller_documents (seller_id, doc_type, path) values ('${B}', 'commercial_registration', '${B}/kyc/x.pdf')`, user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(`insert into seller_documents (seller_id, doc_type, path) values ('${A}', 'commercial_registration', '${B}/kyc/x.pdf')`, user('sellerA')) ?? '', /row-level security/);
    assert.equal(db.count(`update seller_documents set status = 'accepted' where id = '${doc}'`, user('sellerA')), 0);
    assert.equal(db.count(`update seller_documents set status = 'accepted' where id = '${doc}'`, user('manager')), 1);
    assert.equal(db.val(`select reviewed_by from seller_documents where id = '${doc}'`), ids.manager);
    assert.equal(db.count(`delete from seller_documents where id = '${doc}'`, user('sellerA')), 0);
    assert.equal(db.rows(`select 1 from seller_documents`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select 1 from seller_documents`, user('support')).length, 0, 'KYC files: owner, manager and finance');
    assert.equal(db.rows(`select 1 from seller_documents`, user('finance')).length, 1);
  });

  test('KYC status and bank details', () => {
    assert.equal(db.val(`select private.iban_valid('GB82 WEST 1234 5698 7654 32')`), true);
    assert.equal(db.val(`select private.iban_valid('GB82WEST12345698765431')`), false);
    assert.match(db.error(`update seller_private set iban = 'GB82WEST12345698765431' where seller_id = '${A}'`, user('sellerA')) ?? '', /check digits/);
    db.exec(`update seller_private set iban = 'GB82WEST12345698765432', legal_name = 'Oud House A LLC', kyc_status = 'approved' where seller_id = '${A}'`, user('sellerA'));
    assert.equal(db.val(`select kyc_status from seller_private where seller_id = '${A}'`), 'not_started');
    db.exec(`update seller_private set kyc_status = 'submitted' where seller_id = '${A}'`, user('sellerA'));
    assert.equal(db.val(`select kyc_status from seller_private where seller_id = '${A}'`), 'submitted');
    db.exec(`update seller_private set kyc_status = 'approved' where seller_id = '${A}'`, user('manager'));
    db.exec(`update seller_private set account_holder = 'Someone else' where seller_id = '${A}'`, user('sellerA'));
    assert.equal(db.val(`select kyc_status from seller_private where seller_id = '${A}'`), 'submitted', 'a changed bank detail is checked again');
  });

  test('permits: the seller adds the reference, staff verify it, any seller change needs a new check', () => {
    const pid = db.val<string>(product(A), user('sellerA'));
    db.exec(`insert into product_permits (product_id, permit_key, reference, status) values ('${pid}', 'sfda_ecosma', 'ECM-1', 'verified')`, user('sellerA'));
    assert.equal(db.val(`select status from product_permits where product_id = '${pid}'`), 'pending');
    assert.match(db.error(`insert into product_permits (product_id, permit_key, reference) values ('${pid}', 'sfda_food', 'F-1')`, user('sellerB')) ?? '', /row-level security/);
    assert.match(db.error(`insert into product_permits (product_id, permit_key, reference, document_path) values ('${pid}', 'sfda_food', 'F-1', '${B}/f.pdf')`, user('sellerA')) ?? '', /seller dashboard/);
    db.exec(`update product_permits set status = 'verified' where product_id = '${pid}'`, user('operations'));
    assert.equal(db.val(`select reviewed_by from product_permits where product_id = '${pid}'`), ids.operations);
    db.exec(`update product_permits set reference = 'ECM-2' where product_id = '${pid}'`, user('sellerA'));
    assert.equal(db.val(`select status from product_permits where product_id = '${pid}'`), 'pending');
    assert.equal(db.rows(`select 1 from product_permits`, user('customer')).length, 0);
  });

  test('pickup addresses stay in the seller country; provider references are server-only', () => {
    const loc = `insert into seller_locations (seller_id, contact_name, phone, country, city, line1, is_default, provider_refs) values`;
    assert.match(db.error(`${loc} ('${A}', 'Store', '+971500000000', 'AE', 'Dubai', 'Street 1', true, '{}')`, user('sellerA')) ?? '', /registered country/);
    const id = db.val<string>(`${loc} ('${A}', 'Store', '+966500000000', 'SA', 'Madinah', 'King Fahd Rd 1', true, '{"oto": "x"}') returning id`, user('sellerA'));
    assert.deepEqual(db.val(`select provider_refs from seller_locations where id = '${id}'`), {});
    assert.equal(db.rows(`select 1 from seller_locations`, user('sellerB')).length, 0);
    assert.match(db.error(`${loc} ('${A}', 'Store 2', '+966500000001', 'SA', 'Madinah', 'Street 2', true, '{}')`, user('sellerA')) ?? '', /duplicate key/);
  });
});

describe('storage', () => {
  const put = (bucket: string, name: string) => `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`;
  test('seller uploads: own incoming folder only, never overwritten, never public', () => {
    assert.equal(db.error(put('seller-uploads', `${A}/incoming/one.jpg`), user('sellerA')), null);
    assert.match(db.error(put('seller-uploads', `${A}/media/one.jpg`), user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(put('seller-uploads', `${A}/one.jpg`), user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(put('seller-uploads', `${B}/incoming/one.jpg`), user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(put('catalogue', `${A}/one.jpg`), user('sellerA')) ?? '', /row-level security/);
    assert.equal(db.count(`update storage.objects set name = '${A}/media/one.jpg' where name = '${A}/incoming/one.jpg'`, user('sellerA')), 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-uploads'`, 'anon').length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-uploads'`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-uploads'`, user('support')).length, 1);
    db.exec(put('seller-uploads', `${A}/media/screened.jpg`), 'service');
    assert.equal(db.count(`delete from storage.objects where name = '${A}/media/screened.jpg'`, user('sellerA')), 0, 'screened media stay');
    assert.equal(db.count(`delete from storage.objects where name = '${A}/incoming/one.jpg'`, user('sellerA')), 1);
  });

  test('KYC files: own folder; accepted documents cannot be removed', () => {
    assert.equal(db.error(put('seller-kyc', `${A}/vat.pdf`), user('sellerA')), null);
    assert.match(db.error(put('seller-kyc', `${B}/vat.pdf`), user('sellerA')) ?? '', /row-level security/);
    db.exec(put('seller-kyc', `${A}/kyc/cr.pdf`), 'service');
    assert.equal(db.count(`delete from storage.objects where bucket_id = 'seller-kyc' and name = '${A}/kyc/cr.pdf'`, user('sellerA')), 0, 'cr.pdf was accepted');
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-kyc'`, user('marketing')).length, 0);
  });
});

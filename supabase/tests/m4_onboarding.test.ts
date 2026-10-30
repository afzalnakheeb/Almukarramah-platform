// M4: the vetting application, the checklist, KYC and brand documents, categories a seller may list in, samples,
// the request-more-info loop, approval (KYC, sample, corridor), suspension and reinstatement, the review history.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, staffRoles, user } from './lib/db.ts';

let db: Db;
let A = '';
let N = '';      // the applicant's new seller (Saudi)
let E = '';      // a UAE applicant (no open corridor yet)
const hash = (n: number) => n.toString(16).padStart(64, '0');
let n = 0;
const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);

/** A screened portfolio photo, as the screen-image function leaves it. */
function photo(seller: string, status = 'passed'): string {
  n++;
  const id = db.val<string>(`select gen_random_uuid()`);
  db.exec(`insert into media_assets (id, seller_id, kind, path, mime, bytes, width, height, sha256, status)
           values ('${id}', '${seller}', 'portfolio', '${seller}/media/${id}.jpg', 'image/jpeg', 1000, 2000, 2000, '${hash(5000 + n)}', '${status}')`, 'service');
  return `${seller}/media/${id}.jpg`;
}
const checklist = (seller: string, who: Parameters<typeof user>[0] = 'applicant') =>
  db.val<{ complete: boolean; items: { key: string; done: boolean }[] }>(`select mp_application_checklist('${seller}')`, user(who));
const missing = (seller: string, who: Parameters<typeof user>[0] = 'applicant') => checklist(seller, who).items.filter((x) => !x.done).map((x) => x.key);

/** Completes every step of a Saudi applicant's file as the seller would. */
function complete(seller: string, who: Parameters<typeof user>[0]) {
  const pics = [photo(seller), photo(seller), photo(seller)];
  db.exec(`update seller_applications set relationship = 'maker', years_in_business = 6, portfolio = array['${pics.join("','")}'],
             brand_story = '${'We distil oud oils in Madinah from wood we buy from the same growers each season. '.repeat(2)}' where seller_id = '${seller}'`, user(who));
  db.exec(`update seller_private set legal_name = 'Oud Makers Est.', legal_entity_type = 'sole_proprietorship', registration_no = '4650012345',
             tax_registration_no = '300000000000003', iban = 'SA0380000000608010167519', bank_name = 'Al Rajhi Bank', account_holder = 'Oud Makers Est.'
           where seller_id = '${seller}'`, user(who));
  db.exec(`insert into seller_documents (seller_id, doc_type, path) values
             ('${seller}', 'commercial_registration', '${seller}/kyc/cr.pdf'), ('${seller}', 'vat_certificate', '${seller}/kyc/vat.pdf')`, user(who));
  db.exec(`insert into seller_locations (seller_id, contact_name, phone, country, city, line1) values
             ('${seller}', 'Store keeper', '+966500000001', (select country from sellers where id = '${seller}'), 'Madinah', 'King Fahd Road 12')`, user(who));
}

before(() => {
  db = freshDb('m4');
  seedPeople(db);
  ({ A } = seedSellers(db));
});
after(() => db.drop());

describe('the application', () => {
  test('applying opens the file: story, relationship, links and requested categories, with the first event', () => {
    N = db.val<string>(`select apply_as_seller(jsonb_build_object('agree', true, 'name_en', 'Oud Makers', 'country', 'SA', 'city', 'Madinah',
      'contact_name', 'Amina', 'product_summary', 'Oud oils', 'relationship', 'maker', 'years_in_business', '6',
      'links', jsonb_build_array('https://instagram.com/oudmakers'), 'categories', jsonb_build_array('${cat('fragrance-oud')}', '${cat('calligraphy')}')))`, user('applicant'));
    assert.deepEqual(db.one(`select relationship, years_in_business, links from seller_applications where seller_id = '${N}'`),
      { relationship: 'maker', years_in_business: 6, links: ['https://instagram.com/oudmakers'] });
    assert.equal(db.val(`select count(*) from seller_categories where seller_id = '${N}' and status = 'requested'`), 2);
    assert.equal(db.val(`select kind from seller_review_events where seller_id = '${N}'`, user('owner')), 'applied');
    assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "Elsewhere", "country": "FR", "contact_name": "Xavier"}'::jsonb)`, user('customer')) ?? '', /that country/);
    assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "Bad link", "country": "SA", "contact_name": "Xavier", "links": ["http://plain.example"]}'::jsonb)`, user('customer')) ?? '', /https/);
  });

  test('the checklist lists what is missing and the file cannot be sent until it is complete', () => {
    assert.deepEqual(missing(N), ['story', 'portfolio', 'business', 'tax', 'bank', 'documents', 'pickup']);
    assert.match(db.error(`select submit_seller_application('${N}')`, user('applicant')) ?? '', /complete every step/);
    assert.match(db.error(`select mp_application_checklist('${N}')`, user('sellerA')) ?? '', /Not allowed/);
    assert.match(db.error(`select mp_application_checklist('${N}')`, 'anon') ?? '', /permission denied/);
    // a rejected photo or a short story does not count
    const bad = photo(N, 'rejected');
    db.exec(`update seller_applications set portfolio = array['${bad}'], brand_story = 'Oud.' where seller_id = '${N}'`, user('applicant'));
    assert.ok(missing(N).includes('portfolio') && missing(N).includes('story'));
    assert.match(db.error(`update seller_applications set portfolio = array['https://elsewhere.example/a.jpg'] where seller_id = '${N}'`, user('applicant')) ?? '', /seller dashboard/);
    assert.match(db.error(`update sellers set status = 'approved' where id = '${N}'`, user('applicant')) ?? 'kept', /kept/);
    assert.equal(db.val(`select status from sellers where id = '${N}'`), 'pending');
    complete(N, 'applicant');
    assert.deepEqual(missing(N), []);
  });

  test('a seller never sets the sample decision or the submission time', () => {
    db.exec(`update seller_applications set sample_status = 'passed', sample_note = 'fine', submitted_at = now() where seller_id = '${N}'`, user('applicant'));
    assert.deepEqual(db.one(`select sample_status, submitted_at from seller_applications where seller_id = '${N}'`), { sample_status: 'not_requested', submitted_at: null });
    assert.equal(db.count(`update seller_applications set sample_status = 'requested', sample_note = 'Please send two bottles to our Madinah office' where seller_id = '${N}'`, user('marketing')), 0);
    db.exec(`update seller_applications set sample_status = 'requested', sample_note = 'Please send two bottles to our Madinah office' where seller_id = '${N}'`, user('manager'));
    assert.ok(db.val(`select sample_updated_at from seller_applications where seller_id = '${N}'`));
  });

  test('sending the file: KYC submitted, the event recorded; then our team asks for more and the seller answers', () => {
    db.exec(`select submit_seller_application('${N}', 'Our CR was renewed last month.')`, user('applicant'));
    assert.equal(db.val(`select kyc_status from seller_private where seller_id = '${N}'`), 'submitted');
    assert.ok(db.val(`select submitted_at from seller_applications where seller_id = '${N}'`));
    assert.match(db.error(`select submit_seller_application('${N}')`, user('sellerA')) ?? '', /Not allowed/);
    for (const r of ['operations', 'marketing', 'support', 'finance'] as const) {
      assert.match(db.error(`select mp_review_seller('${N}', 'request_info', 'More please')`, user(r)) ?? '', /Not allowed/, r);
    }
    assert.match(db.error(`select mp_review_seller('${N}', 'request_info', '')`, user('manager')) ?? '', /what to add/);
    db.exec(`select mp_review_seller('${N}', 'request_info', 'Please add photos of your distillery and the labels of the 12 ml bottles.')`, user('manager'));
    assert.deepEqual(db.one(`select status, review_note from sellers where id = '${N}'`), { status: 'info_requested', review_note: 'Please add photos of your distillery and the labels of the 12 ml bottles.' });
    db.exec(`select mp_review_seller('${N}', 'note', 'Known family business, good reputation in Madinah')`, user('marketing'));
    const file = db.val<{ messages: { kind: string; message: string | null }[] }>(`select my_seller_file('${N}')`, user('applicant'));
    assert.deepEqual(file.messages.map((m) => m.kind), ['info_requested', 'submitted', 'applied'], 'staff notes are not shown to the seller');
    assert.equal(db.rows(`select 1 from seller_review_events where seller_id = '${N}' and kind = 'note'`, user('applicant')).length, 0);
    assert.match(db.error(`select my_seller_file('${N}')`, user('sellerA')) ?? '', /Not allowed/);
    // the seller adds what was asked and sends it again
    const extra = photo(N);
    db.exec(`update seller_applications set portfolio = array_append(portfolio, '${extra}') where seller_id = '${N}'`, user('applicant'));
    db.exec(`select submit_seller_application('${N}', 'Added the distillery photos.')`, user('applicant'));
    assert.equal(db.val(`select status from sellers where id = '${N}'`), 'pending');
    assert.equal(db.val(`select kind from seller_review_events where seller_id = '${N}' order by id desc limit 1`, user('owner')), 'resubmitted');
    assert.match(db.error(`update seller_review_events set message = 'x' where seller_id = '${N}'`, 'service') ?? '', /never edited/);
  });
});

describe('approval', () => {
  test('approval needs the KYC approved, the sample passed (or not needed) and an approved category', () => {
    assert.match(db.error(`update sellers set status = 'approved' where id = '${N}'`, user('manager')) ?? '', /seller review/, 'not directly through the API');
    assert.match(db.error(`select mp_review_seller('${N}', 'approve')`, user('manager')) ?? '', /KYC/);
    assert.equal(db.count(`update seller_private set kyc_status = 'approved', kyc_note = null where seller_id = '${N}'`, user('marketing')), 0, 'KYC is for owner and manager');
    db.exec(`update seller_private set kyc_status = 'approved' where seller_id = '${N}'`, user('manager'));
    assert.equal(db.val(`select kyc_reviewed_by from seller_private where seller_id = '${N}'`), ids.manager);
    assert.match(db.error(`select mp_review_seller('${N}', 'approve')`, user('manager')) ?? '', /sample/);
    db.exec(`update seller_applications set sample_status = 'passed', sample_note = 'Oils as described.' where seller_id = '${N}'`, user('manager'));
    // approve fragrance only; calligraphy stays a request
    db.exec(`select mp_review_seller('${N}', 'approve', 'Welcome to Al Mukarramah.', array['${cat('fragrance-oud')}']::uuid[])`, user('manager'));
    assert.equal(db.val(`select status from sellers where id = '${N}'`), 'approved');
    assert.ok(db.val(`select approved_at from sellers where id = '${N}'`));
    assert.deepEqual(db.rows(`select k.slug, c.status from seller_categories c join categories k on k.id = c.category_id where c.seller_id = '${N}' order by k.slug`),
      [{ slug: 'calligraphy', status: 'requested' }, { slug: 'fragrance-oud', status: 'approved' }]);
    assert.match(db.error(`update seller_applications set brand_story = 'changed after approval' where seller_id = '${N}'`, user('applicant')) ?? '', /decided/);
  });

  test('a seller lists only in approved categories (a department covers what is under it)', () => {
    const p = (slug: string) => db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id)
      values ('n-' || substr(md5(random()::text), 1, 8), 'Item', 'منتج', 10000, '${N}', '${cat(slug)}') returning id`, user('applicant'));
    const oud = p('oud-oils');
    const art = p('calligraphy');
    db.exec(`select mp_begin_listing_check('${oud}', '${ids.applicant}')`, 'service');
    assert.equal(db.val(`select listing_status from products where id = '${oud}'`), 'check_pending');
    assert.match(db.error(`select mp_begin_listing_check('${art}', '${ids.applicant}')`, 'service') ?? '', /not approved for this category/);
    // the seller may withdraw a request; only managers decide
    assert.equal(db.count(`update seller_categories set status = 'approved' where seller_id = '${N}' and category_id = '${cat('calligraphy')}'`, user('applicant')), 0);
    db.exec(`insert into seller_categories (seller_id, category_id, status) values ('${N}', '${cat('dates-food')}', 'approved')`, user('applicant'));
    assert.equal(db.val(`select status from seller_categories where seller_id = '${N}' and category_id = '${cat('dates-food')}'`), 'requested');
    assert.equal(db.count(`delete from seller_categories where seller_id = '${N}' and category_id = '${cat('dates-food')}'`, user('applicant')), 1);
    assert.equal(db.count(`delete from seller_categories where seller_id = '${N}' and category_id = '${cat('fragrance-oud')}'`, user('applicant')), 0, 'approvals stay');
    db.exec(`update seller_categories set status = 'approved' where seller_id = '${N}' and category_id = '${cat('calligraphy')}'`, user('owner'));
    assert.equal(db.val(`select decided_by from seller_categories where seller_id = '${N}' and category_id = '${cat('calligraphy')}'`), ids.owner);
    db.exec(`select mp_begin_listing_check('${art}', '${ids.applicant}')`, 'service');
    assert.equal(db.rows(`select 1 from seller_categories where seller_id = '${N}'`, user('sellerA')).length, 0);
  });

  test('sellers from a country whose corridor is closed wait for a pilot', () => {
    E = db.val<string>(`select apply_as_seller('{"agree": true, "name_en": "Dubai Attar", "country": "AE", "contact_name": "Omar", "relationship": "own_brand", "years_in_business": "3"}'::jsonb)`, user('customer2'));
    assert.ok(missing(E, 'customer2').includes('tax'), 'the UAE needs a TRN');
    db.exec(`update seller_applications set brand_story = '${'Our attar house in Dubai blends oils for weddings and Eid. '.repeat(2)}', portfolio = array['${photo(E)}', '${photo(E)}', '${photo(E)}'] where seller_id = '${E}'`, user('customer2'));
    db.exec(`update seller_private set legal_name = 'Dubai Attar LLC', legal_entity_type = 'llc', registration_no = 'DED-12345', tax_registration_no = '100000000000003',
               iban = 'AE070331234567890123456', bank_name = 'Emirates NBD', account_holder = 'Dubai Attar LLC' where seller_id = '${E}'`, user('customer2'));
    db.exec(`insert into seller_documents (seller_id, doc_type, path) values ('${E}', 'trade_licence', '${E}/kyc/tl.pdf'), ('${E}', 'trn_certificate', '${E}/kyc/trn.pdf')`, user('customer2'));
    db.exec(`insert into seller_categories (seller_id, category_id) values ('${E}', '${cat('attar')}')`, user('customer2'));
    db.exec(`insert into seller_locations (seller_id, contact_name, phone, country, city, line1) values ('${E}', 'Omar', '+971500000001', 'AE', 'Dubai', 'Al Quoz 4')`, user('customer2'));
    db.exec(`select submit_seller_application('${E}')`, user('customer2'));
    db.exec(`update seller_private set kyc_status = 'approved' where seller_id = '${E}'; update seller_applications set sample_status = 'not_needed' where seller_id = '${E}'`, user('owner'));
    assert.match(db.error(`select mp_review_seller('${E}', 'approve')`, user('owner')) ?? '', /No marketplace corridor from AE/);
    db.exec(`update corridors set status = 'pilot', pilot_seller_ids = array['${E}']::uuid[], adviser_name = 'Adviser', adviser_signed_off_at = now()
             where scope = 'marketplace' and from_country = 'AE' and to_country = 'AE'`, user('owner'));
    db.exec(`select mp_review_seller('${E}', 'approve')`, user('owner'));
    assert.equal(db.val(`select status from sellers where id = '${E}'`), 'approved');
  });

  test('suspend and reinstate always carry a message; rejection ends the application', () => {
    assert.match(db.error(`select mp_review_seller('${E}', 'suspend', '')`, user('owner')) ?? '', /reason/);
    db.exec(`select mp_review_seller('${E}', 'suspend', 'Customer complaints about diluted oils: we are looking into it.')`, user('owner'));
    assert.deepEqual(db.one(`select status, suspended_reason from sellers where id = '${E}'`), { status: 'suspended', suspended_reason: 'staff' });
    db.exec(`select mp_review_seller('${E}', 'reinstate', 'Lab report received: oils as described.')`, user('manager'));
    assert.equal(db.val(`select status from sellers where id = '${E}'`), 'approved');
    const R = db.val<string>(`select apply_as_seller('{"agree": true, "name_en": "Copies Co", "country": "SA", "contact_name": "Zaid"}'::jsonb)`, user('customer'));
    assert.match(db.error(`select mp_review_seller('${R}', 'reject')`, user('manager')) ?? '', /reason/);
    db.exec(`select mp_review_seller('${R}', 'reject', 'We could not confirm the brands you sell are genuine.')`, user('manager'));
    assert.equal(db.val(`select status from sellers where id = '${R}'`), 'rejected');
    assert.match(db.error(`select mp_review_seller('${R}', 'reinstate', 'x')`, user('manager')) ?? '', /suspended seller/);
  });
});

describe('privacy and documents', () => {
  test('staff notes on the seller record stay with staff', () => {
    db.exec(`update seller_private set internal_notes = 'Asked for a discount on commission' where seller_id = '${A}'`, user('owner'));
    assert.match(db.error(`select internal_notes from seller_private where seller_id = '${A}'`, user('sellerA')) ?? '', /permission denied/);
    assert.equal(db.val(`select legal_name is null from seller_private where seller_id = '${A}'`, user('sellerA')), true, 'other columns readable');
    assert.equal(db.rows(`select seller_id from seller_private where seller_id = '${A}'`, user('sellerB')).length, 0);
    assert.match(db.error(`select contact_email from seller_private`, 'anon') ?? '', /permission denied/);
    const all = db.val<{ private: { internal_notes: string } ; seller: { id: string } }[]>(`select admin_sellers()`, user('manager'));
    assert.equal(all.find((x) => x.seller.id === A)?.private.internal_notes, 'Asked for a discount on commission');
    assert.equal('internal_notes' in db.val<{ private: object }[]>(`select my_sellers()`, user('sellerA'))[0].private, false);
  });

  test('KYC files under kyc/, brand papers under brand/ with their brand; reviewers see the brand papers only', () => {
    assert.match(db.error(`insert into seller_documents (seller_id, doc_type, path) values ('${A}', 'commercial_registration', '${A}/brand/cr.pdf')`, user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(`insert into seller_documents (seller_id, doc_type, path) values ('${A}', 'made_up', '${A}/kyc/x.pdf')`, user('sellerA')) ?? '', /row-level security/);
    db.exec(`insert into seller_documents (seller_id, doc_type, path) values ('${A}', 'commercial_registration', '${A}/kyc/cr2.pdf')`, user('sellerA'));
    const letter = db.val<string>(`insert into seller_documents (seller_id, doc_type, path, subject) values ('${A}', 'authorised_distributor_letter', '${A}/brand/ajmal.pdf', 'Ajmal') returning id`, user('sellerA'));
    assert.deepEqual(db.rows<{ doc_type: string }>(`select doc_type from seller_documents where seller_id = '${A}'`, user('marketing')).map((x) => x.doc_type), ['authorised_distributor_letter']);
    assert.equal(db.count(`update seller_documents set status = 'accepted' where id = '${letter}'`, user('marketing')), 1);
    assert.equal(db.count(`update seller_documents set status = 'accepted' where seller_id = '${A}' and doc_type = 'commercial_registration'`, user('marketing')), 0);
    db.exec(`insert into storage.objects (bucket_id, name) values ('seller-kyc', '${A}/brand/ajmal.pdf'), ('seller-kyc', '${A}/kyc/cr2.pdf')`, 'service');
    assert.deepEqual(db.rows<{ name: string }>(`select name from storage.objects where bucket_id = 'seller-kyc' and name like '${A}/%' order by name`, user('marketing')).map((x) => x.name), [`${A}/brand/ajmal.pdf`]);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-kyc' and name like '${A}/%'`, user('support')).length, 0);
  });

  test('an authorised-distributor letter counts for listings of that brand only', () => {
    const p = (brand: string) => db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, attributes)
      values ('b-' || substr(md5(random()::text), 1, 8), 'Item', 'منتج', 10000, '${A}', '${cat('oud-oils')}', '{"brand": "${brand}", "brand_relationship": "authorised"}') returning id`, user('sellerA'));
    const docs = (pid: string) => db.val<{ documents: { doc_type: string }[] }>(`select mp_listing_check_context('${pid}')`, 'service').documents.map((d) => d.doc_type);
    assert.deepEqual(docs(p('Ajmal')), ['authorised_distributor_letter']);
    assert.deepEqual(docs(p('Rasasi')), []);
  });

  test('every staff role and the public: who can call what', () => {
    for (const r of staffRoles) {
      const ok = r === 'owner' || r === 'manager';
      const err = db.error(`select mp_review_seller('${A}', 'suspend', 'checking roles')`, user(r));
      if (ok) {
        assert.equal(err, null, r);
        db.exec(`select mp_review_seller('${A}', 'reinstate', 'checking roles')`, user(r));
      } else assert.match(err ?? '', /Not allowed/, r);
    }
    assert.match(db.error(`select mp_review_seller('${A}', 'note', 'x')`, 'anon') ?? '', /permission denied/);
    assert.match(db.error(`select submit_seller_application('${A}')`, 'anon') ?? '', /permission denied/);
    const g = db.val<{ kyc: unknown[]; seller_countries: { code: string; open: boolean }[] }>(`select mp_guidance()`, 'anon');
    assert.ok(g.kyc.length >= 8);
    assert.deepEqual(g.seller_countries.filter((c) => c.open).map((c) => c.code), ['SA']);
    assert.equal(db.rows(`select 1 from seller_applications`, 'anon').length, 0);
    assert.equal(db.rows(`select 1 from seller_applications where seller_id = '${N}'`, user('support')).length, 0, 'support does not read applications');
  });
});

describe('focus markets abroad (rulebook)', () => {
  test('destinations record their import VAT/GST regime; seller goods to them are closed', () => {
    const c = db.rows<{ code: string; import_tax_regime: string; platform_collects_import_tax: boolean }>(
      `select code, import_tax_regime, platform_collects_import_tax from countries where code in ('GB', 'DE', 'AU', 'NZ', 'CA', 'US', 'SA') order by code`, 'anon');
    assert.deepEqual(c.map((x) => [x.code, x.import_tax_regime, x.platform_collects_import_tax]), [
      ['AU', 'au_low_value', false], ['CA', 'ca_low_value', false], ['DE', 'eu_ioss', false], ['GB', 'uk_low_value', false],
      ['NZ', 'nz_low_value', false], ['SA', 'border', false], ['US', 'border', false]]);
    const k = db.rows<{ to_country: string; status: string; platform_collects_import_tax: boolean; vat_mode: string }>(
      `select to_country, status, platform_collects_import_tax, vat_mode from corridors where scope = 'marketplace' and from_country = 'SA' and to_country in ('GB', 'US') order by to_country`, user('manager'));
    assert.deepEqual(k, [{ to_country: 'GB', status: 'closed', platform_collects_import_tax: true, vat_mode: 'destination' },
                         { to_country: 'US', status: 'closed', platform_collects_import_tax: false, vat_mode: 'zero' }]);
    assert.ok(db.val<number>(`select count(*) from corridors where scope = 'marketplace' and from_country = 'SA' and to_country <> 'SA'`, user('manager')) >= 15);
    assert.equal(db.val(`select count(*) from corridors where from_country = 'IN' and status <> 'closed'`, user('manager')), 0, 'India stays closed');
    // sellers come only from countries we take sellers from
    const visitor = { uid: '00000000-0000-4000-d000-000000000001', email: 'visitor@test.local' };
    db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${visitor.uid}', '${visitor.email}', now())`);
    assert.match(db.error(`select apply_as_seller('{"agree": true, "name_en": "London Oud", "country": "GB", "contact_name": "Yusuf"}'::jsonb)`, visitor) ?? '', /that country/);
  });

  test('a route that collects import VAT/GST opens only once we are registered there', () => {
    const gb = `scope = 'marketplace' and from_country = 'SA' and to_country = 'GB'`;
    assert.match(db.error(`update corridors set status = 'open', adviser_name = 'Adviser', adviser_signed_off_at = now() where ${gb}`, user('owner')) ?? '', /Register for GB/);
    assert.match(db.error(`update countries set platform_collects_import_tax = true where code = 'GB'`, 'service') ?? '', /check constraint/, 'needs our registration number');
    db.exec(`update countries set platform_collects_import_tax = true, our_tax_registration = 'GB000000000' where code = 'GB'`, 'service');
    db.exec(`update corridors set status = 'pilot', adviser_name = 'Adviser', adviser_signed_off_at = now() where ${gb}`, user('owner'));
    assert.match(db.error(`update corridors set platform_collects_import_tax = false where ${gb}`, user('owner')) ?? '', /new adviser sign-off/);
    assert.match(db.error(`update corridors set vat_mode = 'zero' where ${gb}`, 'service') ?? '', /check constraint|adviser/);
    db.exec(`update corridors set status = 'closed' where ${gb}`, user('owner'));
  });
});


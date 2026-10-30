// M3: screening records, strikes and automatic suspension, the server-only listing transitions, staff overrides,
// quarantine, rate limits and product documents.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Db, freshDb, ids, seedPeople, seedSellers, user } from './lib/db.ts';

let db: Db;
let A = '';
let B = '';
const hash = (n: number) => n.toString(16).padStart(64, '0');
let assetN = 0;

/** A screened asset for seller A, as the screen-image function would leave it. */
function asset(seller: string, status = 'pending', kind = 'listing_photo'): { id: string; path: string } {
  assetN++;
  const id = db.val<string>(`select gen_random_uuid()`);
  const path = `${seller}/media/${id}.jpg`;
  db.exec(`insert into media_assets (id, seller_id, kind, path, mime, bytes, width, height, sha256, status)
           values ('${id}', '${seller}', '${kind}', '${path}', 'image/jpeg', 1000, 2400, 1800, '${hash(assetN)}', '${status}')`, 'service');
  return { id, path };
}
const listingSql = (seller: string, images: string[] = []) => `insert into products (slug, name_en, name_ar, base_price_sar, seller_id, images, category_id) values
    ('l-' || substr(md5(random()::text), 1, 8), 'Oud oil', 'دهن عود', 25000, '${seller}', array[${images.map((i) => `'${i}'`).join(',')}]::text[],
     (select id from categories where slug = 'oud-oils')) returning id`;
const listing = (seller: string, images: string[], who: 'sellerA' | 'sellerB' = 'sellerA') => db.val<string>(listingSql(seller, images), user(who));
const run = (verdict: string, stage = 'final') => `[{"stage": "${stage}", "model": "claude-test", "prompt_version": "img-test", "verdict": "${verdict}", "confidence": 0.9, "reasons": [{"code": "x", "en": "x", "ar": "س"}]}]`;

before(() => {
  db = freshDb('m3');
  seedPeople(db);
  ({ A, B } = seedSellers(db));
});
after(() => db.drop());

describe('media and verdicts', () => {
  test('sellers see their own media only and never write it; staff read everything', () => {
    const a = asset(A);
    assert.equal(db.rows(`select 1 from media_assets where id = '${a.id}'`, user('sellerA')).length, 1);
    assert.equal(db.rows(`select 1 from media_assets where id = '${a.id}'`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select 1 from media_assets`, 'anon').length, 0);
    assert.equal(db.rows(`select 1 from media_assets where id = '${a.id}'`, user('marketing')).length, 1);
    assert.match(db.error(`insert into media_assets (seller_id, kind, path, mime, bytes, sha256, status) values ('${A}', 'listing_photo', '${A}/media/x.jpg', 'image/jpeg', 1, '${hash(999)}', 'passed')`, user('sellerA')) ?? '', /row-level security/);
    assert.equal(db.count(`update media_assets set status = 'passed' where id = '${a.id}'`, user('sellerA')), 0);
  });

  test('a verdict is recorded with model, prompt version and reasons, and can never be edited', () => {
    const a = asset(A);
    db.exec(`select mp_record_image_screening('${a.id}', '${run('pass')}'::jsonb, '{"status": "passed", "flags": ["busy_background"]}'::jsonb)`, 'service');
    assert.deepEqual(db.one(`select status, flags from media_assets where id = '${a.id}'`), { status: 'passed', flags: ['busy_background'] });
    const r = db.one<{ model: string; prompt_version: string }>(`select model, prompt_version from screening_runs where asset_id = '${a.id}'`, user('support'));
    assert.deepEqual(r, { model: 'claude-test', prompt_version: 'img-test' });
    assert.equal(db.rows(`select 1 from screening_runs`, user('sellerA')).length, 0, 'sellers see reasons, not the raw records');
    assert.match(db.error(`update screening_runs set verdict = 'block' where asset_id = '${a.id}'`, 'service') ?? '', /never edited/);
    assert.match(db.error(`delete from screening_runs where asset_id = '${a.id}'`) ?? '', /never edited/);
    assert.match(db.error(`select mp_record_image_screening('${a.id}', '[]'::jsonb, '{"status": "passed"}'::jsonb)`, user('sellerA')) ?? '', /permission denied/);
  });

  test('a prohibited image is quarantined, its hash blocked, a strike recorded and the file deleted after retention', () => {
    const a = asset(A);
    db.exec(`select mp_record_image_screening('${a.id}', '${run('block')}'::jsonb,
      '{"status": "blocked", "strike": "hard", "policy_code": "tobacco_shisha_vapes", "bucket": "quarantine", "path": "${A}/q1.jpg"}'::jsonb)`, 'service');
    const m = db.one<{ status: string; bucket: string; days: number }>(`select status, bucket, round(extract(epoch from delete_after - now()) / 86400) as days from media_assets where id = '${a.id}'`);
    assert.deepEqual(m, { status: 'blocked', bucket: 'quarantine', days: 30 });
    assert.equal(db.val(`select count(*) from blocked_hashes where first_asset_id = '${a.id}'`), 1);
    assert.equal(db.val(`select kind from seller_strikes where asset_id = '${a.id}'`, user('sellerA')), 'hard');
    assert.equal(db.rows(`select 1 from seller_strikes`, user('sellerB')).length, 0);
  });
});

describe('strikes', () => {
  test('three hard violations within 90 days suspend the seller pending review; void or old strikes do not count', () => {
    const add = (when = 'now()') => db.exec(`insert into seller_strikes (seller_id, kind, policy_code, created_at) values ('${B}', 'hard', 'gambling', ${when})`, 'service');
    add(`now() - interval '120 days'`);
    add();
    const s1 = db.val<string>(`insert into seller_strikes (seller_id, kind, policy_code) values ('${B}', 'hard', 'gambling') returning id`, 'service');
    assert.equal(db.val(`select status from sellers where id = '${B}'`), 'approved', 'two recent strikes and an old one');
    assert.match(db.error(`select mp_void_strike('${s1}', 'appeal accepted')`, user('support')) ?? '', /Not allowed/);
    db.exec(`select mp_void_strike('${s1}', 'appeal accepted')`, user('manager'));
    add();
    assert.equal(db.val(`select status from sellers where id = '${B}'`), 'approved', 'a voided strike does not count');
    add();
    assert.deepEqual(db.one(`select status, suspended_reason from sellers where id = '${B}'`), { status: 'suspended', suspended_reason: 'strikes' });
    assert.equal(db.rows(`select 1 from products where seller_id = '${B}'`, 'anon').length, 0);
    assert.match(db.error(`update sellers set status = 'approved' where id = '${B}'`, user('owner')) ?? '', /seller review/, 'not directly');
    db.exec(`select mp_review_seller('${B}', 'reinstate', 'Reviewed the strikes with the seller')`, user('owner'));
    assert.equal(db.val(`select suspended_reason from sellers where id = '${B}'`), null, 'reinstated by staff after review');
    db.exec(`update seller_strikes set voided_at = now(), voided_by = '${ids.owner}', void_reason = 'reinstated after review' where seller_id = '${B}' and voided_at is null`, 'service');
  });

  test('a severe violation suspends the listing at once and flags the seller', () => {
    const a = asset(A, 'passed');
    const pid = listing(A, [a.path]);
    db.exec(`insert into seller_strikes (seller_id, kind, policy_code, product_id) values ('${A}', 'severe', 'adult_immodest', '${pid}')`, 'service');
    assert.equal(db.val(`select listing_status from products where id = '${pid}'`), 'suspended');
    assert.equal(db.val(`select flag_reason from sellers where id = '${A}'`), 'adult_immodest');
    assert.match(db.error(`select flag_reason from sellers where id = '${A}'`, user('sellerA')) ?? '', /permission denied/, 'staff fields are not readable through the API');
    assert.equal(db.val(`select status from sellers where id = '${A}'`), 'approved');
    assert.match(db.error(`update products set description_en = 'edited' where id = '${pid}'`, user('sellerA')) ?? '', /suspended/);
    assert.match(db.error(`update products set listing_status = 'draft' where id = '${pid}'`, user('sellerA')) ?? '', /suspended/);
  });
});

describe('listing transitions', () => {
  test('only screened photos can be submitted, only by a member, only through the server', () => {
    const pending = asset(A, 'pending');
    const pid = listing(A, [pending.path]);
    assert.match(db.error(`select mp_begin_listing_check('${pid}', '${ids.sellerA}')`, user('sellerA')) ?? '', /permission denied/);
    assert.match(db.error(`select mp_begin_listing_check('${pid}', '${ids.sellerB}')`, 'service') ?? '', /Not allowed/);
    assert.match(db.error(`select mp_begin_listing_check('${pid}', '${ids.sellerA}')`, 'service') ?? '', /photo check/);
    db.exec(`select mp_record_image_screening('${pending.id}', '${run('pass')}'::jsonb, '{"status": "passed"}'::jsonb)`, 'service');
    db.exec(`select mp_begin_listing_check('${pid}', '${ids.sellerA}')`, 'service');
    assert.equal(db.val(`select listing_status from products where id = '${pid}'`), 'check_pending');
  });

  const submitted = () => {
    const a = asset(A, 'passed');
    const pid = listing(A, [a.path]);
    db.exec(`select mp_begin_listing_check('${pid}', '${ids.sellerA}')`, 'service');
    return { pid, updated: db.val<string>(`select updated_at from products where id = '${pid}'`) };
  };
  const record = (pid: string, updated: string | null, outcome: Record<string, unknown>) =>
    db.val<{ applied: boolean; status?: string }>(`select mp_record_listing_screening('${pid}', ${updated ? `'${updated}'` : 'null'}, '${run(String(outcome.verdict))}'::jsonb, '${JSON.stringify(outcome)}'::jsonb)`, 'service');

  test('block: rejected automatically with the reasons, never in the staff queue', () => {
    const { pid, updated } = submitted();
    const r = record(pid, updated, { verdict: 'block', summary_en: 'Please remove the phone number.', summary_ar: 'احذف رقم الهاتف.', reasons: [{ code: 'contact', en: 'x', ar: 'س' }] });
    assert.deepEqual(r, { applied: true, status: 'rejected' });
    // the seller reads the review fields through mp_listing_private (0017), never directly
    const p = { ...db.one<{ listing_status: string }>(`select listing_status from products where id = '${pid}'`, user('sellerA')),
                ...db.val<{ review_note: string; ai_check: { verdict: string; reasons: unknown[] } }[]>(`select mp_listing_private(array['${pid}']::uuid[])`, user('sellerA'))[0] };
    assert.equal(p.listing_status, 'rejected');
    assert.equal(p.review_note, 'Please remove the phone number.');
    assert.equal(p.ai_check.verdict, 'block');
    assert.equal(db.val(`select count(*) from seller_strikes where product_id = '${pid}'`), 0, 'a fixable problem is not a strike');
    assert.equal(db.val(`select count(*) from products where listing_status = 'pending_review' and id = '${pid}'`), 0);
  });

  test('a prohibited listing is blocked with a strike; the third strike in the window suspends the seller', () => {
    const { pid, updated } = submitted();
    record(pid, updated, { verdict: 'block', strike: 'hard', policy_code: 'counterfeit', summary_en: 'Not allowed', reasons: [] });
    assert.equal(db.val(`select kind from seller_strikes where product_id = '${pid}'`), 'hard');
    // seller A now has three active strikes: the quarantined image, the severe listing and this one
    assert.equal(db.val(`select count(*) from seller_strikes where seller_id = '${A}' and voided_at is null`), 3);
    assert.deepEqual(db.one(`select status, suspended_reason from sellers where id = '${A}'`), { status: 'suspended', suspended_reason: 'strikes' });
    assert.match(db.error(listingSql(A), user('sellerA')) ?? '', /row-level security/, 'no new listings while suspended');
    // staff review: the strikes are lifted and the seller reinstated
    for (const id of db.rows<{ id: string }>(`select id from seller_strikes where seller_id = '${A}' and voided_at is null`)) {
      db.exec(`select mp_void_strike('${id.id}', 'reviewed with the seller')`, user('manager'));
    }
    db.exec(`select mp_review_seller('${A}', 'reinstate', 'Reviewed with the seller')`, user('owner'));
  });

  test('review and pass go to the staff queue; an error stays check pending', () => {
    const a = submitted();
    assert.equal(record(a.pid, a.updated, { verdict: 'review', reasons: [{ code: 'rule_musical_instruments', en: 'x', ar: 'س' }] }).status, 'pending_review');
    const b = submitted();
    assert.equal(record(b.pid, b.updated, { verdict: 'pass', reasons: [] }).status, 'pending_review');
    const c = submitted();
    assert.equal(record(c.pid, c.updated, { verdict: 'error', reasons: [] }).status, 'check_pending');
  });

  test('an edit during the check sends the listing back to draft and the old verdict is not applied', () => {
    const { pid, updated } = submitted();
    db.exec(`update products set description_en = 'changed while checking' where id = '${pid}'`, user('sellerA'));
    assert.equal(db.val(`select listing_status from products where id = '${pid}'`), 'draft');
    assert.equal(record(pid, updated, { verdict: 'pass', reasons: [] }).applied, false);
  });

  test('staff cannot approve or queue a listing directly: approval goes through the approval function', () => {
    const { pid, updated } = submitted();
    record(pid, updated, { verdict: 'pass', reasons: [] });
    assert.match(db.error(`update products set listing_status = 'approved' where id = '${pid}'`, user('manager')) ?? '', /listings queue/);
    assert.equal(db.error(`update products set listing_status = 'approved', is_active = true where id = '${pid}'`, 'service'), null);
    assert.equal(db.error(`update products set listing_status = 'rejected', review_note = 'not premium' where id = '${pid}'`, user('manager')), null);
  });
});

describe('overrides', () => {
  test('only listing reviewers override, always with a reason; overturning a block voids its strike', () => {
    const a = asset(A, 'passed');
    const pid = listing(A, [a.path]);
    db.exec(`select mp_begin_listing_check('${pid}', '${ids.sellerA}')`, 'service');
    db.exec(`select mp_record_listing_screening('${pid}', null, '[]'::jsonb, '{"verdict": "block", "strike": "hard", "policy_code": "counterfeit", "reasons": []}'::jsonb)`, 'service');
    assert.match(db.error(`select mp_override_screening('listing', '${pid}', 'pending_review', 'Brand letter checked')`, user('support')) ?? '', /Not allowed/);
    assert.match(db.error(`select mp_override_screening('listing', '${pid}', 'pending_review', 'ok')`, user('manager')) ?? '', /reason/);
    db.exec(`select mp_override_screening('listing', '${pid}', 'pending_review', 'Authorised distributor letter checked')`, user('marketing'));
    assert.equal(db.val(`select listing_status from products where id = '${pid}'`), 'pending_review');
    assert.ok(db.val(`select voided_at from seller_strikes where product_id = '${pid}'`));
    const o = db.one<{ stage: string; actor: string }>(`select stage, actor from screening_runs where product_id = '${pid}' and stage = 'override'`);
    assert.deepEqual(o, { stage: 'override', actor: ids.marketing });
  });

  test('a blocked image restored by staff is usable again and its hash unblocked', () => {
    const a = asset(A);
    db.exec(`select mp_record_image_screening('${a.id}', '[]'::jsonb, '{"status": "blocked", "strike": "hard", "policy_code": "counterfeit", "bucket": "quarantine", "path": "${A}/q2.jpg"}'::jsonb)`, 'service');
    db.exec(`select mp_override_screening('image', '${a.id}', 'passed', 'Logo is the brand owner''s own', '${A}/media/${a.id}.jpg')`, user('manager'));
    assert.deepEqual(db.one(`select status, bucket from media_assets where id = '${a.id}'`), { status: 'passed', bucket: 'seller-uploads' });
    assert.equal(db.val(`select count(*) from blocked_hashes b join media_assets m on m.sha256 = b.sha256 where m.id = '${a.id}'`), 0);
    assert.ok(db.val(`select voided_at from seller_strikes where asset_id = '${a.id}'`));
  });
});

describe('storage, limits and documents', () => {
  test('quarantined files are for listing reviewers only', () => {
    db.exec(`insert into storage.objects (bucket_id, name) values ('quarantine', '${A}/q9.jpg')`, 'service');
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'quarantine'`, user('sellerA')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'quarantine'`, 'anon').length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'quarantine'`, user('finance')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'quarantine'`, user('marketing')).length, 1);
    assert.match(db.error(`insert into storage.objects (bucket_id, name) values ('quarantine', '${A}/mine.jpg')`, user('sellerA')) ?? '', /row-level security/);
  });

  test('rate limits count per window and are server-only', () => {
    const hit = () => db.val<boolean>(`select mp_rate_hit('upload:test', 3600, 2)`, 'service');
    assert.deepEqual([hit(), hit(), hit()], [true, true, false]);
    assert.match(db.error(`select mp_rate_hit('upload:test', 3600, 2)`, user('sellerA')) ?? '', /permission denied/);
    assert.match(db.error(`select mp_listing_check_context(gen_random_uuid())`, user('sellerA')) ?? '', /permission denied/);
  });

  test('product documents: own listing, own folder, pending until staff accept', () => {
    const a = asset(A, 'passed');
    const pid = listing(A, [a.path]);
    const file = `${A}/products/${pid}/halal.pdf`;
    const doc = db.val<string>(`insert into product_documents (product_id, doc_type, path, status) values ('${pid}', 'halal_certificate', '${file}', 'accepted') returning id`, user('sellerA'));
    assert.equal(db.val(`select status from product_documents where id = '${doc}'`), 'pending');
    assert.match(db.error(`insert into product_documents (product_id, doc_type, path) values ('${pid}', 'halal_certificate', '${A}/halal2.pdf')`, user('sellerA')) ?? '', /row-level security/, 'outside the listing folder');
    assert.match(db.error(`insert into product_documents (product_id, doc_type, path) values ('${pid}', 'halal_certificate', '${B}/products/${pid}/x.pdf')`, user('sellerA')) ?? '', /row-level security/);
    assert.match(db.error(`insert into product_documents (product_id, doc_type, path) values ('${pid}', 'halal_certificate', '${B}/products/${pid}/y.pdf')`, user('sellerB')) ?? '', /row-level security/);
    assert.equal(db.count(`update product_documents set status = 'accepted' where id = '${doc}'`, user('support')), 0, 'support cannot decide');
    assert.equal(db.count(`update product_documents set status = 'accepted' where id = '${doc}'`, user('marketing')), 1);
    assert.equal(db.val(`select reviewed_by from product_documents where id = '${doc}'`), ids.marketing);
    assert.equal(db.count(`delete from product_documents where id = '${doc}'`, user('sellerA')), 0);
    // the file: listing reviewers can open it, the KYC files beside it stay private; an accepted file stays
    db.exec(`insert into storage.objects (bucket_id, name) values ('seller-kyc', '${file}'), ('seller-kyc', '${A}/kyc-cr-x.pdf')`, 'service');
    assert.deepEqual(db.rows<{ name: string }>(`select name from storage.objects where bucket_id = 'seller-kyc' and name like '${A}/%' order by name`, user('marketing')).map((x) => x.name), [file]);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-kyc' and name = '${file}'`, user('sellerB')).length, 0);
    assert.equal(db.rows(`select 1 from storage.objects where bucket_id = 'seller-kyc' and name = '${file}'`, 'anon').length, 0);
    assert.equal(db.count(`delete from storage.objects where bucket_id = 'seller-kyc' and name = '${file}'`, user('sellerA')), 0, 'accepted file stays');
  });

  test('photos map back to their screened asset, including published catalogue copies', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    assert.equal(db.val(`select private.asset_of('${A}/media/${id}.jpg', '${A}')`), id);
    assert.equal(db.val(`select private.asset_of('https://x.supabase.co/storage/v1/object/public/catalogue/${A}/${id}.webp', '${A}')`), id);
    assert.equal(db.val(`select private.asset_of('${B}/media/${id}.jpg', '${A}')`), null);
    assert.equal(db.val(`select private.asset_of('${A}/media/not-a-uuid.jpg', '${A}')`), null);
  });

  test('a shop logo must be screened media too', () => {
    assert.match(db.error(`update sellers set logo = 'https://elsewhere.example/logo.png' where id = '${A}'`, user('sellerA')) ?? '', /seller dashboard/);
    assert.equal(db.error(`update sellers set logo = '${A}/media/11111111-2222-4333-8444-555555555555.png' where id = '${A}'`, user('sellerA')), null);
  });
});

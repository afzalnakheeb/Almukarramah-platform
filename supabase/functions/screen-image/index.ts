// Screens one photo a seller has just uploaded to <seller id>/incoming/ (listing photo, shop logo or banner, or an
// application portfolio photo). The file is checked from its own bytes (type, size, pixels), its hidden metadata is
// removed, it is hashed (the same photo is not screened twice; a photo already found prohibited is blocked at once),
// stored privately under <seller id>/media/ and screened by the AI (fast pass, escalated when borderline).
// Rejected files are deleted; prohibited ones are quarantined (staff only) and count as a strike.
// The incoming file is always removed. Nothing here is ever public.
import { intakeImage } from '../_shared/images.ts';
import { screenAsset } from '../_shared/media.ts';
import { admin, caller, handle, isSellerMember, json, UUID, withinLimit } from '../_shared/util.ts';

const KINDS = ['listing_photo', 'seller_logo', 'seller_banner', 'portfolio'] as const;
const FIELDS = 'id, kind, path, status, reasons, flags, width, height, mime';

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const body = (await req.json()) as { path?: string; kind?: string; productId?: string; categoryId?: string };
  const kind = KINDS.find((k) => k === body.kind);
  const path = String(body.path ?? '');
  const m = /^([0-9a-f-]{36})\/incoming\/[A-Za-z0-9._-]{1,100}$/.exec(path);
  if (!kind || !m || !UUID.test(m[1])) return json({ error: 'Invalid upload' }, 400);
  const sellerId = m[1];
  const db = admin();
  if (!(await isSellerMember(db, sellerId, user.id))) return json({ error: 'Not allowed' }, 403);
  const { data: seller } = await db.from('sellers').select('id, status').eq('id', sellerId).single();
  if (!seller || seller.status === 'rejected' || seller.status === 'suspended') return json({ error: 'This seller account cannot upload photos' }, 403);
  if (kind === 'listing_photo' && seller.status !== 'approved') return json({ error: 'Your seller account is not approved yet' }, 403);
  const { data: settings } = await db.from('mp_settings').select('uploads_per_hour').eq('id', 1).single();
  if (!(await withinLimit(db, `upload:${sellerId}`, 3600, settings?.uploads_per_hour ?? 120))) {
    return json({ error: 'Too many uploads in the last hour. Please try again later.', error_ar: 'رفعت صورًا كثيرة خلال الساعة الأخيرة. حاول لاحقًا.' }, 429);
  }

  const store = db.storage.from('seller-uploads');
  const { data: blob, error } = await store.download(path);
  if (error || !blob) return json({ error: 'Upload not found' }, 404);
  const intake = await intakeImage(new Uint8Array(await blob.arrayBuffer()), blob.type || null);
  await store.remove([path]);
  if (!intake.ok) return json({ asset: null, status: 'rejected', reasons: [{ code: intake.code, en: intake.en, ar: intake.ar }] });

  // The same photo again: reuse the screened copy.
  const { data: same } = await db.from('media_assets').select(FIELDS).eq('seller_id', sellerId).eq('sha256', intake.sha256)
    .in('status', ['pending', 'passed', 'review']).is('deleted_at', null).limit(1).maybeSingle();
  if (same) return json({ asset: same, duplicate: true });

  const id = crypto.randomUUID();
  const known = (await db.from('blocked_hashes').select('policy_code').eq('sha256', intake.sha256).maybeSingle()).data;
  const target = known ? { bucket: 'quarantine', path: `${sellerId}/${id}.${intake.ext}` } : { bucket: 'seller-uploads', path: `${sellerId}/media/${id}.${intake.ext}` };
  const { error: upErr } = await db.storage.from(target.bucket).upload(target.path, intake.bytes, { contentType: intake.mime, upsert: false });
  if (upErr) throw upErr;
  const row = { id, seller_id: sellerId, user_id: user.id, kind, bucket: target.bucket, path: target.path, mime: intake.mime, bytes: intake.bytes.length,
    width: intake.width, height: intake.height, sha256: intake.sha256, status: 'pending' };
  const { error: insErr } = await db.from('media_assets').insert(row);
  if (insErr) throw insErr;

  if (known) {
    // a photo found prohibited before (by any seller): blocked without asking the model again
    const { data: rule } = await db.from('policy_rules').select('severity, title_en, title_ar').eq('code', known.policy_code ?? '').maybeSingle();
    const reasons = [{ code: 'known_prohibited', en: `This photo was already found to show something Al Mukarramah does not allow${rule ? `: ${rule.title_en}` : ''}.`,
      ar: `سبق أن تبيّن أن هذه الصورة تُظهر شيئًا لا تسمح به المكرمة${rule ? `: ${rule.title_ar}` : ''}.` }];
    await db.rpc('mp_record_image_screening', {
      p_asset: id, p_runs: [{ stage: 'rules', verdict: 'block', reasons }, { stage: 'final', verdict: 'block', reasons }],
      p_outcome: { status: 'blocked', reasons, policy_code: known.policy_code, strike: rule?.severity ?? 'hard' },
    });
  } else {
    let ctx: { fashion?: boolean; listing?: { name_en?: string; category?: string } | null } = {};
    if (kind === 'listing_photo') {
      const pid = body.productId && UUID.test(body.productId) ? body.productId : null;
      const { data: p } = pid ? await db.from('products').select('name_en, seller_id, categories(name_en, department)').eq('id', pid).maybeSingle() : { data: null };
      const catId = body.categoryId && UUID.test(body.categoryId) ? body.categoryId : null;
      const { data: c } = !p && catId ? await db.from('categories').select('name_en, department').eq('id', catId).maybeSingle() : { data: null };
      const cat = (p && p.seller_id === sellerId ? (p.categories as unknown as { name_en: string; department: string } | null) : null) ?? c;
      ctx = { fashion: cat?.department === 'fashion', listing: { name_en: p && p.seller_id === sellerId ? p.name_en : undefined, category: cat?.name_en } };
    }
    // stays "pending" if anything fails from here on; the retry job finishes it
    await screenAsset(db, { ...row, attempts: 0 }, ctx);
  }
  const { data: fresh } = await db.from('media_assets').select(FIELDS).eq('id', id).single();
  return json({ asset: fresh });
}));

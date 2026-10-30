// Owner/manager: approve a seller (through mp_review_seller, which checks the KYC decision, the sample and the
// corridor, and approves the chosen categories), then publish the shop's screened logo and banner to the public
// catalogue. 'publish_media' publishes a logo or banner the seller changed later. A file is published only if its
// screening passed (or a reviewer cleared it); nothing a seller uploads is public before that.
// The other decisions (more information, reject, suspend, reinstate, notes) are plain calls to mp_review_seller.
import { admin, asCaller, caller, env, handle, json, staffRole, UUID } from '../_shared/util.ts';

type Body = { sellerId?: string; action?: 'approve' | 'publish_media'; message?: string; categories?: string[] };

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const db = admin();
  const role = await staffRole(db, user.id);
  if (!role || !['owner', 'manager'].includes(role)) return json({ error: 'Not allowed' }, 403);
  const { sellerId, action, message, categories } = (await req.json()) as Body;
  if (!sellerId || !UUID.test(sellerId) || (action !== 'approve' && action !== 'publish_media')) return json({ error: 'Missing details' }, 400);
  if (categories && (!Array.isArray(categories) || categories.some((c) => !UUID.test(c)))) return json({ error: 'Invalid categories' }, 400);

  if (action === 'approve') {
    // as the staff member, so the review records who decided (and the database checks their role)
    const { error } = await asCaller(req).rpc('mp_review_seller', { p_seller: sellerId, p_action: 'approve', p_message: message ?? null, p_categories: categories ?? null });
    if (error) return json({ error: error.message }, 409);
  }

  const { data: s } = await db.from('sellers').select('id, status, logo, banner').eq('id', sellerId).single();
  if (!s) return json({ error: 'Seller not found' }, 404);
  if (s.status !== 'approved') return json({ error: 'Only an approved seller’s logo and banner are published' }, 409);

  const base = `${env('SUPABASE_URL')}/storage/v1/object/public/catalogue/`;
  const published: Record<string, string | null> = {};
  const skipped: string[] = [];
  for (const field of ['logo', 'banner'] as const) {
    const path = s[field] as string | null;
    if (!path || path.startsWith(base)) continue;               // nothing new to publish
    const id = /\/media\/([0-9a-f-]{36})\.[a-z]+$/.exec(path)?.[1];
    if (!path.startsWith(`${s.id}/media/`) || !id) { skipped.push(field); continue; }
    const { data: a } = await db.from('media_assets').select('status, kind').eq('id', id).eq('seller_id', s.id).maybeSingle();
    if (!a || !['passed', 'review'].includes(a.status) || !['seller_logo', 'seller_banner'].includes(a.kind)) { skipped.push(field); continue; }
    const { data: blob, error } = await db.storage.from('seller-uploads').download(path);
    if (error || !blob) { skipped.push(field); continue; }
    const target = `${s.id}/${path.split('/').pop()}`;
    const { error: upErr } = await db.storage.from('catalogue').upload(target, blob, { contentType: blob.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (upErr) throw upErr;
    published[field] = base + target;
  }
  if (Object.keys(published).length) {
    const { error } = await db.from('sellers').update(published).eq('id', s.id);
    if (error) throw error;
  }
  return json({ ok: true, status: s.status, published, skipped });
}));

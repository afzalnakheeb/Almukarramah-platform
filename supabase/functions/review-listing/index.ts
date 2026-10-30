// Staff decision on a seller listing in the queue. Approving copies the seller's screened private photos into the
// public catalogue (the only way a seller's file ever becomes public) and puts the listing live; it is the only path
// to "approved" (the database refuses it from anywhere else). Rejecting sends a note to the seller.
import { admin, caller, env, handle, json, staffRole, UUID } from '../_shared/util.ts';

type Body = { productId?: string; action?: 'approve' | 'reject'; note?: string };

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const db = admin();
  const role = await staffRole(db, user.id);
  if (!role || !['owner', 'manager', 'marketing'].includes(role)) return json({ error: 'Not allowed' }, 403);

  const { productId, action, note } = (await req.json()) as Body;
  if (!productId || !UUID.test(productId) || (action !== 'approve' && action !== 'reject')) return json({ error: 'Missing details' }, 400);
  const { data: p } = await db.from('products').select('id, seller_id, images, tailoring, category_id, listing_status, sellers(status)').eq('id', productId).single();
  if (!p?.seller_id) return json({ error: 'Listing not found' }, 404);
  const now = new Date().toISOString();

  if (action === 'reject') {
    if (!note?.trim()) return json({ error: 'Please write a short note for the seller' }, 400);
    if (!['pending_review', 'approved', 'check_pending'].includes(p.listing_status)) return json({ error: `This listing is ${p.listing_status}` }, 409);
    const { error } = await db.from('products').update({ listing_status: 'rejected', review_note: note.trim().slice(0, 1000), reviewed_at: now, reviewed_by: user.id }).eq('id', p.id);
    if (error) throw error;
    return json({ ok: true, status: 'rejected' });
  }

  if (p.listing_status !== 'pending_review') return json({ error: 'Only listings in the queue can be approved' }, 409);
  if ((p.sellers as { status?: string } | null)?.status !== 'approved') return json({ error: 'Approve the seller first' }, 409);

  // every photo must be a screened asset of this seller that passed (or that staff are now approving after review)
  const paths = (p.images as string[]) ?? [];
  const media = paths.filter((x) => !/^https:\/\//.test(x));
  const { data: assets } = media.length ? await db.from('media_assets').select('path, status').in('path', media) : { data: [] };
  const ok = new Map(((assets ?? []) as { path: string; status: string }[]).map((a) => [a.path, a.status]));
  if (media.some((x) => !['passed', 'review'].includes(ok.get(x) ?? ''))) return json({ error: 'A photo has not passed the photo check' }, 409);

  const base = `${env('SUPABASE_URL')}/storage/v1/object/public/catalogue/`;
  const publish = async (path: string): Promise<string> => {
    if (/^https:\/\//.test(path)) {
      if (path.startsWith(`${base}${p.seller_id}/`)) return path;   // already public from an earlier approval
      throw new Error('A photo is not from the seller dashboard');
    }
    if (!path.startsWith(`${p.seller_id}/media/`)) throw new Error('A photo is outside the seller folder');
    const { data: blob, error } = await db.storage.from('seller-uploads').download(path);
    if (error || !blob) throw new Error(`Photo missing: ${path}`);
    const target = `${p.seller_id}/${path.split('/').pop()}`;
    const { error: upErr } = await db.storage.from('catalogue').upload(target, blob, { contentType: blob.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (upErr) throw upErr;
    return base + target;
  };

  const images = await Promise.all(paths.map(publish));
  // design-option pictures (made to measure) are published the same way
  const tailoring = p.tailoring as { options?: { choices?: { image?: string }[] }[] } | null;
  if (tailoring?.options) {
    for (const o of tailoring.options) for (const c of o.choices ?? []) if (c.image) c.image = await publish(c.image);
  }
  const { error: uErr } = await db.from('products').update({
    images, tailoring, listing_status: 'approved', is_active: true,
    review_note: note?.trim() ? note.trim().slice(0, 1000) : null, reviewed_at: now, reviewed_by: user.id,
  }).eq('id', p.id);
  if (uErr) throw uErr;
  if (p.category_id) await db.from('categories').update({ is_active: true }).eq('id', p.category_id).eq('kind', 'category');
  return json({ ok: true, status: 'approved', images });
}));

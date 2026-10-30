// Staff decision on a seller listing. Approving copies the seller's private photos into the public catalogue
// (the only way a seller's file ever becomes public) and puts the listing live. Rejecting sends a note to the seller.
import { admin, caller, env, handle, json, staffRole } from '../_shared/util.ts';

type Body = { productId?: string; action?: 'approve' | 'reject'; note?: string };

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) throw new Error('Please sign in');
  const db = admin();
  const role = await staffRole(db, user.id);
  if (!role || !['owner', 'manager', 'marketing'].includes(role)) throw new Error('Not allowed');

  const { productId, action, note } = (await req.json()) as Body;
  if (!productId || !action) throw new Error('Missing details');
  const { data: p } = await db.from('products').select('id, seller_id, images, tailoring, category_id, listing_status, ai_check, sellers(status)').eq('id', productId).single();
  if (!p?.seller_id) throw new Error('Listing not found');

  if (action === 'reject') {
    if (!note?.trim()) throw new Error('Please write a short note for the seller');
    await db.from('products').update({ listing_status: 'rejected', review_note: note.trim().slice(0, 1000), reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq('id', p.id);
    return json({ ok: true, status: 'rejected' });
  }

  if (p.listing_status !== 'pending_review') throw new Error('Only listings the seller has submitted can be approved');
  if ((p.sellers as { status?: string } | null)?.status !== 'approved') throw new Error('Approve the seller first');
  if ((p.ai_check as { verdict?: string } | null)?.verdict === 'block') throw new Error('The AI check blocked this listing. Ask the seller to fix it first.');

  const base = `${env('SUPABASE_URL')}/storage/v1/object/public/catalogue/`;
  const publish = async (path: string): Promise<string> => {
    if (/^https:\/\//.test(path)) {
      // Already public from an earlier approval; anything else (outside links) is refused.
      if (path.startsWith(`${base}${p.seller_id}/`)) return path;
      throw new Error('A photo is not from the seller dashboard');
    }
    if (!path.startsWith(`${p.seller_id}/`)) throw new Error('A photo is outside the seller folder');
    const { data: blob, error } = await db.storage.from('seller-uploads').download(path);
    if (error || !blob) throw new Error(`Photo missing: ${path}`);
    const { error: upErr } = await db.storage.from('catalogue').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (upErr) throw upErr;
    return base + path;
  };

  const images = await Promise.all(((p.images as string[]) ?? []).map(publish));
  // Design-option pictures (tailor-made) are published the same way.
  const tailoring = p.tailoring as { options?: { choices?: { image?: string }[] }[] } | null;
  if (tailoring?.options) {
    for (const o of tailoring.options) for (const c of o.choices ?? []) if (c.image) c.image = await publish(c.image);
  }

  const { error: uErr } = await db.from('products').update({
    images, tailoring, listing_status: 'approved', is_active: true,
    review_note: note?.trim() ? note.trim().slice(0, 1000) : null, reviewed_at: new Date().toISOString(), reviewed_by: user.id,
  }).eq('id', p.id);
  if (uErr) throw uErr;
  if (p.category_id) await db.from('categories').update({ is_active: true }).eq('id', p.category_id);
  return json({ ok: true, status: 'approved', images });
}));

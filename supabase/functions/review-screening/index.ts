// Staff override of an automatic verdict, always with a reason (recorded as an 'override' screening run and in the
// audit log). Overturning a prohibited verdict voids the strike it caused.
//   image:   blocked -> passed (the quarantined file is restored to the seller's media), or passed/review -> rejected
//   listing: rejected by the check -> the staff queue, or -> rejected
import { admin, asCaller, caller, handle, json, staffRole, UUID } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const db = admin();
  const role = await staffRole(db, user.id);
  if (!role || !['owner', 'manager', 'marketing'].includes(role)) return json({ error: 'Not allowed' }, 403);
  const { subject, id, outcome, reason } = (await req.json()) as { subject?: string; id?: string; outcome?: string; reason?: string };
  if (!id || !UUID.test(id) || !reason || reason.trim().length < 5) return json({ error: 'Choose what to change and write the reason' }, 400);
  const me = asCaller(req);

  if (subject === 'image') {
    const { data: a } = await db.from('media_assets').select('id, seller_id, bucket, path, status, mime').eq('id', id).maybeSingle();
    if (!a) return json({ error: 'Not found' }, 404);
    let newPath: string | null = null;
    if (outcome === 'passed') {
      if (a.status !== 'blocked' && a.status !== 'review' && a.status !== 'rejected') return json({ error: 'Nothing to override' }, 409);
      if (a.status === 'blocked') {
        if (a.bucket !== 'quarantine' || !a.path) return json({ error: 'The quarantined file is no longer available' }, 410);
        const { data: blob } = await db.storage.from('quarantine').download(a.path);
        if (!blob) return json({ error: 'The quarantined file is no longer available' }, 410);
        newPath = `${a.seller_id}/media/${a.id}.${a.path.split('.').pop()}`;
        const { error } = await db.storage.from('seller-uploads').upload(newPath, blob, { contentType: a.mime, upsert: true });
        if (error) throw error;
        await db.storage.from('quarantine').remove([a.path]);
      } else if (!a.path) {
        return json({ error: 'The file was removed; ask the seller to upload it again' }, 410);
      }
    } else if (outcome === 'rejected') {
      if (a.path && a.bucket === 'seller-uploads') await db.storage.from('seller-uploads').remove([a.path]);
    } else {
      return json({ error: 'Unknown outcome' }, 400);
    }
    const { error } = await me.rpc('mp_override_screening', { p_subject: 'image', p_id: id, p_outcome: outcome, p_reason: reason.trim(), p_path: newPath });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  if (subject === 'listing') {
    const { error } = await me.rpc('mp_override_screening', { p_subject: 'listing', p_id: id, p_outcome: outcome, p_reason: reason.trim(), p_path: null });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: 'Unknown subject' }, 400);
}));

// Scheduled every few minutes (x-cron-secret): finishes screenings that could not complete (model unavailable),
// and deletes quarantined files after the retention period (their hashes stay blocked).
import { checkContext, runListingCheck, screenAsset, type Asset } from '../_shared/media.ts';
import { admin, cronAuthorized, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  if (!cronAuthorized(req)) return json({ error: 'unauthorised' }, 401);
  const db = admin();
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const done = { images: 0, listings: 0, deleted: 0, errors: 0 };

  const { data: assets } = await db.from('media_assets').select('*').eq('status', 'pending').lt('attempts', 8).lt('updated_at', ago(2))
    .not('path', 'is', null).order('updated_at').limit(10);
  for (const a of (assets ?? []) as Asset[]) {
    try { await screenAsset(db, a); done.images++; } catch (e) { console.error('retry image', a.id, e); done.errors++; }
  }

  const { data: listings } = await db.from('products').select('id').eq('listing_status', 'check_pending').lt('submitted_at', ago(3)).order('submitted_at').limit(5);
  for (const l of listings ?? []) {
    try { const c = await checkContext(db, l.id); if (c) { await runListingCheck(db, c); done.listings++; } } catch (e) { console.error('retry listing', l.id, e); done.errors++; }
  }

  const { data: old } = await db.from('media_assets').select('id, path').eq('status', 'blocked').is('deleted_at', null).lt('delete_after', new Date().toISOString()).limit(50);
  for (const a of old ?? []) {
    if (a.path) await db.storage.from('quarantine').remove([a.path]);
    await db.from('media_assets').update({ path: null, deleted_at: new Date().toISOString() }).eq('id', a.id);
    done.deleted++;
  }
  return json(done);
}));

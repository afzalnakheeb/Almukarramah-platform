// Scheduled (x-cron-secret), every 15 minutes: asks the providers for news of parcels still on their way, for those
// that do not push it, and records it (de-duplicated). A failed delivery attempt is followed too: the courier tries
// again (review M4). Only providers that are switched on are asked: the sandbox, whose parcels move on by the clock,
// is off on a live project, so it can never mark a real parcel delivered.
import { adapterFor } from '../_shared/carriers/index.ts';
import { admin, cronAuthorized, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  if (!cronAuthorized(req)) return json({ error: 'unauthorised' }, 401);
  const db = admin();
  const { data: providers } = await db.from('carrier_providers').select('id').eq('active', true);
  const active = ((providers ?? []) as { id: string }[]).map((p) => p.id);
  if (!active.length) return json({ ok: true, checked: 0, updated: 0 });
  const { data: open } = await db.from('shipments').select('id, provider_id, provider_ref, tracking_number, created_at')
    .not('status', 'in', '(delivered,cancelled,returned)').in('provider_id', active).order('updated_at').limit(50);
  let updated = 0;
  for (const s of open ?? []) {
    try {
      const events = await adapterFor(s.provider_id, (n) => Deno.env.get(n)).track({ provider_ref: s.provider_ref ?? '', tracking_number: s.tracking_number ?? '', created_at: s.created_at });
      if (!events.length) continue;
      const { data } = await db.rpc('mp_record_shipment_event', { p_shipment: s.id, p_events: events.map((e) => ({ ...e, source: s.provider_id === 'sandbox' ? 'sandbox' : 'provider' })) });
      if ((data as { added: number } | null)?.added) updated++;
    } catch (e) {
      console.error('sync', s.id, e);
    }
  }
  return json({ ok: true, checked: open?.length ?? 0, updated });
}));

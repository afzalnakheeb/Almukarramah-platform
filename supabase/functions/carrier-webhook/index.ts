// Tracking pushed by a carrier provider: /carrier-webhook?provider=<id>. The signature is checked against the raw
// body before anything is read; events are de-duplicated and never move a parcel backwards (mp_record_shipment_event).
import { adapterFor } from '../_shared/carriers/index.ts';
import { admin, json } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const provider = new URL(req.url).searchParams.get('provider') ?? '';
  if (!/^[a-z0-9_-]{2,30}$/.test(provider)) return json({ error: 'unknown provider' }, 400);
  const raw = await req.text();
  const adapter = adapterFor(provider, (n) => Deno.env.get(n));
  if (!(await adapter.verifyWebhook(req.headers, raw))) return json({ error: 'bad signature' }, 401);
  const db = admin();
  let added = 0;
  for (const group of adapter.parseWebhook(raw)) {
    const { data: s } = await db.from('shipments').select('id').eq('provider_id', provider).eq('tracking_number', group.tracking_number).maybeSingle();
    if (!s) continue;
    const { data, error } = await db.rpc('mp_record_shipment_event', { p_shipment: s.id, p_events: group.events.map((e) => ({ ...e, source: 'webhook' })) });
    if (error) return json({ error: error.message }, 500);
    added += (data as { added: number }).added;
  }
  return json({ ok: true, added });
});

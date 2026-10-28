// Sends invoices to ZATCA (Phase 2). Run on a schedule (every 15 minutes); simplified invoices must be reported within 24 hours.
//
// Two routes, chosen with the ZATCA_MODE secret:
//   provider — a ZATCA-certified e-invoicing provider signs and reports for us.
//              Set ZATCA_PROVIDER_URL and ZATCA_PROVIDER_KEY; adapt toProvider() to that provider's API.
//   direct   — we sign with our own CSID from the Fatoora portal and call ZATCA's reporting API ourselves.
//              Needs onboarding (CSR, compliance checks, production CSID) first; not enabled until then.
// Until ZATCA notifies our Phase 2 wave, invoices stay 'not_sent' and Phase 1 (QR + stored invoice) applies.
import { admin, env, handle, json } from '../_shared/util.ts';
import { chainInvoice } from '../_shared/zatca.ts';

type Invoice = { id: string; number: string; uuid: string; hash: string; xml: string; doc: string };

async function toProvider(inv: Invoice) {
  const res = await fetch(env('ZATCA_PROVIDER_URL'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('ZATCA_PROVIDER_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceNumber: inv.number, uuid: inv.uuid, invoiceHash: inv.hash, invoiceXml: btoa(unescape(encodeURIComponent(inv.xml))) }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

Deno.serve(handle(async (req) => {
  // Called by the Supabase scheduler or by staff; protect with a shared secret.
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'unauthorised' }, 401);
  const mode = Deno.env.get('ZATCA_MODE') ?? 'off';
  if (mode === 'off') return json({ skipped: 'ZATCA_MODE is off (Phase 1 only)' });
  if (mode === 'direct') return json({ skipped: 'Direct mode needs Fatoora onboarding and a production CSID first' });

  const db = admin();
  const { data } = await db.from('invoices').select('id, number, uuid, hash, xml, doc, pih').eq('zatca_status', 'not_sent').order('icv').limit(50);
  const results = [];
  for (const inv of (data ?? []) as (Invoice & { pih: string | null })[]) {
    // Build the hash chain strictly in ICV order (this job must never run twice at the same time).
    if (!inv.pih) {
      const { data: last } = await db.rpc('last_invoice_hash');
      const chained = await chainInvoice(inv.xml, String(last));
      await db.from('invoices').update({ pih: String(last), hash: chained.hash, xml: chained.xml }).eq('id', inv.id);
      await db.rpc('set_last_invoice_hash', { p_hash: chained.hash });
      inv.xml = chained.xml;
      inv.hash = chained.hash;
    }
    const r = await toProvider(inv);
    await db.from('invoices').update({
      zatca_status: r.ok ? 'reported' : 'rejected', zatca_response: r.body, sent_at: new Date().toISOString(),
    }).eq('id', inv.id);
    results.push({ number: inv.number, ok: r.ok });
  }
  return json({ reported: results });
}));

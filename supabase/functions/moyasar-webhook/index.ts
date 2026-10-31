// Moyasar sends payment events here (set the URL and secret token in the Moyasar dashboard).
// We never trust the event body alone: the payment is re-read from Moyasar before anything changes.
//
// Safe to repeat (review H3, M10): marking the order paid, handing the parcels on and taking stock happen in ONE
// database transaction (mp_payment_received), only if the order was still waiting for payment; the ZATCA invoice is
// issued once per order (mp_issue_document), whoever asks first. So when anything fails half way, Moyasar's retry (or
// the finish-pending job) completes the rest, and two deliveries at the same moment do it once.
import { getPayment } from '../_shared/moyasar.ts';
import { admin, env, json } from '../_shared/util.ts';
import { ensureInvoice } from '../_shared/zatca.ts';

Deno.serve(async (req) => {
  let event: { type?: string; secret_token?: string; data?: { id?: string } };
  try {
    event = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (event.secret_token !== env('MOYASAR_WEBHOOK_SECRET')) return json({ error: 'unauthorised' }, 401);
  if (event.type !== 'payment_paid') return json({ ignored: event.type });
  if (!event.data?.id) return json({ error: 'no payment' }, 400);

  // Moyasar not answering: a 5xx makes Moyasar retry later
  const payment = await getPayment(event.data.id).catch((e) => e as Error);
  if (payment instanceof Error) return json({ error: `could not read the payment: ${payment.message}` }, 503);
  if (payment.status !== 'paid') return json({ ignored: 'not paid' });

  const db = admin();
  const { data, error } = await db.rpc('mp_payment_received', {
    p: { id: payment.id, amount: payment.amount, currency: payment.currency, token: payment.source?.token ?? null,
         invoice_id: payment.invoice_id ?? null, order_id: payment.metadata?.order_id ?? null },
  });
  // nothing was changed: Moyasar retries, and the retry does it all
  if (error) return json({ error: error.message }, 500);
  const r = data as { found: boolean; order_id?: string; applied?: boolean; status?: string; mismatch?: boolean; second_payment?: boolean; stray?: boolean };
  if (!r.found) return json({ error: 'order not found' }, 404);
  if (r.mismatch) {
    // recorded for our team (payment_issues): refunded or settled from the dashboard
    console.error('Amount mismatch', payment.id, r.order_id);
    return json({ error: 'amount mismatch' }, 409);
  }
  // a payment for an order no longer waiting (cancelled meanwhile, or already paid with another payment): kept for our
  // team to refund, or to revive the order with, never dropped (review N2, REVIEW-2); Moyasar need not send it again
  if (r.stray) return json({ ok: true, applied: false, stray: true, status: r.status });

  // ZATCA tax invoice (Phase 1 now; reported in Phase 2 by zatca-report) for what WE sell. Issued once per order: a
  // retry of this webhook issues one that failed before. Sub-orders a seller invoices are left out, and so are duties.
  try {
    const invoice = await ensureInvoice(db, r.order_id!);
    return json({ ok: true, applied: r.applied, invoice: invoice?.number ?? null, ...(r.second_payment ? { second_payment: true } : {}) });
  } catch (e) {
    // the payment stands; the missing invoice is on the dashboard and finish-pending (or this webhook's retry) issues it
    console.error('invoice not issued', r.order_id, e);
    await db.from('audit_log').insert({ actor_label: 'moyasar-webhook', table_name: 'orders', row_id: r.order_id, action: 'INVOICE_PENDING', new_data: { error: String((e as Error).message ?? e) } });
    return json({ ok: true, applied: r.applied, invoice: null, invoice_pending: true });
  }
});

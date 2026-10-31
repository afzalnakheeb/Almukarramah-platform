// Finishes what a failure left half done (review H3). Scheduled every 15 minutes (x-cron-secret), and run by our team
// from the dashboard ("Finish pending work": owner, manager, finance). Every step is safe to repeat:
// * paid orders whose parcels were never handed on (an order paid before this fix, or by an older function version):
//   handed on and stock taken, once (mp_order_paid only moves sub-orders still waiting for payment);
// * paid orders with no ZATCA tax invoice: issued (once per order; the counter never skips a number);
// * refunds with no credit note: issued from the order's invoice;
// * refunds still waiting for Moyasar's answer: reconciled with Moyasar (never marked failed on a guess).
// What cannot be finished (a multi-rate order, Moyasar unreachable, a refund made outside the platform) stays on the
// dashboard with the reason in the answer.
import { graceMinutes, reconcileRefund } from '../_shared/refunds.ts';
import { admin, caller, cronAuthorized, fail, handle, json, staffRole } from '../_shared/util.ts';
import { ensureInvoice, issueCreditNote } from '../_shared/zatca.ts';

type Work = { orders_without_invoice: string[]; orders_not_handed_on: string[]; credit_notes: string[]; refunds_processing: string[];
  orders_without_invoice_old?: string[]; payment_issues?: string[] };

Deno.serve(handle(async (req) => {
  const db = admin();
  if (!cronAuthorized(req)) {
    const user = await caller(req);
    const role = user ? await staffRole(db, user.id) : null;
    if (!role || !['owner', 'manager', 'finance'].includes(role)) return fail(403, 'Not allowed', 'غير مسموح', 'not_allowed');
  }
  const minAge = Number(Deno.env.get('FINISH_PENDING_MIN_AGE_SECONDS') ?? '120');
  const { data, error } = await db.rpc('mp_pending_work', { p_limit: 25, p_min_age_seconds: Number.isFinite(minAge) ? minAge : 120 });
  if (error) throw error;
  const w = data as Work;
  const done: Record<string, unknown[]> = { handed_on: [], invoices: [], credit_notes: [], refunds: [], left: [] };

  for (const id of w.orders_not_handed_on) {
    const { data: r, error: e } = await db.rpc('mp_order_paid', { p_order: id });
    if (e) done.left.push({ order: id, step: 'hand on', error: e.message });
    else done.handed_on.push({ order: id, ...(r as object) });
  }
  for (const id of w.orders_without_invoice) {
    try {
      const inv = await ensureInvoice(db, id);
      done.invoices.push({ order: id, invoice: inv?.number ?? null });
    } catch (e) {
      done.left.push({ order: id, step: 'invoice', error: String((e as Error).message ?? e) });
    }
  }
  for (const id of w.credit_notes) {
    try {
      const note = await issueCreditNote(db, id);
      done.credit_notes.push({ refund: id, credit_note: note?.number ?? null });
    } catch (e) {
      done.left.push({ refund: id, step: 'credit note', error: String((e as Error).message ?? e) });
    }
  }
  const grace = graceMinutes((k) => Deno.env.get(k));
  for (const id of w.refunds_processing) {
    try {
      const r = await reconcileRefund(db, id, grace);
      (r.state === 'succeeded' || r.state === 'failed' ? done.refunds : done.left).push(r);
    } catch (e) {
      done.left.push({ refund: id, step: 'reconcile', error: String((e as Error).message ?? e) });
    }
  }
  // what only our team can settle, listed every time until it is (review N2, N5): an old or refunded order without its
  // invoice (never invoiced today by a job: the accountant decides), and payments to refund or attach
  for (const id of w.orders_without_invoice_old ?? []) done.left.push({ order: id, step: 'old order without invoice', error: 'for our team: settle it with the accountant' });
  for (const id of w.payment_issues ?? []) done.left.push({ payment_issue: id, step: 'payment to resolve', error: 'for finance: refund it, revive the order with it, or close it' });
  if (Object.entries(done).some(([k, x]) => x.length && k !== 'left') || done.left.some((x) => !('payment_issue' in (x as object)) && (x as { step?: string }).step !== 'old order without invoice')) {
    await db.from('audit_log').insert({ actor_label: 'finish-pending', table_name: 'orders', row_id: '', action: 'FINISH_PENDING', new_data: done });
  }
  return json({ ok: true, ...done });
}));

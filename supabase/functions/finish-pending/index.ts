// Finishes what a failure left half done (review H3). Scheduled every 15 minutes (x-cron-secret), and run by our team
// from the dashboard ("Finish pending work": owner, manager, finance). Every step is safe to repeat:
// * paid orders whose parcels were never handed on (an order paid before this fix, or by an older function version):
//   handed on and stock taken, once (mp_order_paid only moves sub-orders still waiting for payment);
// * paid orders with no ZATCA tax invoice: issued (once per order; the counter never skips a number);
// * refunds with no credit note: issued from the order's invoice;
// * refunds still waiting for Moyasar's answer: reconciled with Moyasar (never marked failed on a guess);
// * orders with a refund marked failed in the last three days: Moyasar is asked again whether it completed it after
//   all (at most hourly); what it shows is listed for finance on the refunds page, never recorded on a guess (R3-2);
// * returns accepted for sending back whose items never came: closed once `return_autoclose_days` (30) have passed,
//   so they stop holding the seller's sale; never one the customer has sent back (Afzal, 31 October;
//   mp_autoclose_returns tells both sides and writes each closure to the audit log).
// What cannot be finished (a multi-rate order, Moyasar unreachable, a refund made outside the platform) stays on the
// dashboard with the reason in the answer.
import { getPayment } from '../_shared/moyasar.ts';
import { graceMinutes, reconcileRefund } from '../_shared/refunds.ts';
import { admin, caller, cronAuthorized, fail, handle, json, staffRole } from '../_shared/util.ts';
import { ensureInvoice, issueCreditNote } from '../_shared/zatca.ts';

type Work = { orders_without_invoice: string[]; orders_not_handed_on: string[]; credit_notes: string[]; refunds_processing: string[];
  orders_without_invoice_old?: string[]; payment_issues?: string[]; orders_to_check?: string[] };

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
  const done: Record<string, unknown[]> = { handed_on: [], invoices: [], credit_notes: [], refunds: [], returns_closed: [], left: [] };

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
  for (const id of w.orders_to_check ?? []) {
    const { data: o } = await db.from('orders').select('payment_id, refunded_minor').eq('id', id).maybeSingle();
    if (!o?.payment_id) continue;
    try {
      const refunded = Number((await getPayment(o.payment_id)).refunded ?? 0);
      await db.rpc('mp_note_moyasar_refunded', { p_order: id, p_refunded: refunded });
      if (refunded > Number(o.refunded_minor ?? 0)) done.left.push({ order: id, step: 'refund in Moyasar not recorded', error: 'for finance: record it on the refunds page' });
    } catch (e) {
      done.left.push({ order: id, step: 'check with Moyasar', error: String((e as Error).message ?? e) });
    }
  }
  // returns whose items were never sent back: closed after the days Afzal set, each told and logged in the database
  const { data: closed, error: closeErr } = await db.rpc('mp_autoclose_returns', { p_limit: 50 });
  if (closeErr) done.left.push({ step: 'close returns never sent back', error: closeErr.message });
  else done.returns_closed.push(...((closed as { closed: string[] } | null)?.closed ?? []));
  // what only our team can settle, listed every time until it is (review N2, N5): an old or refunded order without its
  // invoice (never invoiced today by a job: the accountant decides), and payments to refund or attach
  for (const id of w.orders_without_invoice_old ?? []) done.left.push({ order: id, step: 'old order without invoice', error: 'for our team: settle it with the accountant' });
  for (const id of w.payment_issues ?? []) done.left.push({ payment_issue: id, step: 'payment to resolve', error: 'for finance: refund it, revive the order with it, or close it' });
  if (Object.entries(done).some(([k, x]) => x.length && k !== 'left') || done.left.some((x) => !('payment_issue' in (x as object)) && (x as { step?: string }).step !== 'old order without invoice')) {
    await db.from('audit_log').insert({ actor_label: 'finish-pending', table_name: 'orders', row_id: '', action: 'FINISH_PENDING', new_data: done });
  }
  return json({ ok: true, ...done });
}));

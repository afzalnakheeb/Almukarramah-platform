// Staff-only refunds (owner, manager, finance; support within its limit). The amount is worked out in the database
// from the lines and what is still refundable (mp_prepare_refund): a whole order, a parcel (a seller's cancellation),
// an approved return, or chosen lines with their delivery and duties. It is reserved under an idempotency key before
// Moyasar is asked, and a return is refunded only once whatever the key (review H1). Then Moyasar refunds that amount,
// the database records it (order, lines, stock for items that came back fit to sell, the return, the sellers'
// statements, the customer's notification), and a ZATCA credit note is issued from our invoice for the part we
// invoiced (our products, the parcels we invoice, their delivery; never duties).
//
// When Moyasar's answer does not come (a timeout, a dropped connection, a 5xx page), the refund is NOT marked failed:
// Moyasar may have made it. It stays "processing", is checked against Moyasar at once and later ("reconcile": this
// function with action "reconcile", or finish-pending), and no other refund can start on the order meanwhile. Only a
// definite refusal from Moyasar marks it failed (review H2). A credit note that cannot be issued stays pending and is
// issued by finish-pending; nothing is skipped silently.
import { MoyasarError, refundPayment } from '../_shared/moyasar.ts';
import { graceMinutes, reconcileRefund } from '../_shared/refunds.ts';
import { admin, caller, dbError, fail, handle, json, staffRole, UUID } from '../_shared/util.ts';
import { issueCreditNote } from '../_shared/zatca.ts';

type Prepared = {
  id: string; status: 'processing' | 'succeeded' | 'failed'; duplicate: boolean; currency: string; amount_minor: number; platform_minor: number;
  payment_id: string; reason: string; error: string | null; credit_note: string | null; credit_note_status: string;
  order: { id: string; number: number };
};

Deno.serve(handle(async (req) => {
  const db = admin();
  const user = await caller(req);
  const role = user ? await staffRole(db, user.id) : null;
  if (!user || !role || !['owner', 'manager', 'finance', 'support'].includes(role)) return fail(403, 'Not allowed', 'غير مسموح', 'not_allowed');
  const grace = graceMinutes((k) => Deno.env.get(k));

  const body = (await req.json()) as {
    action?: 'refund' | 'reconcile'; refundId?: string;
    orderId?: string; reason?: string; key?: string; returnId?: string; subOrderId?: string;
    lines?: { orderItemId: string; quantity: number }[]; shipping?: string[]; duties?: string[]; orderShipping?: boolean; restock?: boolean;
  };

  // ------------------------------------------------ settle a refund still waiting for Moyasar's answer
  if (body.action === 'reconcile') {
    if (!body.refundId || !UUID.test(body.refundId)) return fail(400, 'Refund not found', 'لم يُعثر على الاسترداد');
    const r = await reconcileRefund(db, body.refundId, grace);
    await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: body.refundId, action: 'REFUND_RECONCILE', new_data: r });
    return json({ ok: true, ...r });
  }

  if (!body.orderId || !UUID.test(body.orderId)) return fail(400, 'Order not found', 'لم يُعثر على الطلب');
  // the admin page sends a key per press; an older caller without one gets a fresh key (the database still stops a
  // second refund of the same return and anything beyond what is left)
  const key = body.key && /^[A-Za-z0-9_-]{8,80}$/.test(body.key) ? body.key : `rf_${crypto.randomUUID().replace(/-/g, '')}`;
  const p: Record<string, unknown> = { key, reason: (body.reason ?? '').slice(0, 500), restock: body.restock === true };
  if (body.returnId && UUID.test(body.returnId)) p.return_id = body.returnId;
  else if (body.subOrderId && UUID.test(body.subOrderId)) p.sub_order_id = body.subOrderId;
  else if (body.lines || body.shipping || body.duties || body.orderShipping) {
    p.lines = (body.lines ?? []).filter((l) => UUID.test(l.orderItemId)).map((l) => ({ order_item_id: l.orderItemId, quantity: Math.floor(Number(l.quantity)) }));
    p.shipping = (body.shipping ?? []).filter((x) => UUID.test(x));
    p.duties = (body.duties ?? []).filter((x) => UUID.test(x));
    p.order_shipping = body.orderShipping === true;
  }

  const { data, error } = await db.rpc('mp_prepare_refund', { p_order: body.orderId, p, p_user: user.id });
  if (error) return dbError(error, /still being processed|already been refunded/.test(error.message) ? 409 : 400);
  const prep = data as Prepared;
  if (prep.duplicate) {
    if (prep.status === 'succeeded') return json({ ok: true, refund: prep.id, amount: prep.amount_minor, currency: prep.currency, creditNote: prep.credit_note, duplicate: true });
    if (prep.status === 'failed') return fail(409, `This refund failed: ${prep.error ?? 'unknown'}. Start a new one.`, 'لم يتم هذا الاسترداد. ابدأ استردادًا جديدًا.', 'refund_failed');
    return fail(409, 'This refund is still waiting for Moyasar\'s answer: use "Check with Moyasar" before trying again.',
      'هذا الاسترداد ما زال بانتظار رد ميسر: استخدم «التحقق مع ميسر» قبل المحاولة مرة أخرى.', 'refund_processing', { refund: prep.id });
  }

  try {
    await refundPayment(prep.payment_id, prep.amount_minor);
  } catch (e) {
    if (e instanceof MoyasarError && e.definite) {
      // Moyasar answered and refused: nothing was refunded
      await db.rpc('mp_complete_refund', { p_refund: prep.id, p_ok: false, p_provider_ref: null, p_error: e.message.slice(0, 900) });
      return fail(409, `Moyasar refused the refund: ${e.message}`, 'رفضت ميسر عملية الاسترداد.', 'refund_refused', { refund: prep.id });
    }
    // We do not know whether Moyasar made it: never "failed" on a guess. Read the payment back now; if that is not
    // conclusive the refund stays processing and is reconciled later (no new refund can start on the order meanwhile).
    console.error('refund answer lost', prep.id, e);
    const r = await reconcileRefund(db, prep.id, grace).catch((x) => ({ refund: prep.id, state: 'unreachable' as const, detail: String(x) }));
    if (r.state === 'succeeded') {
      await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'orders', row_id: prep.order.id, action: 'REFUND',
        new_data: { refund: prep.id, amount_minor: prep.amount_minor, currency: prep.currency, reason: prep.reason, credit_note: r.creditNote ?? null, reconciled: true } });
      return json({ ok: true, refund: prep.id, amount: prep.amount_minor, currency: prep.currency, creditNote: r.creditNote ?? null,
                    creditNotePending: prep.platform_minor > 0 && !r.creditNote, reconciled: true });
    }
    return fail(202, 'Moyasar did not confirm the refund. It stays "processing": do not refund again. Use "Check with Moyasar" in a few minutes.',
      'لم تؤكد ميسر عملية الاسترداد، وهي ما زالت «قيد المعالجة»: لا تُعد الاسترداد. استخدم «التحقق مع ميسر» بعد دقائق.', 'refund_unconfirmed',
      { pending: true, refund: prep.id, state: r.state });
  }
  const { error: doneErr } = await db.rpc('mp_complete_refund', { p_refund: prep.id, p_ok: true, p_provider_ref: `${prep.payment_id}:${prep.amount_minor}`, p_error: null });
  if (doneErr) {
    // the money went back; the record catches up through reconcile (it stays "processing" and shows in the list)
    console.error('refund recorded late', prep.id, doneErr);
    await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: prep.id, action: 'REFUND_UNRECORDED', new_data: { error: doneErr.message } });
    return fail(202, 'Moyasar refunded it; recording it is waiting: use "Check with Moyasar".', 'أعادت ميسر المبلغ، وتسجيله بانتظار «التحقق مع ميسر».', 'refund_unrecorded',
      { ok: true, refund: prep.id, recorded: false });
  }

  // the ZATCA credit note for what we invoiced, from our invoice (its rate and exchange rate)
  let creditNote: string | null = null;
  if (prep.platform_minor > 0) {
    try {
      creditNote = (await issueCreditNote(db, prep.id))?.number ?? null;
    } catch (e) {
      console.error('credit note not issued', prep.id, e);
      await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: prep.id, action: 'CREDIT_NOTE_PENDING', new_data: { error: String((e as Error).message ?? e) } });
    }
  }
  await db.from('audit_log').insert({
    actor: user.id, actor_label: user.email, table_name: 'orders', row_id: prep.order.id, action: 'REFUND',
    new_data: { refund: prep.id, amount_minor: prep.amount_minor, currency: prep.currency, reason: prep.reason, credit_note: creditNote },
  });
  return json({ ok: true, refund: prep.id, amount: prep.amount_minor, currency: prep.currency, creditNote, creditNotePending: prep.platform_minor > 0 && !creditNote });
}));

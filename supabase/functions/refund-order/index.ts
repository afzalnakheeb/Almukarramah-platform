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
//
// Before any new refund, the payment is read from Moyasar: if Moyasar has refunded more than we recorded (a refund
// marked failed that Moyasar completed late, or one made in the Moyasar dashboard), nothing new is refunded until
// finance settles it (review N7, REVIEW-2). Finance settles a refund by hand with a reason ("resolve"), records a
// refund made in the Moyasar dashboard ("record_moyasar": against Moyasar's own figures, review R3-2), and decides on
// payments taken for orders no longer waiting ("payment_issue": refund it, revive the order with it, or close it;
// review N2). What Moyasar shows is noted at every read, so the refunds page lists what we have not recorded.
import { getPayment, MoyasarError, refundPayment } from '../_shared/moyasar.ts';
import { graceMinutes, reconcileRefund } from '../_shared/refunds.ts';
import { admin, caller, dbError, type Db, fail, handle, json, staffRole, UUID } from '../_shared/util.ts';
import { ensureInvoice, issueCreditNote } from '../_shared/zatca.ts';

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
    action?: 'refund' | 'reconcile' | 'resolve' | 'payment_issue' | 'record_moyasar'; refundId?: string; outcome?: 'failed' | 'succeeded';
    issueId?: string; do?: 'refund' | 'attach' | 'dismiss'; amount?: number; reference?: string; goodwill?: boolean;
    orderId?: string; reason?: string; key?: string; returnId?: string; subOrderId?: string;
    lines?: { orderItemId: string; quantity: number }[]; shipping?: string[]; duties?: string[]; orderShipping?: boolean; restock?: boolean;
  };
  const finance = ['owner', 'manager', 'finance'].includes(role ?? '');

  // ------------------------------------------------ settle a refund by hand (finance, with a reason: N7)
  if (body.action === 'resolve') {
    if (!finance) return fail(403, 'Not allowed', 'غير مسموح', 'not_allowed');
    if (!body.refundId || !UUID.test(body.refundId) || (body.outcome !== 'failed' && body.outcome !== 'succeeded')) return fail(400, 'Refund not found', 'لم يُعثر على الاسترداد');
    const reason = (body.reason ?? '').trim();
    if (reason.length < 10) return fail(400, 'Write the reason (what you checked in Moyasar)', 'اكتب السبب (ما تحققت منه في ميسر)');
    const { data: st, error: stErr } = await db.rpc('mp_refund_state', { p_refund: body.refundId });
    if (stErr || !st) return fail(404, 'Refund not found', 'لم يُعثر على الاسترداد');
    const f = st as { id: string; status: string; payment_id: string | null; amount_minor: number; order_refunded_minor: number; order_id: string };
    // what Moyasar shows decides what may be recorded: a refund is succeeded only if Moyasar holds it
    let extra: number | null = null;
    if (f.payment_id) {
      try {
        const refunded = Number((await getPayment(f.payment_id)).refunded ?? 0);
        await db.rpc('mp_note_moyasar_refunded', { p_order: f.order_id, p_refunded: refunded });
        extra = refunded - f.order_refunded_minor;
      } catch (e) {
        return fail(503, `Moyasar could not be reached: ${(e as Error).message}`, 'تعذّر الوصول إلى ميسر، حاول بعد قليل.', 'moyasar_unreachable');
      }
    }
    if (body.outcome === 'succeeded' && (extra === null || extra < f.amount_minor)) {
      return fail(409, `Moyasar does not show this refund (it shows ${extra ?? 0} more refunded than we recorded)`, 'لا تُظهر ميسر هذا الاسترداد.', 'not_at_moyasar');
    }
    if (body.outcome === 'failed' && extra !== null && extra >= f.amount_minor) {
      return fail(409, 'Moyasar shows this refund was made: record it as succeeded', 'تُظهر ميسر أن هذا الاسترداد تم: سجّله ناجحًا.', 'at_moyasar');
    }
    const { data, error } = await db.rpc('mp_resolve_refund', { p_refund: f.id, p_user: user.id, p_outcome: body.outcome, p_reason: reason });
    if (error) return dbError(error, 409);
    const done = data as { id: string; status: string; recorded_late_as?: string };
    let creditNote: string | null = null;
    if (body.outcome === 'succeeded') {
      try {
        creditNote = (await issueCreditNote(db, done.recorded_late_as ?? f.id))?.number ?? null;
      } catch (e) {
        console.error('credit note left pending', f.id, e);   // finish-pending issues it
      }
    }
    await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: f.id, action: 'REFUND_SETTLED_BY_HAND',
                                        new_data: { outcome: body.outcome, reason, moyasar_extra: extra, recorded_as: done.recorded_late_as ?? f.id } });
    return json({ ok: true, refund: done.recorded_late_as ?? f.id, status: done.status, creditNote });
  }

  // ------------------------------------------------ a payment for an order no longer waiting (finance: N2)
  if (body.action === 'payment_issue') {
    if (!finance) return fail(403, 'Not allowed', 'غير مسموح', 'not_allowed');
    if (!body.issueId || !UUID.test(body.issueId) || !['refund', 'attach', 'dismiss'].includes(body.do ?? '')) return fail(400, 'Payment not found', 'لم يُعثر على الدفعة');
    const reason = (body.reason ?? '').trim();
    if (reason.length < 3) return fail(400, 'Write the reason', 'اكتب السبب');
    return settleIssue(db, user, body.issueId, body.do!, reason);
  }

  // ------------------------------------------------ a refund made in the Moyasar dashboard (finance: R3-2)
  if (body.action === 'record_moyasar') {
    if (!finance) return fail(403, 'Not allowed', 'غير مسموح', 'not_allowed');
    if (!body.orderId || !UUID.test(body.orderId)) return fail(400, 'Order not found', 'لم يُعثر على الطلب');
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0) return fail(400, 'Enter the amount Moyasar refunded', 'أدخل المبلغ الذي أعادته ميسر');
    const { data: ord } = await db.from('orders').select('payment_id, refunded_minor').eq('id', body.orderId).maybeSingle();
    if (!ord?.payment_id) return fail(404, 'Order not paid', 'الطلب غير مدفوع');
    // Moyasar's own figures decide: never more is recorded than Moyasar shows refunded and we have not recorded
    let refunded: number;
    try {
      refunded = Number((await getPayment(ord.payment_id)).refunded ?? 0);
    } catch (e) {
      return fail(503, `Moyasar could not be reached: ${(e as Error).message}`, 'تعذّر الوصول إلى ميسر، حاول بعد قليل.', 'moyasar_unreachable');
    }
    await db.rpc('mp_note_moyasar_refunded', { p_order: body.orderId, p_refunded: refunded });
    const p: Record<string, unknown> = { key: body.key, amount, reference: body.reference ?? '', reason: body.reason ?? '', restock: body.restock === true };
    if (body.goodwill) {
      p.goodwill = true;
      if (body.subOrderId && UUID.test(body.subOrderId)) p.sub_order_id = body.subOrderId;
    } else {
      p.lines = (body.lines ?? []).filter((l) => UUID.test(l.orderItemId)).map((l) => ({ order_item_id: l.orderItemId, quantity: Math.floor(Number(l.quantity)) }));
      p.shipping = (body.shipping ?? []).filter((x) => UUID.test(x));
      p.duties = (body.duties ?? []).filter((x) => UUID.test(x));
      p.order_shipping = body.orderShipping === true;
    }
    const { data, error } = await db.rpc('mp_record_moyasar_refund', { p_order: body.orderId, p, p_user: user.id, p_unrecorded: refunded - Number(ord.refunded_minor ?? 0) });
    if (error) return dbError(error, 409);
    const rec = data as Prepared;
    let creditNote: string | null = rec.credit_note ?? null;
    if (!rec.duplicate && rec.platform_minor > 0) {
      try {
        creditNote = (await issueCreditNote(db, rec.id))?.number ?? null;
      } catch (e) {
        console.error('credit note left pending', rec.id, e);   // finish-pending issues it
      }
      await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: rec.id, action: 'REFUND_RECORDED_FROM_MOYASAR',
                                          new_data: { order: body.orderId, amount_minor: amount, reference: body.reference, moyasar_refunded: refunded, credit_note: creditNote } });
    }
    return json({ ok: true, refund: rec.id, amount: rec.amount_minor, currency: rec.currency, creditNote, duplicate: rec.duplicate });
  }

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

  // Moyasar first: a refund it holds that we have not recorded (completed late, or made in its dashboard) is settled
  // before anything new is refunded, so nothing is ever refunded twice (N7)
  const { data: ord } = await db.from('orders').select('payment_id, refunded_minor').eq('id', body.orderId).maybeSingle();
  if (ord?.payment_id) {
    let moyasarRefunded: number;
    try {
      moyasarRefunded = Number((await getPayment(ord.payment_id)).refunded ?? 0);
    } catch (e) {
      return fail(503, `Moyasar could not be reached, so nothing was refunded: ${(e as Error).message}`, 'تعذّر الوصول إلى ميسر، ولم يُسترد شيء. حاول بعد قليل.', 'moyasar_unreachable');
    }
    await db.rpc('mp_note_moyasar_refunded', { p_order: body.orderId, p_refunded: moyasarRefunded });
    if (moyasarRefunded > Number(ord.refunded_minor ?? 0)) {
      const { data: waiting } = await db.from('refunds').select('id').eq('order_id', body.orderId).eq('status', 'processing').limit(1).maybeSingle();
      if (!waiting) {
        const unrecorded = moyasarRefunded - Number(ord.refunded_minor ?? 0);
        return fail(409, `Moyasar shows ${(unrecorded / 100).toFixed(2)} refunded on this payment that we have not recorded. Finance records it first, under "Refunds in Moyasar we have not recorded" on the refunds page (a failed refund Moyasar completed later is settled there by hand).`,
          'تُظهر ميسر مبلغًا مستردًا لم نسجّله. يسجّله فريق المالية أولًا في صفحة الاستردادات («استردادات في ميسر لم نسجّلها»).', 'moyasar_unrecorded', { unrecorded });
      }
    }
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

type Issue = { id: string; payment_id: string; order_id: string | null; kind: string; amount_minor: number; currency: string; status: string; age_seconds: number;
  order: { id: string; number: number; status: string } | null };

/**
 * Refund a payment to resolve in full, revive its order with it, or close it with a reason (N2). Both money actions read
 * the payment from Moyasar first (review R3-3): attaching needs the payment still paid in full, with nothing refunded;
 * a refund Moyasar already made (in its dashboard) is recorded as it is, never asked again.
 */
async function settleIssue(db: Db, user: { id: string; email?: string | null }, issueId: string, action: string, reason: string): Promise<Response> {
  const { data, error } = await db.rpc('mp_payment_issue', { p_issue: issueId });
  if (error || !data) return fail(404, 'Payment not found', 'لم يُعثر على الدفعة');
  const i = data as Issue;
  const settle = (status: string, note: string | null, err: string | null = null) =>
    db.rpc('mp_settle_payment_issue', { p_issue: i.id, p_user: user.id, p_status: status, p_note: note, p_error: err });

  if (action === 'dismiss') {
    const { error: e } = await settle('dismissed', reason);
    if (e) return dbError(e, 409);
    return json({ ok: true, status: 'dismissed' });
  }
  if (!['open', 'refund_pending'].includes(i.status)) return fail(409, `This payment is already ${i.status.replace('_', ' ')}`, 'سُوّيت هذه الدفعة من قبل', 'issue_settled');
  let pay: Awaited<ReturnType<typeof getPayment>>;
  try {
    pay = await getPayment(i.payment_id);
  } catch (e) {
    return fail(503, `Moyasar could not be reached: ${(e as Error).message}`, 'تعذّر الوصول إلى ميسر، حاول بعد قليل.', 'moyasar_unreachable');
  }
  const moyasarRefunded = Number(pay.refunded ?? 0);

  if (action === 'attach') {
    if (pay.status !== 'paid' || moyasarRefunded > 0 || Number(pay.amount) !== Number(i.amount_minor) || String(pay.currency) !== String(i.currency)) {
      return fail(409, `Moyasar shows this payment ${pay.status === 'paid' && moyasarRefunded === 0 ? 'with another amount' : `as ${pay.status}, ${(moyasarRefunded / 100).toFixed(2)} refunded`}: it cannot pay for the order. Refund it, or close it.`,
        'تُظهر ميسر أن هذه الدفعة لم تعد كاملة: لا يمكن أن يُدفع بها الطلب. استردها أو أغلقها.', 'moyasar_not_paid');
    }
    const { data: r, error: e } = await db.rpc('mp_attach_payment', { p_issue: i.id, p_user: user.id, p_note: reason });
    if (e) return dbError(e, 409);
    let invoice: string | null = null;
    try {
      invoice = i.order_id ? (await ensureInvoice(db, i.order_id))?.number ?? null : null;
    } catch (x) {
      console.error('invoice left pending', i.order_id, x);   // finish-pending issues it
    }
    return json({ ok: true, status: 'attached', order: r, invoice });
  }

  // refund it in full. Moyasar already shows it refunded (in its dashboard, or an earlier answer that was lost):
  // recorded as it is, never refunded again
  if (moyasarRefunded >= i.amount_minor) {
    if (i.status === 'open') {
      const { error: e0 } = await settle('refund_pending', reason);
      if (e0) return dbError(e0, 409);
    }
    const { error: e } = await settle('refunded', reason);
    if (e) return dbError(e, 409);
    await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'payment_issues', row_id: i.id, action: 'STRAY_PAYMENT_REFUNDED',
                                        new_data: { payment_id: i.payment_id, amount_minor: i.amount_minor, currency: i.currency, reason, already_at_moyasar: true } });
    return json({ ok: true, status: 'refunded', reconciled: true });
  }
  if (i.status === 'refund_pending') {
    // an earlier refund whose answer was lost and that Moyasar does not show yet
    if (i.age_seconds < 15 * 60) return fail(409, 'This refund is still waiting for Moyasar: try again in a few minutes', 'هذا الاسترداد بانتظار ميسر: حاول بعد دقائق.', 'refund_processing');
  } else {
    // reserved first, so a second press or a second person never refunds it twice
    const { error: e } = await settle('refund_pending', reason);
    if (e) return dbError(e, 409);
  }
  try {
    await refundPayment(i.payment_id, i.amount_minor - moyasarRefunded);
  } catch (e) {
    if (e instanceof MoyasarError && e.definite) {
      await settle('open', null, e.message.slice(0, 900));
      return fail(409, `Moyasar refused the refund: ${e.message}`, 'رفضت ميسر عملية الاسترداد.', 'refund_refused');
    }
    // not known: it stays refund_pending, and pressing again reads it back from Moyasar first
    return fail(202, 'Moyasar did not confirm the refund. It stays waiting: press again in a few minutes to check it.', 'لم تؤكد ميسر الاسترداد: اضغط مرة أخرى بعد دقائق للتحقق.', 'refund_unconfirmed', { pending: true });
  }
  const { error: e2 } = await settle('refunded', reason);
  if (e2) return dbError(e2, 409);
  await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'payment_issues', row_id: i.id, action: 'STRAY_PAYMENT_REFUNDED',
                                      new_data: { payment_id: i.payment_id, amount_minor: i.amount_minor, currency: i.currency, reason } });
  return json({ ok: true, status: 'refunded' });
}

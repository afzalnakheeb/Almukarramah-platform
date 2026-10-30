// Staff-only refunds (owner, manager, finance, support). The amount is worked out in the database from the lines and
// what is still refundable (mp_prepare_refund): a whole order, a parcel (a seller's cancellation), an approved return,
// or chosen lines with their delivery and duties. It is reserved under an idempotency key before Moyasar is asked, so
// pressing twice never refunds twice. Then Moyasar refunds that amount, the database records it (order, lines, stock
// for items that came back fit to sell, the return, the sellers' statements, the customer's notification), and a ZATCA
// credit note is issued against our invoice for the part we invoiced (our products, the parcels we invoice, their
// delivery; never duties). A credit note that cannot be issued is flagged for finance, never skipped silently.
import { refundPayment } from '../_shared/moyasar.ts';
import { admin, caller, handle, json, staffRole, UUID } from '../_shared/util.ts';
import { issueInvoice, type OrderForInvoice } from '../_shared/zatca.ts';

type Prepared = {
  id: string; status: 'processing' | 'succeeded' | 'failed'; duplicate: boolean; currency: string; amount_minor: number; platform_minor: number;
  payment_id: string; reason: string; error: string | null; credit_note: string | null; credit_note_status: string;
  invoice: { id: string; number: string } | null;
  order: { id: string; number: number; currency: string; ship_to: OrderForInvoice['ship_to'] };
  lines: { kind: 'item' | 'shipping' | 'duties'; quantity: number | null; amount_minor: number; vat_rate_bp: number | null; platform_invoiced: boolean;
           name_en: string | null; name_ar: string | null; unit_price_minor: number | null }[];
};

Deno.serve(handle(async (req) => {
  const db = admin();
  const user = await caller(req);
  const role = user ? await staffRole(db, user.id) : null;
  if (!user || !role || !['owner', 'manager', 'finance', 'support'].includes(role)) return json({ error: 'Not allowed' }, 403);

  const body = (await req.json()) as {
    orderId?: string; reason?: string; key?: string; returnId?: string; subOrderId?: string;
    lines?: { orderItemId: string; quantity: number }[]; shipping?: string[]; duties?: string[]; orderShipping?: boolean; restock?: boolean;
  };
  if (!body.orderId || !UUID.test(body.orderId)) return json({ error: 'Order not found' }, 400);
  // the admin page sends a key per press; an older caller without one gets a fresh key (the remaining amounts still
  // stop a second full refund)
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
  if (error) return json({ error: error.message }, 400);
  const prep = data as Prepared;
  if (prep.duplicate) {
    if (prep.status === 'succeeded') return json({ ok: true, refund: prep.id, amount: prep.amount_minor, creditNote: prep.credit_note, duplicate: true });
    if (prep.status === 'failed') return json({ error: `This refund failed: ${prep.error ?? 'unknown'}. Start a new one.` }, 409);
    // still processing: an earlier attempt may have reached Moyasar; finance checks there before anything is retried
    return json({ error: 'This refund is already being processed. Check the payment in Moyasar before trying again.' }, 409);
  }

  try {
    await refundPayment(prep.payment_id, prep.amount_minor);
  } catch (e) {
    await db.rpc('mp_complete_refund', { p_refund: prep.id, p_ok: false, p_provider_ref: null, p_error: String((e as Error).message ?? e).slice(0, 900) });
    throw e;
  }
  const { error: doneErr } = await db.rpc('mp_complete_refund', { p_refund: prep.id, p_ok: true, p_provider_ref: `${prep.payment_id}:${prep.amount_minor}`, p_error: null });
  if (doneErr) {
    // the money went back; the record must catch up (stays "processing" and shows in the stuck list)
    console.error('refund recorded late', prep.id, doneErr);
    await db.from('audit_log').insert({ actor: user.id, actor_label: user.email, table_name: 'refunds', row_id: prep.id, action: 'REFUND_UNRECORDED', new_data: { error: doneErr.message } });
    return json({ ok: true, refund: prep.id, recorded: false }, 202);
  }

  // the ZATCA credit note for what we invoiced
  let creditNote: string | null = null;
  const ours = prep.lines.filter((l) => l.platform_invoiced);
  if (prep.platform_minor > 0) {
    const forNote: OrderForInvoice = {
      id: prep.order.id, number: prep.order.number, currency: prep.order.currency, ship_to: prep.order.ship_to,
      total_minor: prep.platform_minor,
      shipping_minor: ours.filter((l) => l.kind === 'shipping').reduce((n, l) => n + l.amount_minor, 0),
      order_items: ours.filter((l) => l.kind === 'item').map((l) => ({
        name_en: l.name_en ?? 'Item', name_ar: l.name_ar ?? 'منتج', unit_price_minor: l.unit_price_minor ?? l.amount_minor,
        quantity: l.quantity ?? 1, line_total_minor: l.amount_minor, vat_rate_bp: l.vat_rate_bp,
      })),
    };
    try {
      const note = await issueInvoice(db, forNote, { doc: 'credit_note', originalInvoiceId: prep.invoice?.id, originalNumber: prep.invoice?.number, reason: prep.reason || 'Refund' });
      const { error: attachErr } = await db.rpc('mp_attach_credit_note', { p_refund: prep.id, p_invoice: note.id });
      if (attachErr) throw attachErr;
      creditNote = note.number;
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

// Moyasar sends payment events here (set the URL and secret token in the Moyasar dashboard).
// We never trust the event body alone: the payment is re-read from Moyasar before the order is marked paid.
import { getPayment } from '../_shared/moyasar.ts';
import { admin, env, json } from '../_shared/util.ts';
import { issueInvoice, type OrderForInvoice } from '../_shared/zatca.ts';

Deno.serve(async (req) => {
  const event = await req.json();
  if (event.secret_token !== env('MOYASAR_WEBHOOK_SECRET')) return json({ error: 'unauthorised' }, 401);
  if (event.type !== 'payment_paid') return json({ ignored: event.type });

  const payment = await getPayment(event.data.id);
  if (payment.status !== 'paid') return json({ ignored: 'not paid' });

  const db = admin();
  const { data: order } = await db
    .from('orders')
    .select('*, order_items(*)')
    .or(`payment_ref.eq.${payment.invoice_id ?? '-'},id.eq.${payment.metadata?.order_id ?? '00000000-0000-0000-0000-000000000000'}`)
    .maybeSingle();
  if (!order) return json({ error: 'order not found' }, 404);
  if (order.status !== 'pending_payment') return json({ ok: true, already: order.status });
  if (payment.amount !== order.total_minor || payment.currency !== order.currency) {
    console.error('Amount mismatch', payment, order.id);
    return json({ error: 'amount mismatch' }, 409);
  }

  await db.from('orders').update({ status: 'paid', payment_id: payment.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id);

  // stock
  for (const item of order.order_items) {
    if (!item.product_id) continue;
    const { data: p } = await db.from('products').select('stock').eq('id', item.product_id).single();
    if (p) await db.from('products').update({ stock: Math.max(0, p.stock - item.quantity) }).eq('id', item.product_id);
  }

  // membership / box club: activate and keep the saved card token for monthly charges
  if (order.kind === 'subscription' && order.subscription_id) {
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    await db.from('subscriptions').update({
      status: 'active', current_period_end: end.toISOString(), moyasar_token: payment.source?.token ?? null, updated_at: new Date().toISOString(),
    }).eq('id', order.subscription_id);
  }

  // ZATCA tax invoice (Phase 1 now; reported in Phase 2 by zatca-report)
  const invoice = await issueInvoice(db, order as OrderForInvoice);
  return json({ ok: true, invoice: invoice.number });
});

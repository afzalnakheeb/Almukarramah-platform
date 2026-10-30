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
    .select('*, order_items(*), sub_orders(id, invoicer, shipping_minor, duties_minor)')
    .or(`payment_ref.eq.${payment.invoice_id ?? '-'},id.eq.${payment.metadata?.order_id ?? '00000000-0000-0000-0000-000000000000'}`)
    .maybeSingle();
  if (!order) return json({ error: 'order not found' }, 404);
  if (order.status !== 'pending_payment') return json({ ok: true, already: order.status });
  if (payment.amount !== order.total_minor || payment.currency !== order.currency) {
    console.error('Amount mismatch', payment, order.id);
    return json({ error: 'amount mismatch' }, 409);
  }

  await db.from('orders').update({ status: 'paid', payment_id: payment.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', order.id);

  // sub-orders move on (ours accepted, sellers' waiting for them) and stock comes off, in the database
  const { error: paidErr } = await db.rpc('mp_order_paid', { p_order: order.id });
  if (paidErr) throw paidErr;

  // membership / box club: activate and keep the saved card token for monthly charges
  if (order.kind === 'subscription' && order.subscription_id) {
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    await db.from('subscriptions').update({
      status: 'active', current_period_end: end.toISOString(), moyasar_token: payment.source?.token ?? null, updated_at: new Date().toISOString(),
    }).eq('id', order.subscription_id);
  }

  // ZATCA tax invoice (Phase 1 now; reported in Phase 2 by zatca-report) for what WE sell: our own products and the
  // sub-orders where the platform is the supplier. Sub-orders a seller invoices (corridors not open yet) are left out,
  // and so are duties collected for customs (a disbursement: to confirm with the adviser).
  const subs = (order.sub_orders ?? []) as { id: string; invoicer: string; shipping_minor: number; duties_minor: number }[];
  const ours = new Set(subs.filter((x) => x.invoicer === 'platform').map((x) => x.id));
  const theirs = subs.filter((x) => x.invoicer !== 'platform');
  const items = (order.order_items as { sub_order_id: string | null; line_total_minor: number }[]).filter((i) => !i.sub_order_id || ours.has(i.sub_order_id));
  const shipping = subs.length ? subs.filter((x) => ours.has(x.id)).reduce((n, x) => n + x.shipping_minor, 0) : order.shipping_minor;
  const forInvoice = { ...order, order_items: items, shipping_minor: shipping, total_minor: items.reduce((n, i) => n + i.line_total_minor, 0) + shipping } as OrderForInvoice;
  if (!items.length) return json({ ok: true, invoice: null, seller_invoiced: theirs.length });
  try {
    const invoice = await issueInvoice(db, forInvoice);
    return json({ ok: true, invoice: invoice.number });
  } catch (e) {
    // the payment stands; the missing invoice is flagged for our team (never a wrong invoice)
    console.error('invoice not issued', order.id, e);
    await db.from('audit_log').insert({ actor_label: 'moyasar-webhook', table_name: 'orders', row_id: order.id, action: 'INVOICE_PENDING', new_data: { error: String((e as Error).message ?? e) } });
    return json({ ok: true, invoice: null, invoice_error: true });
  }
});

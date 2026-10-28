// Staff-only refund: refunds in Moyasar, restocks, and issues a ZATCA credit note against the original invoice.
import { refundPayment } from '../_shared/moyasar.ts';
import { admin, caller, handle, json, staffRole } from '../_shared/util.ts';
import { issueInvoice, type OrderForInvoice } from '../_shared/zatca.ts';

Deno.serve(handle(async (req) => {
  const db = admin();
  const user = await caller(req);
  const role = user ? await staffRole(db, user.id) : null;
  if (!role || !['owner', 'manager', 'finance', 'support'].includes(role)) return json({ error: 'Not allowed' }, 403);

  const { orderId, reason } = (await req.json()) as { orderId: string; reason: string };
  const { data: order } = await db.from('orders').select('*, order_items(*)').eq('id', orderId).single();
  if (!order || !order.payment_id) throw new Error('Order not paid');
  if (order.status === 'refunded') throw new Error('Already refunded');

  await refundPayment(order.payment_id);
  await db.from('orders').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', order.id);

  for (const item of order.order_items) {
    if (!item.product_id) continue;
    const { data: p } = await db.from('products').select('stock').eq('id', item.product_id).single();
    if (p) await db.from('products').update({ stock: p.stock + item.quantity }).eq('id', item.product_id);
  }

  const { data: original } = await db.from('invoices').select('id, number').eq('order_id', order.id).eq('doc', 'invoice').maybeSingle();
  const note = await issueInvoice(db, order as OrderForInvoice, {
    doc: 'credit_note', originalInvoiceId: original?.id, originalNumber: original?.number, reason: reason || 'Refund',
  });
  await db.from('audit_log').insert({ actor: user!.id, actor_label: user!.email, table_name: 'orders', row_id: order.id, action: 'REFUND', new_data: { reason, credit_note: note.number } });
  return json({ ok: true, creditNote: note.number });
}));

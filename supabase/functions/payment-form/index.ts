// Settings for Moyasar's payment form for an unpaid subscription order (first month).
// The form saves the card with Moyasar (we only ever receive a token) so later months can be charged.
// Amounts come from the order on the server; the webhook re-reads the payment from Moyasar and rejects any mismatch.
import { admin, env, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const { orderId } = (await req.json()) as { orderId?: string };
  if (!orderId || !/^[0-9a-f-]{36}$/.test(orderId)) return json({ error: 'Order not found' }, 404);
  const db = admin();
  const { data: order } = await db.from('orders')
    .select('id, status, kind, total_minor, currency, subscription_id, order_items(name_en, name_ar)')
    .eq('id', orderId).maybeSingle();
  if (!order || order.kind !== 'subscription') return json({ error: 'Order not found' }, 404);
  if (order.status !== 'pending_payment') return json({ error: 'already_paid' }, 409);
  const item = (order.order_items as { name_en: string; name_ar: string }[])[0];
  const site = env('PUBLIC_SITE_URL');
  return json({
    publishableKey: env('MOYASAR_PUBLISHABLE_KEY'),
    amount: order.total_minor,
    currency: order.currency,
    description: `Al Mukarramah ${item?.name_en ?? 'subscription'}`,
    name_en: item?.name_en, name_ar: item?.name_ar,
    metadata: { order_id: order.id, subscription_id: order.subscription_id },
    callbackUrl: `${site}/account`,
  });
}));

// Monthly charges for website memberships and box clubs paid with Moyasar saved cards. Run daily on a schedule.
// Requires recurring (merchant-initiated) payments to be enabled on the Moyasar account.
import { chargeToken } from '../_shared/moyasar.ts';
import { admin, env, handle, json, vatIncluded } from '../_shared/util.ts';
import { ensureInvoice } from '../_shared/zatca.ts';

Deno.serve(handle(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'unauthorised' }, 401);
  const db = admin();
  const { data: settings } = await db.from('store_settings').select('vat_rate_bp').eq('id', 1).single();
  const { data: due } = await db
    .from('subscriptions')
    .select('id, user_id, status, cancel_at_period_end, moyasar_token, ship_to, current_period_end, plans(id, name_en, name_ar, price_sar, kind)')
    .eq('source', 'moyasar')
    .in('status', ['active', 'past_due'])
    .lte('current_period_end', new Date().toISOString());

  const GRACE_DAYS = 7; // a failed renewal is retried daily for a week before the subscription ends
  const results = [];
  for (const sub of due ?? []) {
    const plan = sub.plans as unknown as { name_en: string; name_ar: string; price_sar: number; kind: string };
    // Cancelled by the customer: ends at the close of the paid period, no further charge.
    if (sub.cancel_at_period_end) {
      await db.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', sub.id);
      results.push({ id: sub.id, ok: true, ended: 'cancelled by customer' });
      continue;
    }
    if (sub.status === 'past_due' && Date.now() - new Date(sub.current_period_end!).getTime() > GRACE_DAYS * 864e5) {
      await db.from('subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', sub.id);
      results.push({ id: sub.id, ok: false, ended: 'renewal failed for a week' });
      continue;
    }
    if (!sub.moyasar_token) {
      await db.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
      results.push({ id: sub.id, ok: false, reason: 'no saved card' });
      continue;
    }
    const { data: order } = await db.from('orders').insert({
      user_id: sub.user_id, kind: 'subscription', subscription_id: sub.id, currency: 'SAR',
      subtotal_minor: plan.price_sar, total_minor: plan.price_sar, vat_minor: vatIncluded(plan.price_sar, settings!.vat_rate_bp),
      ship_to: sub.ship_to ?? { kind: 'home', recipient_name: '-', country: 'SA', city: '-', line1: '-' },
    }).select('*').single();
    await db.from('order_items').insert({ order_id: order!.id, name_en: plan.name_en, name_ar: plan.name_ar, unit_price_minor: plan.price_sar, quantity: 1, line_total_minor: plan.price_sar });

    try {
      const pay = await chargeToken({ token: sub.moyasar_token, amount: plan.price_sar, currency: 'SAR', description: `Al Mukarramah ${plan.name_en}`, metadata: { order_id: order!.id } });
      if (pay.status !== 'paid') throw new Error(pay.status);
      await db.from('orders').update({ status: plan.kind === 'box' ? 'paid' : 'delivered', payment_id: pay.id, paid_at: new Date().toISOString() }).eq('id', order!.id);
      const end = new Date(sub.current_period_end!);
      end.setMonth(end.getMonth() + 1);
      await db.from('subscriptions').update({ status: 'active', current_period_end: end.toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id);
      // the card was charged: an invoice that fails now is issued later by finish-pending, never a reason to cancel
      try {
        await ensureInvoice(db, order!.id);
      } catch (e) {
        console.error('invoice left pending', order!.id, e);
      }
      results.push({ id: sub.id, ok: true });
    } catch (e) {
      await db.from('orders').update({ status: 'cancelled' }).eq('id', order!.id);
      await db.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
      results.push({ id: sub.id, ok: false, reason: String(e) });
    }
  }
  return json({ charged: results });
}));

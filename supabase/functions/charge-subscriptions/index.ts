// Monthly charges for website memberships and box clubs paid with Moyasar saved cards. Run daily on a schedule.
// Requires recurring (merchant-initiated) payments to be enabled on the Moyasar account.
//
// Each renewal is an order with its own given_id (orders.charge_given_id), which Moyasar uses as the payment's id. A
// definite answer settles it: paid (the order is paid and the subscription renewed) or declined (the order is
// cancelled and the subscription is past due, tried again daily for a week). When the answer is lost (a timeout, a
// 5xx, a dropped connection) the card may have been charged: the renewal stays waiting, never cancelled on a guess,
// and the next run asks Moyasar again with the same given_id, which answers with that payment instead of charging
// again (review N2, REVIEW-2). Moyasar's webhook for the payment completes it too, whichever comes first.
import { chargeToken, MoyasarError, type MoyasarPayment } from '../_shared/moyasar.ts';
import { admin, env, handle, json, vatIncluded } from '../_shared/util.ts';
import { ensureInvoice } from '../_shared/zatca.ts';

type Plan = { name_en: string; name_ar: string; price_sar: number; kind: string };

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

  const GRACE_DAYS = 7; // a failed renewal is tried again daily for a week before the subscription ends
  const results = [];
  for (const sub of due ?? []) {
    const plan = sub.plans as unknown as Plan;
    // Cancelled by the customer: ends at the close of the paid period, no further charge.
    if (sub.cancel_at_period_end) {
      await db.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', sub.id);
      results.push({ id: sub.id, ok: true, ended: 'cancelled by customer' });
      continue;
    }
    // a renewal still waiting from an earlier run (its answer was lost) is asked again with the same given_id
    const { data: waiting } = await db.from('orders').select('*').eq('subscription_id', sub.id).eq('kind', 'subscription')
      .eq('status', 'pending_payment').not('charge_given_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!waiting && sub.status === 'past_due' && Date.now() - new Date(sub.current_period_end!).getTime() > GRACE_DAYS * 864e5) {
      await db.from('subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', sub.id);
      results.push({ id: sub.id, ok: false, ended: 'renewal failed for a week' });
      continue;
    }
    if (!sub.moyasar_token) {
      await db.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id);
      results.push({ id: sub.id, ok: false, reason: 'no saved card' });
      continue;
    }
    let order = waiting;
    if (!order) {
      const { data: created, error } = await db.from('orders').insert({
        user_id: sub.user_id, kind: 'subscription', subscription_id: sub.id, currency: 'SAR', charge_given_id: crypto.randomUUID(),
        subtotal_minor: plan.price_sar, total_minor: plan.price_sar, vat_minor: vatIncluded(plan.price_sar, settings!.vat_rate_bp),
        ship_to: sub.ship_to ?? { kind: 'home', recipient_name: '-', country: 'SA', city: '-', line1: '-' },
      }).select('*').single();
      if (error) throw error;
      order = created;
      await db.from('order_items').insert({ order_id: order!.id, name_en: plan.name_en, name_ar: plan.name_ar, unit_price_minor: plan.price_sar, quantity: 1, line_total_minor: plan.price_sar });
    }

    let pay: MoyasarPayment;
    try {
      pay = await chargeToken({ token: sub.moyasar_token, amount: order!.total_minor, currency: 'SAR', description: `Al Mukarramah ${plan.name_en}`,
                                metadata: { order_id: order!.id }, givenId: order!.charge_given_id });
    } catch (e) {
      if (e instanceof MoyasarError && e.definite) {
        // Moyasar refused it: nothing was charged
        await declined(order!.id, sub.id, e.message);
        results.push({ id: sub.id, ok: false, reason: e.message });
      } else {
        // the card may have been charged: never cancelled on a guess; asked again tomorrow with the same given_id
        console.error('renewal unconfirmed', order!.id, e);
        await db.from('audit_log').insert({ actor_label: 'charge-subscriptions', table_name: 'orders', row_id: order!.id, action: 'CHARGE_UNCONFIRMED',
                                            new_data: { error: String((e as Error).message ?? e), given_id: order!.charge_given_id } });
        results.push({ id: sub.id, ok: false, pending: true });
      }
      continue;
    }
    if (pay.status === 'paid') {
      // only if it is still waiting: Moyasar's webhook may have completed it first
      const { data: paid } = await db.from('orders').update({ status: plan.kind === 'box' ? 'paid' : 'delivered', payment_id: pay.id, paid_at: new Date().toISOString() })
        .eq('id', order!.id).eq('status', 'pending_payment').select('id').maybeSingle();
      if (paid) {
        const end = new Date(sub.current_period_end!);
        end.setMonth(end.getMonth() + 1);
        await db.from('subscriptions').update({ status: 'active', current_period_end: end.toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id);
      }
      // the card was charged: an invoice that fails now is issued later by finish-pending, never a reason to cancel
      try {
        await ensureInvoice(db, order!.id);
      } catch (e) {
        console.error('invoice left pending', order!.id, e);
      }
      results.push({ id: sub.id, ok: true });
    } else if (pay.status === 'failed') {
      await declined(order!.id, sub.id, 'declined');
      results.push({ id: sub.id, ok: false, reason: 'declined' });
    } else {
      // not final yet (initiated, authorized): asked again on the next run
      results.push({ id: sub.id, ok: false, pending: true, status: pay.status });
    }
  }
  return json({ charged: results });

  async function declined(orderId: string, subId: string, reason: string) {
    await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId).eq('status', 'pending_payment');
    await db.from('subscriptions').update({ status: 'past_due' }).eq('id', subId);
    await db.from('audit_log').insert({ actor_label: 'charge-subscriptions', table_name: 'orders', row_id: orderId, action: 'CHARGE_DECLINED', new_data: { reason } });
  }
}));

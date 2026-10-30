// Creates an order (or a first membership/box payment) and a Moyasar hosted payment page.
// Prices, delivery, duties and totals are always recalculated here from the database, every line decided by the
// rulebook; the app's numbers are never trusted. An idempotency key from the app makes a retry return the same order.
import { createInvoice } from '../_shared/moyasar.ts';
import type { CartItem } from '../_shared/cart.ts';
import { inCurrency, planCheckout } from '../_shared/checkout.ts';
import { admin, caller, env, fxPerSar, handle, json, vatIncluded } from '../_shared/util.ts';

type Body = {
  items?: CartItem[];
  shipTo?: { kind: string; recipient_name: string; phone: string; country: string; city: string; line1: string; line2?: string; hotel_name?: string; check_in?: string; check_out?: string };
  email?: string;
  currency?: string;
  zoneId?: string;
  giftMessage?: string | null;
  partnerCode?: string | null;
  planId?: string;
  lang?: 'ar' | 'en';
  idempotencyKey?: string;
};

Deno.serve(handle(async (req) => {
  const body = (await req.json()) as Body;
  const db = admin();
  const user = await caller(req);
  const site = env('PUBLIC_SITE_URL');

  const { data: settings } = await db.from('store_settings').select('store_open, checkout_open, vat_rate_bp').eq('id', 1).single();
  if (!settings?.store_open || !settings?.checkout_open) throw new Error('Checkout is closed');

  // ------------------------------------------------ membership or box club (first period)
  if (body.planId) {
    if (!user) throw new Error('Sign in first');
    const { data: plan } = await db.from('plans').select('*').eq('id', body.planId).eq('active', true).single();
    if (!plan) throw new Error('Plan not found');
    // Box clubs are delivered every month: they need a Saudi delivery address.
    const shipTo = plan.kind === 'box' ? body.shipTo : null;
    if (plan.kind === 'box' && (!shipTo || shipTo.country !== 'SA' || !shipTo.recipient_name || !shipTo.phone || !shipTo.city || !shipTo.line1)) {
      throw new Error('A delivery address in Saudi Arabia is needed for this box');
    }
    const { data: sub } = await db.from('subscriptions').insert({ user_id: user.id, plan_id: plan.id, source: 'moyasar', status: 'past_due', ship_to: shipTo }).select('id').single();
    const { data: order } = await db.from('orders').insert({
      user_id: user.id, email: user.email, kind: 'subscription', subscription_id: sub!.id, currency: 'SAR',
      subtotal_minor: plan.price_sar, total_minor: plan.price_sar, vat_minor: vatIncluded(plan.price_sar, settings.vat_rate_bp),
      ship_to: shipTo ?? { kind: 'home', recipient_name: user.email, country: 'SA', city: '-', line1: '-' },
    }).select('id, number').single();
    await db.from('order_items').insert({ order_id: order!.id, name_en: plan.name_en, name_ar: plan.name_ar, unit_price_minor: plan.price_sar, quantity: 1, line_total_minor: plan.price_sar });
    // First month is paid on our /pay page with Moyasar's payment form, which saves the card (as a Moyasar token)
    // for monthly renewals. Hosted invoices cannot save cards, so they are not used for subscriptions.
    return json({ paymentUrl: `${site}/pay?order=${order!.id}`, orderId: order!.id });
  }

  // ------------------------------------------------ shop order
  const items = body.items ?? [];
  if (!items.length || !body.shipTo || !body.email) throw new Error('Missing order details');
  const key = body.idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (key) {
    // the same checkout pressed twice (or retried after a network error): the same order and payment page
    const { data: again } = await db.from('orders').select('id, status, payment_url').eq('idempotency_key', key).maybeSingle();
    if (again) return json(again.status === 'pending_payment' && again.payment_url ? { paymentUrl: again.payment_url, orderId: again.id } : { orderId: again.id, status: again.status });
  }
  const currency = (body.currency ?? 'SAR').toUpperCase();
  const perSar = await fxPerSar(db, currency);

  // every line decided by the rulebook; anything that cannot be delivered here stops the payment, with the reason
  const checkout = await planCheckout(db, items, body.shipTo);
  if (checkout.blocked.length) return json({ error: checkout.blocked.map((b) => (body.lang === 'ar' ? b.ar : b.en)).join(' '), blocked: checkout.blocked }, 409);
  let zone = null;
  if (checkout.zones) {
    if (!body.zoneId) throw new Error('Choose a delivery option');
    zone = checkout.zones.find((q) => q.zoneId === body.zoneId) ?? null;
    if (!zone) throw new Error('Delivery option not available for this address');
  }
  const t = inCurrency(checkout, currency, perSar, zone);

  const { data: order, error: oErr } = await db.from('orders').insert({
    user_id: user?.id ?? null, email: body.email, currency, subtotal_minor: t.items, shipping_minor: t.shipping, duties_minor: t.duties,
    total_minor: t.total, vat_minor: t.vat, ship_to: body.shipTo, gift_message: body.giftMessage, partner_code: body.partnerCode?.toUpperCase() ?? null,
    shipping_carrier: zone ? `${zone.carrier} ${zone.service}` : null, idempotency_key: key,
    fx_per_sar: perSar,   // the rate these prices were converted at: sellers' statements are in SAR at this rate
  }).select('id, number').single();
  if (oErr) {
    if (key && /duplicate|unique/i.test(oErr.message)) {
      const { data: again } = await db.from('orders').select('id, payment_url').eq('idempotency_key', key).single();
      return json({ paymentUrl: again?.payment_url, orderId: again?.id });
    }
    throw oErr;
  }

  // one sub-order per seller (and one for ours), with what the rulebook decided, then the lines
  for (const [n, x] of t.subOrders.entries()) {
    const s = x.s;
    const { data: sub, error: sErr } = await db.from('sub_orders').insert({
      order_id: order.id, seq: n + 1, seller_id: s.seller_id, kind: s.kind, currency, items_minor: x.items, shipping_minor: x.shipping,
      duties_minor: x.duties, vat_minor: x.vat, commission_minor: x.commission, corridor_id: s.corridor_id, invoicer: s.invoicer, vat_mode: s.vat_mode,
      duties_mode: s.duties_mode, import_tax_regime: s.import_tax_regime, import_tax_collected: s.import_tax_collected, from_country: s.from_country,
      to_country: s.to_country, service_id: s.service_id, zone_id: s.kind === 'house' ? zone?.zoneId ?? null : null,
      delivery_price_id: s.delivery.mode === 'price' ? s.delivery.price_id : null, weight_g: s.weight_g, handling_days: s.handling_days,
      production_days: s.production_days, days_min: s.kind === 'house' && zone ? zone.daysMin : s.days_min, days_max: s.kind === 'house' && zone ? zone.daysMax : s.days_max,
    }).select('id').single();
    if (sErr) throw sErr;
    const { error: iErr } = await db.from('order_items').insert(x.lines.map((y) => ({
      order_id: order.id, sub_order_id: sub.id, product_id: y.l.product.id, variant_id: y.l.variant?.id ?? null,
      variant_label: y.l.variant ? `${y.l.variant.label_en} / ${y.l.variant.label_ar}` : null,
      name_en: y.l.product.name_en, name_ar: y.l.product.name_ar, unit_price_minor: y.unit, quantity: y.pl.quantity, line_total_minor: y.total,
      seller_id: y.l.seller?.id ?? null, commission_bps: y.l.commissionBps, commission_minor: y.commission, custom: y.l.custom,
      vat_rate_bp: y.pl.vat_rate_bp, vat_minor: y.vat, duty_bp: y.pl.duty_bp, duty_minor: y.duty, production_days: y.pl.made_to_measure ? y.pl.production_days : 0,
      return_policy: y.pl.return_policy, return_window_days: y.pl.return_window_days, hs_code: y.l.product.hs_code, origin_country: y.l.product.origin_country,
    })));
    if (iErr) throw iErr;
  }

  const inv = await createInvoice({
    amount: t.total, currency, description: `Al Mukarramah order AM-${order.number}`,
    successUrl: `${site}/account`, backUrl: `${site}/cart`, metadata: { order_id: order.id },
  });
  await db.from('orders').update({ payment_ref: inv.id, payment_url: inv.url }).eq('id', order.id);
  return json({ paymentUrl: inv.url, orderId: order.id });
}));

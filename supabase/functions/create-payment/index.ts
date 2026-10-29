// Creates an order (or a first membership/box payment) and a Moyasar hosted payment page.
// Prices, shipping and totals are always recalculated here from the database; the app's numbers are never trusted.
import { createInvoice } from '../_shared/moyasar.ts';
import { quotes } from '../_shared/shipping.ts';
import { admin, caller, env, fxPerSar, handle, json, vatIncluded } from '../_shared/util.ts';

type Body = {
  items?: { productId: string; quantity: number }[];
  shipTo?: { kind: string; recipient_name: string; phone: string; country: string; city: string; line1: string; line2?: string; hotel_name?: string; check_in?: string; check_out?: string };
  email?: string;
  currency?: string;
  zoneId?: string;
  giftMessage?: string | null;
  partnerCode?: string | null;
  planId?: string;
  lang?: 'ar' | 'en';
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
    const inv = await createInvoice({
      amount: plan.price_sar, currency: 'SAR', description: `Al Mukarramah ${plan.name_en}`,
      successUrl: `${site}/account`, backUrl: `${site}/membership`, metadata: { order_id: order!.id, subscription_id: sub!.id },
    });
    await db.from('orders').update({ payment_ref: inv.id }).eq('id', order!.id);
    return json({ paymentUrl: inv.url, orderId: order!.id });
  }

  // ------------------------------------------------ shop order
  const items = body.items ?? [];
  if (!items.length || !body.shipTo || !body.zoneId || !body.email) throw new Error('Missing order details');
  const currency = (body.currency ?? 'SAR').toUpperCase();
  const perSar = await fxPerSar(db, currency);

  const { data: products, error } = await db
    .from('products')
    .select('id, name_en, name_ar, base_price_sar, stock, is_active, weight_g, restricted_countries, product_prices(currency, amount_minor)')
    .in('id', items.map((i) => i.productId));
  if (error) throw error;

  const lines = items.map((i) => {
    const p = products!.find((x) => x.id === i.productId);
    if (!p || !p.is_active) throw new Error('A product is no longer available');
    if (p.stock < i.quantity) throw new Error(`Only ${p.stock} left of ${p.name_en}`);
    if ((p.restricted_countries as string[]).includes(body.shipTo!.country)) throw new Error(`${p.name_en} cannot be sent to ${body.shipTo!.country}`);
    const fixed = (p.product_prices as { currency: string; amount_minor: number }[]).find((x) => x.currency === currency);
    const unit = fixed ? fixed.amount_minor : Math.round(p.base_price_sar * perSar);
    return { product: p, quantity: i.quantity, unit, total: unit * i.quantity };
  });

  const weight = lines.reduce((g, l) => g + l.product.weight_g * l.quantity, 0);
  const quote = (await quotes(db, body.shipTo, weight)).find((q) => q.zoneId === body.zoneId);
  if (!quote) throw new Error('Delivery option not available for this address');

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const shipping = Math.round(quote.amountSar * perSar);
  const total = subtotal + shipping;

  const { data: order, error: oErr } = await db.from('orders').insert({
    user_id: user?.id ?? null, email: body.email, currency, subtotal_minor: subtotal, shipping_minor: shipping,
    total_minor: total, vat_minor: vatIncluded(total, settings.vat_rate_bp), ship_to: body.shipTo,
    gift_message: body.giftMessage, partner_code: body.partnerCode?.toUpperCase() ?? null, shipping_carrier: `${quote.carrier} ${quote.service}`,
  }).select('id, number').single();
  if (oErr) throw oErr;

  await db.from('order_items').insert(lines.map((l) => ({
    order_id: order.id, product_id: l.product.id, name_en: l.product.name_en, name_ar: l.product.name_ar,
    unit_price_minor: l.unit, quantity: l.quantity, line_total_minor: l.total,
  })));

  const inv = await createInvoice({
    amount: total, currency, description: `Al Mukarramah order AM-${order.number}`,
    successUrl: `${site}/account`, backUrl: `${site}/cart`, metadata: { order_id: order.id },
  });
  await db.from('orders').update({ payment_ref: inv.id }).eq('id', order.id);
  return json({ paymentUrl: inv.url, orderId: order.id });
}));

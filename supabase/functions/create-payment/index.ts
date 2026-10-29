// Creates an order (or a first membership/box payment) and a Moyasar hosted payment page.
// Prices, shipping and totals are always recalculated here from the database; the app's numbers are never trusted.
import { createInvoice } from '../_shared/moyasar.ts';
import { priceCart, type CartItem } from '../_shared/cart.ts';
import { quotes } from '../_shared/shipping.ts';
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
  const currency = (body.currency ?? 'SAR').toUpperCase();
  const perSar = await fxPerSar(db, currency);

  // Products, sizes, tailoring and each seller's delivery charge, recalculated here.
  const cart = await priceCart(db, items, body.shipTo);
  let houseShippingSar = 0;
  let carrierLabel: string | null = null;
  if (cart.needsZone) {
    if (!body.zoneId) throw new Error('Choose a delivery option');
    const quote = (await quotes(db, body.shipTo, cart.houseWeightG, cart.houseSpray)).find((q) => q.zoneId === body.zoneId);
    if (!quote) throw new Error('Delivery option not available for this address');
    houseShippingSar = quote.amountSar;
    carrierLabel = `${quote.carrier} ${quote.service}`;
  }

  const lines = cart.lines.map((l) => {
    const p = l.product as unknown as { id: string; name_en: string; name_ar: string; product_prices: { currency: string; amount_minor: number }[] };
    // A fixed price in the shopper's currency applies only when nothing was added (sizes keep it; tailoring add-ons do not).
    const fixed = !l.custom?.options ? p.product_prices.find((x) => x.currency === currency) : undefined;
    const unit = fixed ? fixed.amount_minor : Math.round(l.unitSar * perSar);
    const total = unit * l.quantity;
    const bps = l.seller?.commission_bps ?? null;
    return { l, unit, total, bps, commission: bps === null ? null : Math.round((total * bps) / 10000) };
  });

  const subtotal = lines.reduce((s, x) => s + x.total, 0);
  const sellerShipping = cart.sellerShipping.map((s) => ({ ...s, minor: Math.round(s.amountSar * perSar) }));
  const shipping = Math.round(houseShippingSar * perSar) + sellerShipping.reduce((s, x) => s + x.minor, 0);
  const total = subtotal + shipping;

  const { data: order, error: oErr } = await db.from('orders').insert({
    user_id: user?.id ?? null, email: body.email, currency, subtotal_minor: subtotal, shipping_minor: shipping,
    total_minor: total, vat_minor: vatIncluded(total, settings.vat_rate_bp), ship_to: body.shipTo,
    gift_message: body.giftMessage, partner_code: body.partnerCode?.toUpperCase() ?? null, shipping_carrier: carrierLabel,
  }).select('id, number').single();
  if (oErr) throw oErr;

  await db.from('order_items').insert(lines.map((x) => ({
    order_id: order.id, product_id: x.l.product.id, name_en: x.l.product.name_en, name_ar: x.l.product.name_ar,
    unit_price_minor: x.unit, quantity: x.l.quantity, line_total_minor: x.total,
    seller_id: x.l.seller?.id ?? null, commission_bps: x.bps, commission_minor: x.commission, custom: x.l.custom,
  })));
  // One shipment per seller (and one for anything we ship ourselves), each with its own tracking.
  await db.from('order_shipments').insert([
    ...(cart.needsZone ? [{ order_id: order.id, seller_id: null, shipping_minor: Math.round(houseShippingSar * perSar), carrier: carrierLabel }] : []),
    ...sellerShipping.map((s) => ({ order_id: order.id, seller_id: s.sellerId, shipping_minor: s.minor })),
  ]);

  const inv = await createInvoice({
    amount: total, currency, description: `Al Mukarramah order AM-${order.number}`,
    successUrl: `${site}/account`, backUrl: `${site}/cart`, metadata: { order_id: order.id },
  });
  await db.from('orders').update({ payment_ref: inv.id }).eq('id', order.id);
  return json({ paymentUrl: inv.url, orderId: order.id });
}));

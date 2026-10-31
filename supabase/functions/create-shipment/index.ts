// The seller (or our operations team) buys the label for a packed sub-order through the approved carrier: the
// parcel is collected from the seller's pickup address. A parcel has one live label: the same key returns it, and a
// new key (a reload, a second person) is refused BEFORE the carrier is asked, so a second label is never bought
// (review M11). A carrier that times out or fails buys nothing here and the same key can be used again. The label PDF
// is private (labels bucket). 'cancel' voids an unused label (before collection). A carrier must be switched on
// (carrier_providers.active): the sandbox is off on a live project.
import { adapterFor } from '../_shared/carriers/index.ts';
import { admin, caller, fail, handle, isSellerMember, json, staffRole, UUID } from '../_shared/util.ts';

type Body = { subOrderId?: string; idempotencyKey?: string; locationId?: string; weightG?: number; action?: 'create' | 'cancel' };
type Loc = { id: string; contact_name: string; phone: string; country: string; city: string; district: string | null; line1: string; line2: string | null; postal_code: string | null; short_address: string | null; pickup_from: string; pickup_to: string };

/** The next working-day pickup window at the address (Friday is skipped). */
function pickupWindow(loc: Loc, now = new Date()) {
  const d = new Date(now.getTime() + 24 * 3_600_000);
  if (d.getUTCDay() === 5) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  // Gulf time (UTC+3) for the address's hours
  return { from: new Date(`${day}T${loc.pickup_from.slice(0, 5)}:00+03:00`).toISOString(), to: new Date(`${day}T${loc.pickup_to.slice(0, 5)}:00+03:00`).toISOString() };
}

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return fail(401, 'Please sign in', 'يُرجى تسجيل الدخول');
  const body = (await req.json()) as Body;
  if (!body.subOrderId || !UUID.test(body.subOrderId)) return fail(400, 'Missing order', 'الطلب غير محدد');
  const db = admin();
  const { data: ctx, error } = await db.rpc('mp_shipment_context', { p_sub: body.subOrderId });
  if (error) throw error;
  const c = ctx as { sub_order: { id: string; seller_id: string | null; status: string; service_id: string | null; weight_g: number; items_minor: number; currency: string; duties_mode: string };
    order: { number: number; ship_to: Record<string, string>; currency: string }; lines: { name_en: string; quantity: number; hs_code: string | null; origin_country: string | null; line_total_minor: number }[];
    locations: Loc[]; service: { id: string; provider_id: string; code: string; carrier_name: string; provider_active: boolean } | null;
    shipments: { id: string; status: string; provider_ref: string; tracking_number: string; tracking_url: string; provider_id: string; idempotency_key: string; label_path: string | null; pickup_from: string | null; pickup_to: string | null }[] } | null;
  if (!c) return fail(404, 'Order not found', 'لم يُعثر على الطلب');
  const role = await staffRole(db, user.id);
  const allowed = (c.sub_order.seller_id && await isSellerMember(db, c.sub_order.seller_id, user.id)) || (role && ['owner', 'manager', 'operations'].includes(role));
  if (!allowed) return fail(403, 'Not allowed', 'غير مسموح');
  if (!c.service) return fail(409, 'This order has no approved carrier service', 'لا توجد خدمة شحن معتمدة لهذا الطلب');
  if (!c.service.provider_active) return fail(409, 'This carrier is switched off: our operations team will arrange the shipment', 'شركة الشحن هذه موقوفة: سيرتّب فريق العمليات الشحن');
  const adapter = adapterFor(c.service.provider_id, (n) => Deno.env.get(n));

  if (body.action === 'cancel') {
    const live = c.shipments.find((s) => ['label_created', 'pickup_scheduled'].includes(s.status));
    if (!live) return fail(409, 'There is no unused label to cancel', 'لا يوجد ملصق شحن غير مستخدم لإلغائه');
    const r = await adapter.cancel({ provider_ref: live.provider_ref, tracking_number: live.tracking_number });
    if (!r.ok) return fail(409, r.reason ?? 'The carrier could not cancel this label', 'تعذّر على شركة الشحن إلغاء هذا الملصق');
    const { error: e2 } = await db.rpc('mp_record_shipment_event', { p_shipment: live.id, p_events: [{ status: 'cancelled', at: new Date().toISOString(), id: 'cancelled', source: 'seller', en: 'Label cancelled', ar: 'أُلغي ملصق الشحن' }] });
    if (e2) throw e2;
    return json({ ok: true, status: 'cancelled' });
  }

  const key = body.idempotencyKey && /^[A-Za-z0-9_-]{8,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!key) return fail(400, 'Missing idempotency key', 'مفتاح الطلب مفقود');
  // one live label per parcel: the same key returns it; any other key is refused before anything is bought (M11)
  const live = c.shipments.find((s) => !['cancelled', 'returned'].includes(s.status));
  if (live) {
    if (live.idempotency_key !== key) {
      return fail(409, 'This parcel already has a label: print that one (or cancel it first)', 'لهذا الطرد ملصق شحن بالفعل: اطبعه (أو ألغِه أولًا)', 'label_exists', { shipment: live.id });
    }
    const { data: again } = live.label_path ? await db.storage.from('labels').createSignedUrl(live.label_path, 3600) : { data: null };
    return json({ shipment: { id: live.id, duplicate: true }, tracking_number: live.tracking_number, tracking_url: live.tracking_url, label_url: again?.signedUrl ?? null,
                  pickup: live.pickup_from ? { from: live.pickup_from, to: live.pickup_to } : null });
  }
  if (!['accepted', 'in_production', 'ready_to_ship'].includes(c.sub_order.status)) {
    return fail(409, `This order is ${c.sub_order.status}`, 'لا يمكن شحن هذا الطلب في حالته الحالية');
  }
  const loc = c.locations.find((l) => l.id === body.locationId) ?? c.locations[0];
  if (!loc) return fail(409, 'Add a pickup address in your shop settings first', 'أضف عنوان الاستلام في إعدادات متجرك أولًا');
  const weight = Math.max(1, Math.round(Number(body.weightG) || c.sub_order.weight_g || 500));
  const to = c.order.ship_to;
  let result: Awaited<ReturnType<typeof adapter.createShipment>>;
  try {
    result = await adapter.createShipment({
    idempotency_key: key, reference: `AM-${c.order.number}`, service_code: c.service.code,
    from: { name: loc.contact_name, phone: loc.phone, country: loc.country, city: loc.city, district: loc.district, line1: loc.line1, line2: loc.line2, postal_code: loc.postal_code, short_address: loc.short_address },
    to: { name: to.recipient_name ?? '', phone: to.phone ?? '', country: to.country, city: to.city, line1: to.kind === 'hotel' ? `${to.hotel_name ?? ''} ${to.line1 ?? ''}`.trim() : to.line1 ?? '', line2: to.line2 ?? null },
    parcel: { weight_g: weight }, ddp: c.sub_order.duties_mode === 'ddp', declared_value_minor: c.sub_order.items_minor, currency: c.sub_order.currency,
    customs: c.lines.map((l) => ({ description: l.name_en, quantity: l.quantity, value_minor: l.line_total_minor, hs_code: l.hs_code, origin_country: l.origin_country })),
    pickup_window: pickupWindow(loc),
    });
  } catch (e) {
    // nothing is recorded: the same key can be tried again (a real provider deduplicates by the key)
    console.error('carrier failed', c.service.provider_id, e);
    return fail(502, 'The carrier did not answer. Nothing was bought: please try again in a few minutes.', 'لم تردّ شركة الشحن، ولم يُشترَ شيء: حاول مرة أخرى بعد دقائق.', 'carrier_failed');
  }
  const path = `${c.sub_order.id}/${key}.pdf`;
  const { error: upErr } = await db.storage.from('labels').upload(path, result.label.bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw upErr;
  const { data: rec, error: rErr } = await db.rpc('mp_record_shipment', {
    p_sub: c.sub_order.id,
    p: { idempotency_key: key, provider_id: c.service.provider_id, service_id: c.service.id, provider_ref: result.provider_ref, tracking_number: result.tracking_number,
         tracking_url: result.tracking_url, label_path: path, pickup_location_id: loc.id, pickup_from: result.pickup?.from ?? null, pickup_to: result.pickup?.to ?? null,
         weight_g: weight, ddp: c.sub_order.duties_mode === 'ddp', declared_value_minor: c.sub_order.items_minor, created_by: user.id },
  });
  if (rErr) return json({ error: rErr.message, error_ar: 'تعذّر تسجيل الشحنة' }, 409);
  const { data: signed } = await db.storage.from('labels').createSignedUrl(path, 3600);
  return json({ shipment: rec, tracking_number: result.tracking_number, tracking_url: result.tracking_url, label_url: signed?.signedUrl ?? null, pickup: result.pickup });
}));

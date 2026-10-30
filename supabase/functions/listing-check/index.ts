// The listing check. Without "submit": the quality score and tips as the server sees them (free, no AI).
// With "submit": the listing must meet the premium standard (quality score and hard requirements); it then becomes
// "check pending" and is screened in full (text, photos, the category's requirements, the Islamic standard):
//   block  -> rejected automatically with reasons in English and Arabic (it never reaches the staff queue)
//   review -> the staff queue, with the AI's notes
//   pass   -> the staff queue
//   error  -> stays "check pending" (never passed unchecked); screening-retry finishes it.
import { checkContext, runListingCheck, serverQuality } from '../_shared/media.ts';
import { textChecks } from '../_shared/screening.ts';
import { admin, caller, handle, isSellerMember, json, staffRole, UUID, withinLimit } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const { productId, submit } = (await req.json()) as { productId?: string; submit?: boolean };
  if (!productId || !UUID.test(productId)) return json({ error: 'Missing listing' }, 400);
  const db = admin();
  const ctx = await checkContext(db, productId);
  if (!ctx || !ctx.product.seller_id) return json({ error: 'Listing not found' }, 404);
  const member = await isSellerMember(db, ctx.product.seller_id, user.id);
  if (!member && !(await staffRole(db, user.id))) return json({ error: 'Not allowed' }, 403);

  const quality = serverQuality(ctx);
  const text = textChecks({ name_en: String(ctx.product.name_en ?? ''), name_ar: String(ctx.product.name_ar ?? ''),
    description_en: String(ctx.product.description_en ?? ''), description_ar: String(ctx.product.description_ar ?? '') }, []);
  if (!submit) return json({ status: ctx.product.listing_status, quality, contacts: text.filter((h) => h.kind === 'contact') });
  if (!member) return json({ error: 'Only the seller can submit a listing' }, 403);
  if (!['draft', 'rejected'].includes(ctx.product.listing_status)) return json({ error: `This listing is ${ctx.product.listing_status}` }, 409);
  if (!quality.canSubmit) return json({ submitted: false, status: ctx.product.listing_status, quality });
  if (!(await withinLimit(db, `listing-check:${ctx.product.seller_id}`, 86400, ctx.settings.listing_checks_per_day))) {
    return json({ error: 'Daily limit for listing checks reached. Please try again tomorrow.', error_ar: 'بلغت الحد اليومي لفحص المنتجات. حاول غدًا.' }, 429);
  }
  const { error: beginErr } = await db.rpc('mp_begin_listing_check', { p_product: productId, p_user: user.id });
  if (beginErr) return json({ error: beginErr.message }, 400);
  try {
    const fresh = await checkContext(db, productId);
    const r = await runListingCheck(db, fresh!);
    return json({ submitted: true, status: r.applied.status ?? 'check_pending', decision: r.decision, quality });
  } catch (e) {
    console.error('listing check failed, left pending', e);
    return json({ submitted: true, status: 'check_pending', quality });
  }
}));

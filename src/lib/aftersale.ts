// After the sale, for customers, sellers and our team: returns, refunds, reviews, messages, statements, notifications
// and seller performance. Everything people write to each other goes through the after-sale function (contact details
// masked there); the database decides who may do what. Until switch-on (EXPO_PUBLIC_MARKET_LIVE) nothing here is
// called; the screenshot build (EXPO_PUBLIC_MARKET_DEMO) shows the example data in aftersale-demo.ts.
import { MARKET_DEMO, MARKET_LIVE } from './flags';
import { AppError, callFunction, fromDb, supabase } from './supabase';
import * as demo from './aftersale-demo';

const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw fromDb(error);
  return data as T;
};
const demoOnly = () => { throw new AppError({ en: 'Example data: nothing is saved here.', ar: 'بيانات للعرض فقط: لا يُحفظ شيء هنا.' }); };

// ---------------------------------------------------------------- returns
export type ReturnReason = 'changed_mind' | 'not_as_described' | 'faulty' | 'damaged' | 'wrong_item' | 'missing_item' | 'not_received';
/** closed: an approved return our team settled another way, with the reason (review R5-2) */
export type ReturnStatus = 'requested' | 'accepted' | 'declined' | 'escalated' | 'approved' | 'refunded' | 'rejected' | 'withdrawn' | 'closed';
export type ReturnRequest = {
  id: string; number: string; order_id: string; order_number: number; sub_order_id: string; sub_order_number: string; status: ReturnStatus;
  kind: 'return' | 'refund_only'; reason: ReturnReason; unopened: boolean; details: string | null; seller_note: string | null; escalation_note: string | null;
  staff_note: string | null; restock: boolean; respond_by: string | null; decided_by: 'seller' | 'staff' | null; created_at: string; accepted_at: string | null;
  declined_at: string | null; escalated_at: string | null; received_at: string | null; approved_at: string | null; resolved_at: string | null; currency: string;
  can_escalate: boolean; seller: { id: string; name_en: string; name_ar: string | null } | null; customer: string | null;
  photos: { id: string; bucket: string; path: string; status: string }[];
  lines: { order_item_id: string; name_en: string; name_ar: string; variant: string | null; quantity: number; bought: number; unit_price_minor: number; line_total_minor: number; return_policy: string | null; custom: boolean }[];
  value_minor: number; thread_id: string | null; refund: { status: string; amount_minor: number; completed_at: string | null } | null; flags?: string[] | null;
};
export const RETURN_REASONS: ReturnReason[] = ['changed_mind', 'not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received'];

export async function requestReturn(p: { subOrderId: string; reason: ReturnReason; lines: { orderItemId: string; quantity: number }[]; details: string; unopened: boolean; photos: string[] }) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<ReturnRequest>('after-sale', { action: 'return_request', ...p });
}
/** Customer: escalate, withdraw. Seller: accept, decline, received. Our team: approve, reject (and accept/received for a seller),
 *  and close an approved return with the reason (owner, manager, finance, support: review R5-2). */
export async function returnAction(returnId: string, action: 'escalate' | 'withdraw' | 'accept' | 'decline' | 'received' | 'approve' | 'reject' | 'close', note?: string, restock?: boolean) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<ReturnRequest>('after-sale', { action: 'return_action', returnId, do: action, note, restock });
}
export async function sellerReturns(sellerId: string): Promise<ReturnRequest[]> {
  if (MARKET_DEMO) return demo.demoReturns('seller');
  return rpc('seller_returns', { p_seller: sellerId });
}
/** Viewable links for customers' photos (the customer, the seller of the return and our team can open them). */
export async function customerPhotoUrls(photos: { bucket: string; path: string }[]): Promise<Record<string, string>> {
  if (MARKET_DEMO) return Object.fromEntries(photos.map((x) => [x.path, x.path]));
  const paths = photos.filter((x) => x.bucket === 'customer-uploads').map((x) => x.path);
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('customer-uploads').createSignedUrls(paths, 3600);
  return Object.fromEntries(((data as { path: string | null; signedUrl: string }[] | null) ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}

// ---------------------------------------------------------------- customers' photos (review and return photos)
export type CustomerPhoto = { id: string; status: 'pending' | 'passed' | 'review' | 'rejected' | 'blocked'; path: string | null; reasons: { code: string; en: string; ar: string }[] };
export async function uploadCustomerPhoto(file: File, kind: 'review_photo' | 'return_photo'): Promise<{ asset: CustomerPhoto | null; reasons: CustomerPhoto['reasons'] }> {
  if (MARKET_DEMO) return demoOnly();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { asset: null, reasons: [{ code: 'type', en: 'Photos must be JPEG, PNG or WebP.', ar: 'يجب أن تكون الصور بصيغة JPEG أو PNG أو WebP.' }] };
  if (file.size > 10 * 1024 * 1024) return { asset: null, reasons: [{ code: 'size', en: 'Each photo must be 10 MB or less.', ar: 'يجب ألا يتجاوز حجم الصورة ١٠ ميغابايت.' }] };
  const { data: s } = await supabase.auth.getUser();
  if (!s.user) throw new AppError({ en: 'Please sign in', ar: 'يُرجى تسجيل الدخول' });
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${s.user.id}/incoming/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from('customer-uploads').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw fromDb(error);
  const r = await callFunction<{ asset: CustomerPhoto | null; reasons?: CustomerPhoto['reasons'] }>('screen-image', { path, kind });
  return { asset: r.asset, reasons: r.asset?.reasons?.length ? r.asset.reasons : r.reasons ?? [] };
}

// ---------------------------------------------------------------- reviews
export type PublicReview = {
  id: string; author: string; rating: number; title: string | null; body: string; lang: 'ar' | 'en'; photos: string[]; published_at: string; verified: boolean;
  variant: string | null; reply: { body: string; published_at: string; by_en: string; by_ar: string } | null;
};
export type ProductReviews = { count: number; avg: number | null; stars: Record<string, number>; reviews: PublicReview[] };
export async function productReviews(productId: string, sort: 'recent' | 'highest' | 'lowest' | 'photos' = 'recent', limit = 6, slug?: string): Promise<ProductReviews | null> {
  // the screenshot build shows example reviews on one product page only
  if (MARKET_DEMO) return slug === 'aam-zumar-60-ml' ? demo.demoProductReviews() : null;
  if (!MARKET_LIVE) return null;
  const { data } = await supabase.rpc('product_reviews_public', { p_product: productId, p_sort: sort, p_limit: limit, p_offset: 0 });
  return (data as ProductReviews | null) ?? null;
}
export type ReviewItem = {
  item: { id: string; name_en: string; name_ar: string; variant: string | null; order_number: number; order_id: string };
  product: { id: string; slug: string; image: string | null; name_en: string; name_ar: string } | null; delivered_at: string | null; can_review: boolean;
  review: { id: string; rating: number; title: string | null; body: string; lang: 'ar' | 'en'; status: 'pending' | 'published' | 'rejected' | 'hidden'; author: string; moderation_note: string | null; photos: string[] } | null;
};
export async function reviewItem(itemId: string): Promise<ReviewItem> {
  if (MARKET_DEMO) return demo.demoReviewItem();
  return rpc('my_review_item', { p_item: itemId });
}
export async function submitReview(p: { orderItemId: string; rating: number; title: string; body: string; lang: 'ar' | 'en'; name: string; photos: string[] }) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ id: string; status: string }>('after-sale', { action: 'review', ...p });
}
export type SellerReview = {
  id: string; product: { id: string; slug: string; name_en: string; name_ar: string }; author: string; rating: number; title: string | null; body: string; lang: string;
  photos: string[]; published_at: string; reply: { body: string; status: 'pending' | 'published' | 'rejected' | 'hidden'; moderation_note: string | null; published_at: string | null } | null;
};
export async function sellerReviews(sellerId: string): Promise<SellerReview[]> {
  if (MARKET_DEMO) return demo.demoSellerReviews();
  return rpc('seller_reviews', { p_seller: sellerId });
}
export async function replyToReview(reviewId: string, body: string) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ status: string }>('after-sale', { action: 'reply', reviewId, body });
}

// ---------------------------------------------------------------- messages
export type Thread = {
  id: string; subject: string; status: 'open' | 'closed'; last_message_at: string | null; last_sender: string | null; unread: boolean;
  seller: { name_en: string; name_ar: string | null; slug: string } | null; customer: string | null;
  product: { id: string; slug: string; name_en: string; name_ar: string } | null; order: string | null; order_id: string | null; return: string | null;
  preview: string | null; flagged?: boolean | null;
};
export type ThreadMessage = { id: number; sender: 'customer' | 'seller' | 'staff' | 'system'; body: string; masked: number; at: string; mine: boolean; flags?: string[] | null };
export type ThreadFull = Thread & { side: 'customer' | 'seller' | 'staff'; messages: ThreadMessage[] };
export async function threads(sellerId?: string): Promise<Thread[]> {
  if (MARKET_DEMO) return demo.demoThreads(sellerId ? 'seller' : 'customer');
  return rpc('mp_threads', { p_seller: sellerId ?? null });
}
export async function thread(id: string): Promise<ThreadFull> {
  if (MARKET_DEMO) return demo.demoThread(id);
  const t = await rpc<ThreadFull>('mp_thread', { p_thread: id });
  supabase.rpc('mp_mark_thread_read', { p_thread: id }).then(() => undefined);
  return t;
}
/** Sends a message (contact details are masked on the server). Opens the conversation when needed. */
export async function sendMessage(p: { as: 'customer' | 'seller' | 'staff'; body: string; threadId?: string; subOrderId?: string; productId?: string; returnId?: string; subject?: string }) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ thread_id: string; message_id: number }>('after-sale', { action: 'message', ...p });
}

// ---------------------------------------------------------------- in-app notifications
export type Notice = { id: number; key: string; subject_en: string; subject_ar: string; body_en: string; body_ar: string; link: string | null; at: string; read: boolean };
export async function notifications(sellerId?: string): Promise<{ unread: number; items: Notice[] }> {
  if (MARKET_DEMO) return demo.demoNotices(sellerId ? 'seller' : 'customer');
  if (!MARKET_LIVE) return { unread: 0, items: [] };
  return rpc('my_notifications', { p_seller: sellerId ?? null, p_limit: 30 });
}
export async function markNotificationsRead(sellerId?: string) {
  if (MARKET_DEMO || !MARKET_LIVE) return 0;
  return rpc<number>('mp_mark_notifications_read', { p_ids: null, p_seller: sellerId ?? null });
}

// ---------------------------------------------------------------- statements
export type LedgerKind = 'sale' | 'commission' | 'refund' | 'commission_refund' | 'adjustment' | 'payout' | 'payout_reversal';
export type Balance = { balance_sar_minor: number; available_sar_minor: number; held_sar_minor: number; next_available_on: string | null };
export type Statement = {
  seller: { id: string; name_en: string; name_ar: string | null; country: string }; month: string; currency: 'SAR';
  opening_sar_minor: number; closing_sar_minor: number;
  totals: { sales: number; commission: number; refunds: number; adjustments: number; payouts: number; net: number; orders: number };
  entries: { id: number; kind: LedgerKind; booked_on: string; available_on: string; currency: string; amount_minor: number; amount_sar_minor: number; note: string | null; items_en: string | null; items_ar: string | null }[];
  payouts: { id: string; amount_sar_minor: number; paid_on: string; reference: string; iban_last4: string | null; status: 'paid' | 'reversed' }[];
  months: string[]; balance: Balance;
};
export async function sellerStatement(sellerId: string, month?: string): Promise<Statement> {
  if (MARKET_DEMO) return demo.demoStatement(month);
  return rpc('seller_statement', { p_seller: sellerId, p_month: month ?? null });
}

// ---------------------------------------------------------------- performance
export type MetricStatus = 'ok' | 'warn' | 'suspend';
export type Performance = {
  seller_id: string; window_days: number; status: 'new' | MetricStatus; orders: number; min_orders: number; auto_suspend: boolean;
  metrics: {
    late_shipment: { bps: number | null; count: number; of: number; status: MetricStatus; warn: number; limit: number };
    cancellation: { bps: number | null; count: number; of: number; status: MetricStatus; warn: number; limit: number };
    returns: { bps: number | null; count: number; of: number; status: MetricStatus; warn: number; limit: number };
    rating: { x100: number | null; count: number; status: MetricStatus; warn: number; limit: number };
    response_hours: { median: number | null };
  };
};
export async function sellerPerformance(sellerId: string): Promise<Performance> {
  if (MARKET_DEMO) return demo.demoPerformance();
  return rpc('mp_seller_performance', { p_seller: sellerId });
}

// ---------------------------------------------------------------- our team (admin pages, English)
export type RefundJson = {
  id: string; order_id: string; order_number: number; return_id: string | null; status: 'processing' | 'succeeded' | 'failed'; currency: string; amount_minor: number;
  items_minor: number; shipping_minor: number; duties_minor: number; platform_minor: number; reason: string; restock: boolean; error: string | null;
  /** money given back without items (goodwill made in Moyasar's dashboard, a refund Moyasar made twice) */
  goodwill_minor?: number;
  /** goodwill given earlier that this refund counted as already paid back: its lines less this is the amount (review R5-2) */
  goodwill_deducted_minor?: number;
  credit_note_status: 'not_needed' | 'pending' | 'issued'; credit_note: string | null; created_at: string; completed_at: string | null;
  lines: { kind: string; quantity: number | null; amount_minor: number; name_en: string | null }[];
};
/** An order where Moyasar shows refunds we have no record of (review R3-2): what can be recorded against it. */
export type UnrecordedRefund = {
  order_id: string; order_number: number; currency: string; moyasar_refunded_minor: number; refunded_minor: number; unrecorded_minor: number; checked_at: string;
  /** refunds marked failed that Moyasar may have completed later */
  failed: RefundJson[];
  lines: { order_item_id: string; name_en: string; quantity: number; refundable: number; line_total_minor: number }[];
  parcels: { sub_order_id: string; number: string; shipping_left: number }[];
};
export type RefundQueue = {
  returns: ReturnRequest[];
  cancelled: { sub_order_id: string; number: string; order_id: string; order_number: number; seller: string | null; cancel_reason: string | null; cancelled_at: string; currency: string; amount_minor: number }[];
  credit_notes: RefundJson[]; stuck: RefundJson[]; recent: RefundJson[];
  unrecorded?: UnrecordedRefund[];
};
export async function adminReturns(status?: ReturnStatus): Promise<ReturnRequest[]> {
  if (MARKET_DEMO) return demo.demoReturns('staff').filter((r) => !status || r.status === status);
  return rpc('admin_returns', { p_status: status ?? null });
}
export async function adminRefundQueue(): Promise<RefundQueue> {
  if (MARKET_DEMO) return demo.demoRefundQueue();
  return rpc('admin_refund_queue');
}
export type RefundResult = {
  ok?: boolean; amount?: number; currency?: string; creditNote?: string | null; creditNotePending?: boolean; reconciled?: boolean; refund?: string;
  /** the goodwill already given on the order that this refund counted: the amount is that much less than its lines (R5-2) */
  goodwillDeducted?: number;
  /** Moyasar's answer did not come back: the refund stays processing (never refund it again; check with Moyasar) */
  pending?: boolean; recorded?: boolean; code?: string; error?: string; error_ar?: string;
};
/** Staff-only refund through refund-order (the amount is worked out on the server). */
export async function refund(p: { orderId: string; reason: string; key: string; returnId?: string; subOrderId?: string }): Promise<RefundResult> {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<RefundResult>('refund-order', p);
}
/** What a refund would be, before pressing Refund: nothing is reserved and Moyasar is not asked (review R5-2). */
export type RefundPreview = {
  currency: string; amount_minor: number; lines_minor: number; items_minor: number; shipping_minor: number; duties_minor: number;
  goodwill_deducted_minor: number; payment_left_minor: number; platform_minor: number;
};
export async function previewRefund(p: { orderId: string; returnId?: string; subOrderId?: string }): Promise<RefundPreview> {
  if (MARKET_DEMO) return demo.demoRefundPreview();
  return callFunction<RefundPreview>('refund-order', { action: 'preview', ...p });
}
export type Reconciled = { ok: boolean; refund: string; state: 'succeeded' | 'failed' | 'waiting' | 'mismatch' | 'not_processing' | 'unreachable'; detail?: string; creditNote?: string | null };
/** A refund still waiting for Moyasar's answer: read the payment back from Moyasar and settle it (review H2). */
export async function checkWithMoyasar(refundId: string): Promise<Reconciled> {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<Reconciled>('refund-order', { action: 'reconcile', refundId });
}
/** Owner, manager, finance: settle a refund still processing by hand, after checking Moyasar's dashboard (review N7).
 *  The server reads the payment back from Moyasar first and refuses an outcome Moyasar does not show. */
export async function settleRefundByHand(refundId: string, outcome: 'succeeded' | 'failed', reason: string) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ ok: boolean; refund: string; status: string; creditNote: string | null }>('refund-order', { action: 'resolve', refundId, outcome, reason });
}
/** A payment Moyasar took for an order that was no longer waiting (cancelled, paid twice, another amount, or gone): review N2, R3-4. */
export type PaymentIssue = {
  id: string; payment_id: string; order_id: string | null; kind: 'order_not_waiting' | 'second_payment' | 'amount_mismatch' | 'order_not_found';
  amount_minor: number; currency: string; status: 'open' | 'refund_pending' | 'refunded' | 'attached' | 'dismissed';
  note: string | null; error: string | null; created_at: string; orders: { number: number; status: string } | null;
};
export async function adminPaymentIssues(): Promise<PaymentIssue[]> {
  if (MARKET_DEMO) return [];
  const { data, error } = await supabase.from('payment_issues')
    .select('id, payment_id, order_id, kind, amount_minor, currency, status, note, error, created_at, orders(number, status)')
    .in('status', ['open', 'refund_pending']).order('created_at', { ascending: true }).limit(100);
  if (error) throw fromDb(error);
  return (data as unknown as PaymentIssue[]) ?? [];
}
export type IssueResult = { ok?: boolean; status?: string; invoice?: string | null; reconciled?: boolean; pending?: boolean; code?: string; error?: string };
/**
 * Owner, manager, finance: record a refund made in Moyasar's dashboard that we have no record of (review R3-2): its
 * amount (minor units), Moyasar's reference, and what it was for: items, a parcel's delivery, or goodwill with no items.
 * The server reads Moyasar first and never records more than Moyasar shows refunded and we have not recorded.
 */
export async function recordMoyasarRefund(p: { orderId: string; key: string; amount: number; reference: string; reason: string;
  goodwill?: boolean; subOrderId?: string; lines?: { orderItemId: string; quantity: number }[]; shipping?: string[] }) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ ok: boolean; refund: string; amount: number; currency: string; creditNote: string | null; duplicate?: boolean }>('refund-order', { action: 'record_moyasar', ...p });
}
/** Refund it in full, attach it to its order (the order is paid with it), or close it with a reason. */
export async function settlePaymentIssue(issueId: string, action: 'refund' | 'attach' | 'dismiss', reason: string): Promise<IssueResult> {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<IssueResult>('refund-order', { action: 'payment_issue', issueId, do: action, reason });
}
export type FinishResult = { handed_on: unknown[]; invoices: unknown[]; credit_notes: unknown[]; refunds: unknown[]; left: { step: string; error: string }[] };
/** Finish what a failure left half done: parcels not handed on, missing tax invoices and credit notes, refunds waiting (review H3). */
export async function finishPendingWork(): Promise<FinishResult> {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<FinishResult>('finish-pending', {});
}
export type AdminReview = {
  id: string; status: string; rating: number; title: string | null; body: string; lang: string; author: string; flags: string[]; moderation_note: string | null;
  created_at: string; published_at: string | null; product: { id: string; slug: string; name_en: string }; seller: string | null;
  photos: { id: string; bucket: string; path: string | null; status: string }[];
};
export type AdminReply = { review_id: string; status: string; body: string; flags: string[]; created_at: string; seller: string | null; product: string;
  review: { rating: number; title: string | null; body: string; author: string } };
export async function adminReviews(status: string | null = 'pending'): Promise<{ reviews: AdminReview[]; replies: AdminReply[] }> {
  if (MARKET_DEMO) return demo.demoAdminReviews();
  return rpc('admin_reviews', { p_status: status });
}
export async function moderate(reviewId: string, target: 'review' | 'reply', action: 'publish' | 'reject' | 'hide', note?: string) {
  if (MARKET_DEMO) return demoOnly();
  return callFunction<{ status: string }>('after-sale', { action: 'moderate', reviewId, target, do: action, note });
}
export type PayoutRow = Balance & {
  id: string; name_en: string; slug: string; country: string; status: string; kind: string; kyc_status: string | null; iban_last4: string | null;
  last_payout: { amount_sar_minor: number; paid_on: string; reference: string } | null;
};
export async function adminPayouts(): Promise<PayoutRow[]> {
  if (MARKET_DEMO) return demo.demoPayouts();
  return rpc('admin_payouts');
}
export async function recordPayout(sellerId: string, amountSar: number, reference: string, paidOn: string, note?: string) {
  if (MARKET_DEMO) return demoOnly();
  return rpc('mp_record_payout', { p_seller: sellerId, p_amount_sar: amountSar, p_reference: reference, p_paid_on: paidOn, p_note: note ?? null });
}
export async function ledgerAdjust(sellerId: string, amountSar: number, note: string) {
  if (MARKET_DEMO) return demoOnly();
  return rpc('mp_ledger_adjust', { p_seller: sellerId, p_amount_sar: amountSar, p_note: note });
}
export async function adminThreads(flagged: boolean): Promise<Thread[]> {
  if (MARKET_DEMO) return demo.demoThreads('staff');
  return rpc('admin_threads', { p_flagged: flagged });
}
export async function adminPerformance(): Promise<(Performance & { name_en: string; slug: string; seller_status: string; kind: string })[]> {
  if (MARKET_DEMO) return demo.demoAdminPerformance();
  return rpc('admin_seller_performance');
}
export async function runPerformanceReview() {
  if (MARKET_DEMO) return demoOnly();
  return rpc<{ warned: number; suspended: number }>('mp_performance_review');
}
export type OutboxRow = {
  id: number; template_key: string; channel: string; audience: string; lang: string; subject_en: string; subject_ar: string; body_en: string; body_ar: string;
  status: string; send_after: string; created_at: string; read_at: string | null;
};
export async function outbox(filter: { audience?: string; key?: string }): Promise<OutboxRow[]> {
  if (MARKET_DEMO) return demo.demoOutbox().filter((r) => (!filter.audience || r.audience === filter.audience) && (!filter.key || r.template_key === filter.key));
  let q = supabase.from('notification_outbox').select('id, template_key, channel, audience, lang, subject_en, subject_ar, body_en, body_ar, status, send_after, created_at, read_at')
    .order('id', { ascending: false }).limit(200);
  if (filter.audience) q = q.eq('audience', filter.audience);
  if (filter.key) q = q.eq('template_key', filter.key);
  const { data, error } = await q;
  if (error) throw fromDb(error);
  return (data as OutboxRow[]) ?? [];
}

/** A fresh key for one press of a button that must never act twice (refunds). */
export const freshKey = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------- the marketplace dashboard (our team)
export type Overview = {
  days: number;
  queues: Record<'sellers_to_review' | 'listings_waiting' | 'listings_checking' | 'photos_checking' | 'returns_to_answer' | 'disputes' | 'refunds_to_make'
    | 'credit_notes_pending' | 'refunds_stuck' | 'reviews_to_publish' | 'conversations_flagged' | 'awaiting_acceptance' | 'late_to_ship' | 'not_collected' | 'delivery_failed'
    | 'shop_pages_to_approve' | 'payments_to_resolve' | 'moyasar_unrecorded', number>;
  sales: { orders: number; parcels: number; marketplace_parcels: number; marketplace_sar_minor: number; house_sar_minor: number; delivery_sar_minor: number;
    commission_sar_minor: number; refunded_sar_minor: number; cancelled_by_sellers: number; delivered: number };
  owed_to_sellers: { available_sar_minor: number; held_sar_minor: number; balance_sar_minor: number }; paid_out_sar_minor: number;
  sellers: { approved: number; partners: number; applying: number; suspended: number }; listings: { live: number; waiting: number; drafts: number };
  top_sellers: { id: string; name_en: string; slug: string; parcels: number; sales_sar_minor: number; commission_sar_minor: number; rating_avg: number | null; standard: string }[];
  destinations: { country: string; parcels: number }[]; notifications_queued: number;
  /** half-done work that finish-pending completes (review H3) */
  pending_work?: { orders_without_invoice: number; orders_not_handed_on: number; credit_notes_pending: number; refunds_processing: number;
    /** paid more than 7 days ago with no invoice: never invoiced by the job, settled with the accountant (review N5) */
    orders_without_invoice_old?: number; payment_issues?: number };
  /** the switches Afzal decides (DECISIONS.md, Needs Afzal); all off until he switches them on */
  switches?: { marketplace_open: boolean; sellers_open: boolean; payouts_enabled: boolean; sandbox_carrier: boolean | null; support_refund_limit_minor: number };
};
export async function adminOverview(days = 30): Promise<Overview> {
  if (MARKET_DEMO) return demo.demoOverview();
  return rpc('admin_marketplace_overview', { p_days: days });
}

// ---------------------------------------------------------------- public tracking (/track)
export type ParcelTrack = {
  tracking_number: string; status: string; carrier: string | null; expected_to: string | null; delivered_at: string | null;
  events: { status: string; at: string; en: string | null; ar: string | null; location: string | null }[];
};
export async function trackParcel(number: string): Promise<ParcelTrack | null> {
  if (MARKET_DEMO) return demo.demoTrack(number);
  if (!MARKET_LIVE) return null;
  return rpc<ParcelTrack | null>('track_parcel', { p_number: number });
}

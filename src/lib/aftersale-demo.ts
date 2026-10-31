// Example data for the after-sale screens, used ONLY in the screenshot build (EXPO_PUBLIC_MARKET_DEMO=1). Nothing here
// is real: no customer, seller, order, review or payment. In every other build these values are never read.
import type {
  AdminReply, AdminReview, Notice, OutboxRow, PayoutRow, Performance, ProductReviews, RefundQueue, ReturnRequest, ReviewItem, SellerReview,
  Statement, Thread, ThreadFull,
} from './aftersale';

const SELLER = { id: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', name_en: 'Dar Al Oud Madinah', name_ar: 'دار العود المدينة' };

const ret = (o: Partial<ReturnRequest> & Pick<ReturnRequest, 'id' | 'number' | 'status' | 'reason' | 'lines'>): ReturnRequest => ({
  order_id: 'demo-order', order_number: 104960, sub_order_id: 'so4', sub_order_number: 'AM-104960-3', kind: 'return', unopened: false, details: null,
  seller_note: null, escalation_note: null, staff_note: null, restock: false, respond_by: null, decided_by: null, created_at: '2026-10-30T08:10:00Z',
  accepted_at: null, declined_at: null, escalated_at: null, received_at: null, approved_at: null, resolved_at: null, currency: 'SAR', can_escalate: false,
  seller: SELLER, customer: 'Yusuf', photos: [], value_minor: o.lines.reduce((n, l) => n + l.unit_price_minor * l.quantity, 0), thread_id: 't2', refund: null, flags: [],
  ...o,
});
const rl = (id: string, name_en: string, name_ar: string, unit: number, qty: number, policy = 'unopened_only', variant: string | null = null) =>
  ({ order_item_id: id, name_en, name_ar, variant, quantity: qty, bought: qty, unit_price_minor: unit, line_total_minor: unit * qty, return_policy: policy, custom: false });

export function demoReturns(side: 'seller' | 'staff' | 'customer'): ReturnRequest[] {
  const rows = [
    ret({ id: 'r1', number: 'R-104960-1', status: 'requested', reason: 'damaged', respond_by: '2026-11-02T08:10:00Z',
      details: 'The bottle arrived with a cracked cap and some oil had leaked into the box.', photos: [{ id: 'p1', bucket: 'catalogue', path: '/products/aam/aswad-by-ahmed-10-ml-1.jpg', status: 'passed' }],
      lines: [rl('i1', 'Ameer al oud, aged oud oil, 6 ml', 'أمير العود، دهن عود معتّق ٦ مل', 98000, 1, 'unopened_only', '6 ml')] }),
    ret({ id: 'r2', number: 'R-104931-1', order_number: 104931, sub_order_number: 'AM-104931-2', status: 'accepted', reason: 'changed_mind', unopened: true,
      created_at: '2026-10-26T12:00:00Z', accepted_at: '2026-10-26T16:30:00Z', decided_by: 'seller', customer: 'Huda',
      seller_note: 'Please send it back in its box with the seal intact. Our courier will collect it.',
      lines: [rl('i2', 'Cambodian oud oil, 3 ml', 'دهن عود كمبودي ٣ مل', 45000, 1)] }),
    ret({ id: 'r3', number: 'R-104902-1', order_number: 104902, sub_order_number: 'AM-104902-1', status: 'escalated', reason: 'not_as_described',
      created_at: '2026-10-21T09:00:00Z', declined_at: '2026-10-22T10:00:00Z', escalated_at: '2026-10-22T19:40:00Z', decided_by: 'seller', customer: 'Abdullah',
      details: 'The listing says Assam oud, but the oil smells nothing like the Assam oils I know.',
      seller_note: 'This oil is from Assam wood we distilled in May; the batch report is on the listing.',
      escalation_note: 'I would like Al Mukarramah to check it. I can send the bottle back.',
      lines: [rl('i3', 'Assam oud oil, 3 ml', 'دهن عود آسامي ٣ مل', 52000, 1)] }),
    ret({ id: 'r4', number: 'R-104877-2', order_number: 104877, sub_order_number: 'AM-104877-1', status: 'approved', reason: 'wrong_item', restock: true,
      created_at: '2026-10-18T09:00:00Z', accepted_at: '2026-10-18T11:00:00Z', received_at: '2026-10-24T13:00:00Z', approved_at: '2026-10-24T13:00:00Z', decided_by: 'seller', customer: 'Fatimah',
      details: 'I ordered the 6 ml bottle and received a 3 ml one.', lines: [rl('i4', 'Ameer al oud, aged oud oil, 6 ml', 'أمير العود، دهن عود معتّق ٦ مل', 98000, 1, 'unopened_only', '6 ml')] }),
    ret({ id: 'r5', number: 'R-104850-1', order_number: 104850, sub_order_number: 'AM-104850-1', status: 'refunded', reason: 'faulty', kind: 'return',
      created_at: '2026-10-09T09:00:00Z', approved_at: '2026-10-14T10:00:00Z', resolved_at: '2026-10-14T12:00:00Z', decided_by: 'seller', customer: 'Sara',
      lines: [rl('i5', 'Bakhoor burner, brass', 'مبخرة نحاسية', 38000, 1, 'standard')], refund: { status: 'succeeded', amount_minor: 38000, completed_at: '2026-10-14T12:00:00Z' } }),
  ];
  return rows.map((r) => ({ ...r, customer: side === 'customer' ? null : side === 'staff' ? `${r.customer} (full name on the order)` : r.customer, flags: side === 'staff' ? r.flags : null }));
}

const review = (id: string, author: string, rating: number, title: string, body: string, lang: 'ar' | 'en', published: string, variant: string | null, reply?: string) => ({
  id, author, rating, title, body, lang, photos: [] as string[], published_at: published, verified: true, variant,
  reply: reply ? { body: reply, published_at: published, by_en: SELLER.name_en, by_ar: SELLER.name_ar } : null,
});
export function demoProductReviews(): ProductReviews {
  return {
    count: 24, avg: 4.71, stars: { 5: 19, 4: 4, 3: 1, 2: 0, 1: 0 },
    reviews: [
      review('v1', 'Maryam H.', 5, 'Deep, warm and lasts all day', 'Two sprays before Fajr and I can still smell it at Isha. Packed beautifully with a handwritten card.', 'en', '2026-10-28T10:00:00Z', null),
      review('v2', 'عبدالله', 5, 'من أجمل ما جرّبت', 'رائحة ثابتة وفخمة، والتغليف أنيق. وصلني في يومين.', 'ar', '2026-10-25T10:00:00Z', null),
      review('v3', 'Yusuf A.', 4, 'Excellent, a little strong at first', 'Beautiful scent. It is strong for the first half hour, then settles into something soft.', 'en', '2026-10-19T10:00:00Z', null),
    ],
  };
}
export function demoReviewItem(): ReviewItem {
  return {
    item: { id: 'i1', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل', variant: '6 ml', order_number: 104960, order_id: 'demo-order' },
    product: { id: 'demo-live', slug: 'ameer-al-oud-6ml', image: '/products/aam/aswad-by-ahmed-10-ml-1.jpg', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل' },
    delivered_at: '2026-10-29T15:00:00Z', can_review: true, review: null,
  };
}
export function demoSellerReviews(): SellerReview[] {
  const prod = { id: 'demo-live', slug: 'ameer-al-oud-6ml', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل' };
  return [
    { id: 'v1', product: prod, author: 'Maryam H.', rating: 5, title: 'Deep, warm and lasts all day', body: 'A few drops at Fajr and I can still smell it at Isha. Packed beautifully with a handwritten card.', lang: 'en', photos: [],
      published_at: '2026-10-28T10:00:00Z', reply: { body: 'Thank you, Maryam. May it bring you barakah.', status: 'published', moderation_note: null, published_at: '2026-10-28T12:00:00Z' } },
    { id: 'v2', product: prod, author: 'عبدالله', rating: 5, title: 'من أجمل ما جرّبت', body: 'رائحة العود صافية وثابتة، والتغليف فاخر. وصلني في يومين.', lang: 'ar', photos: [], published_at: '2026-10-25T10:00:00Z', reply: null },
    { id: 'v3', product: { ...prod, name_en: 'Cambodian oud oil, 3 ml', name_ar: 'دهن عود كمبودي ٣ مل' }, author: 'Yusuf A.', rating: 3, title: 'Good oil, slow delivery',
      body: 'The oil is lovely but it took six days to reach Dammam.', lang: 'en', photos: [], published_at: '2026-10-20T10:00:00Z',
      reply: { body: 'We are sorry for the wait, Yusuf. Our courier had a delay in the Eastern Province that week.', status: 'pending', moderation_note: null, published_at: null } },
  ];
}

export function demoThreads(side: 'customer' | 'seller' | 'staff'): Thread[] {
  const s = { name_en: SELLER.name_en, name_ar: SELLER.name_ar, slug: 'dar-al-oud-madinah' };
  return [
    { id: 't1', subject: 'Ameer al oud, aged oud oil, 6 ml', status: 'open', last_message_at: '2026-10-31T08:05:00Z', last_sender: side === 'customer' ? 'seller' : 'customer', unread: true,
      seller: s, customer: 'Maryam H.', product: { id: 'demo-live', slug: 'ameer-al-oud-6ml', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود ٦ مل' }, order: null, order_id: null, return: null,
      preview: side === 'customer' ? 'It is from Cambodian wood, aged for five years.' : 'Is this oil from Cambodian or Assam wood?', flagged: side === 'staff' ? false : null },
    { id: 't2', subject: 'Return R-104960-1', status: 'open', last_message_at: '2026-10-30T09:20:00Z', last_sender: 'seller', unread: false, seller: s, customer: 'Yusuf A.',
      product: null, order: 'AM-104960-3', order_id: 'demo-order', return: 'R-104960-1', preview: 'We are sorry it arrived like this. We will send a new bottle.', flagged: side === 'staff' ? false : null },
    { id: 't3', subject: 'Order AM-104931-2', status: 'open', last_message_at: '2026-10-27T18:00:00Z', last_sender: 'customer', unread: false, seller: s, customer: 'Huda',
      product: null, order: 'AM-104931-2', order_id: 'demo-order', return: null, preview: 'Please write ••• on the gift card.', flagged: side === 'staff' ? true : null },
  ];
}
export function demoThread(id: string): ThreadFull {
  const t = demoThreads('customer').find((x) => x.id === id) ?? demoThreads('customer')[0];
  const seller = typeof window !== 'undefined' && /^\/(seller|admin)/.test(window.location.pathname);
  const side = typeof window !== 'undefined' && /^\/admin/.test(window.location.pathname) ? 'staff' : seller ? 'seller' : 'customer';
  const m = (n: number, sender: 'customer' | 'seller', body: string, at: string, masked = 0) => ({ id: n, sender, body, masked, at, mine: sender === side, flags: side === 'staff' ? (masked ? ['contact_phone'] : []) : null });
  return {
    ...t, side,
    messages: t.id === 't1' ? [
      m(1, 'customer', 'Is this oil from Cambodian or Assam wood? I am buying it as a gift for my father.', '2026-10-31T07:40:00Z'),
      m(2, 'seller', 'It is from Cambodian wood, aged for five years. It is gentle and sweet, a lovely gift for a father. We can add a handwritten card at no cost.', '2026-10-31T08:05:00Z'),
    ] : t.id === 't3' ? [
      m(1, 'customer', 'Please write a card for my mother. You can call me on ••• if anything is unclear.', '2026-10-27T17:40:00Z', 1),
      m(2, 'seller', 'Of course. We will write your message on our card and pack it with the bottle.', '2026-10-27T17:55:00Z'),
    ] : [
      m(1, 'customer', 'The cap was cracked and some oil leaked into the box. Photos are on the return.', '2026-10-30T08:12:00Z'),
      m(2, 'seller', 'We are sorry it arrived like this. We will send a new bottle as soon as the return is approved.', '2026-10-30T09:20:00Z'),
    ],
  };
}

export function demoNotices(side: 'customer' | 'seller'): { unread: number; items: Notice[] } {
  const n = (id: number, key: string, en: string, ar: string, ben: string, bar: string, at: string, link: string, read = false): Notice => ({ id, key, subject_en: en, subject_ar: ar, body_en: ben, body_ar: bar, link, at, read });
  const items = side === 'seller' ? [
    n(1, 'seller_new_order', 'New order AM-104987-1', 'طلب جديد AM-104987-1', 'A customer in Riyadh ordered 1 × Ameer al oud, 1 × Cambodian oud oil.', 'طلب عميل في الرياض: ١ × أمير العود، ١ × دهن عود كمبودي.', '2026-10-31T07:40:00Z', '/seller/orders'),
    n(2, 'seller_return_requested', 'Return request R-104960-1', 'طلب إرجاع R-104960-1', 'A customer asked to return items from AM-104960-3 (arrived damaged). Please answer by 2026-11-02.', 'طلب عميل إرجاع منتجات من الطلب AM-104960-3 (وصل تالفًا). يرجى الرد قبل 2026-11-02.', '2026-10-30T08:10:00Z', '/seller/returns'),
    n(3, 'seller_payout_recorded', 'Payout of SAR 4,850.00 sent', 'تم تحويل 4,850.00 ر.س', 'We transferred SAR 4,850.00 to your account ending 7519 on 2026-10-15 (reference TRX-2026-1015-07).', 'حوّلنا 4,850.00 ر.س إلى حسابك المنتهي بـ 7519 بتاريخ 2026-10-15 (المرجع TRX-2026-1015-07).', '2026-10-15T11:00:00Z', '/seller/statements', true),
  ] : [
    n(1, 'parcel_shipped', 'Your parcel AM-104960-3 is on its way', 'طردك AM-104960-3 في الطريق إليك', 'Sandbox road courier has collected it. Tracking number: SBX1093847562.', 'استلمه المندوب. رقم التتبع: SBX1093847562.', '2026-10-29T10:00:00Z', '/order?id=demo-order'),
  ];
  return { unread: items.filter((x) => !x.read).length, items };
}

export function demoStatement(month?: string): Statement {
  const oct = !month || month.startsWith('2026-10');
  const e = (id: number, kind: Statement['entries'][number]['kind'], booked: string, amount: number, note: string, items?: [string, string], available = booked) =>
    ({ id, kind, booked_on: booked, available_on: available, currency: 'SAR', amount_minor: amount, amount_sar_minor: amount, note, items_en: items?.[0] ?? null, items_ar: items?.[1] ?? null });
  const entries = oct ? [
    e(1, 'sale', '2026-10-03', 98000, 'AM-104812-1', ['1 × Ameer al oud, aged oud oil, 6 ml', '١ × أمير العود، دهن عود معتّق ٦ مل'], '2026-10-13'),
    e(2, 'commission', '2026-10-03', -24500, 'AM-104812-1', undefined, '2026-10-13'),
    e(3, 'sale', '2026-10-09', 135000, 'AM-104850-1', ['2 × Cambodian oud oil, 3 ml, 1 × Bakhoor burner, brass', '٢ × دهن عود كمبودي ٣ مل، ١ × مبخرة نحاسية'], '2026-10-26'),
    e(4, 'commission', '2026-10-09', -33750, 'AM-104850-1', undefined, '2026-10-26'),
    e(5, 'refund', '2026-10-14', -38000, 'AM-104850-1: Faulty burner, returned', undefined, '2026-10-14'),
    e(6, 'commission_refund', '2026-10-14', 9500, 'AM-104850-1', undefined, '2026-10-14'),
    e(7, 'payout', '2026-10-15', -485000, 'Bank transfer TRX-2026-1015-07'),
    e(8, 'sale', '2026-10-29', 98000, 'AM-104960-3', ['1 × Ameer al oud, aged oud oil, 6 ml', '١ × أمير العود، دهن عود معتّق ٦ مل'], '2026-11-08'),
    e(9, 'commission', '2026-10-29', -24500, 'AM-104960-3', undefined, '2026-11-08'),
  ] : [
    e(10, 'sale', '2026-09-12', 420000, 'AM-104701-1', ['6 × Cambodian oud oil, 3 ml, 2 × Ameer al oud, 6 ml', '٦ × دهن عود كمبودي ٣ مل، ٢ × أمير العود ٦ مل'], '2026-09-22'),
    e(11, 'commission', '2026-09-12', -105000, 'AM-104701-1', undefined, '2026-09-22'),
    e(12, 'sale', '2026-09-24', 230000, 'AM-104766-2', ['2 × Assam oud oil, 3 ml, 1 × Bakhoor burner, brass', '٢ × دهن عود آسامي ٣ مل، ١ × مبخرة نحاسية'], '2026-10-04'),
    e(13, 'commission', '2026-09-24', -57500, 'AM-104766-2', undefined, '2026-10-04'),
  ];
  const sum = (k: string[]) => entries.filter((x) => k.includes(x.kind)).reduce((n, x) => n + x.amount_sar_minor, 0);
  const opening = oct ? 487500 : 0;
  const net = entries.reduce((n, x) => n + x.amount_sar_minor, 0);
  return {
    seller: { id: SELLER.id, name_en: SELLER.name_en, name_ar: SELLER.name_ar, country: 'SA' }, month: oct ? '2026-10-01' : '2026-09-01', currency: 'SAR',
    opening_sar_minor: opening, closing_sar_minor: opening + net,
    totals: { sales: sum(['sale']), commission: sum(['commission']), refunds: sum(['refund', 'commission_refund']), adjustments: 0, payouts: sum(['payout', 'payout_reversal']), net, orders: entries.filter((x) => x.kind === 'sale').length },
    entries, payouts: oct ? [{ id: 'po1', amount_sar_minor: 485000, paid_on: '2026-10-15', reference: 'TRX-2026-1015-07', iban_last4: '7519', status: 'paid' }] : [],
    months: ['2026-10-01', '2026-09-01'],
    balance: { balance_sar_minor: 222250, available_sar_minor: 148750, held_sar_minor: 73500, next_available_on: '2026-11-08' },
  };
}

export function demoPerformance(): Performance {
  return {
    seller_id: SELLER.id, window_days: 90, status: 'warn', orders: 46, min_orders: 10, auto_suspend: false,
    metrics: {
      late_shipment: { bps: 217, count: 1, of: 46, status: 'ok', warn: 500, limit: 1500 },
      cancellation: { bps: 435, count: 2, of: 46, status: 'warn', warn: 250, limit: 1000 },
      returns: { bps: 263, count: 1, of: 38, status: 'ok', warn: 1000, limit: 2500 },
      rating: { x100: 471, count: 24, status: 'ok', warn: 400, limit: 350 },
      response_hours: { median: 2.4 },
    },
  };
}

export function demoRefundQueue(): RefundQueue {
  const r = demoReturns('staff');
  return {
    returns: r.filter((x) => x.status === 'approved'),
    cancelled: [{ sub_order_id: 'so9', number: 'AM-104990-2', order_id: 'demo-order-2', order_number: 104990, seller: 'Rawdah Looms', cancel_reason: 'The loom broke this week; we cannot make the mat in time.',
      cancelled_at: '2026-10-31T06:00:00Z', currency: 'SAR', amount_minor: 48000 }],
    credit_notes: [],
    stuck: [],
    // a goodwill refund made in Moyasar's dashboard, and a refund marked failed that Moyasar completed later (R3-2)
    unrecorded: [{
      order_id: 'demo-order-4', order_number: 104861, currency: 'SAR', moyasar_refunded_minor: 8000, refunded_minor: 0, unrecorded_minor: 8000, checked_at: '2026-10-31T07:40:00Z',
      failed: [{ id: 'f9', order_id: 'demo-order-4', order_number: 104861, return_id: null, status: 'failed', currency: 'SAR', amount_minor: 6000, items_minor: 6000, shipping_minor: 0,
        duties_minor: 0, platform_minor: 6000, reason: 'Dates arrived crushed', restock: false, error: 'Moyasar shows no refund for this 15 minutes after it was asked (checked with Moyasar)',
        credit_note_status: 'not_needed', credit_note: null, created_at: '2026-10-30T18:02:00Z', completed_at: '2026-10-30T18:20:00Z',
        lines: [{ kind: 'item', quantity: 1, amount_minor: 6000, name_en: 'Ajwa dates, 1 kg' }] }],
      lines: [{ order_item_id: 'i61', name_en: 'Ajwa dates, 1 kg', quantity: 1, refundable: 1, line_total_minor: 6000 },
              { order_item_id: 'i62', name_en: 'Rose water, 250 ml', quantity: 2, refundable: 2, line_total_minor: 4000 }],
      parcels: [{ sub_order_id: 'so61', number: 'AM-104861-1', shipping_left: 3000 }],
    }],
    recent: [{ id: 'f1', order_id: 'demo-order-3', order_number: 104850, return_id: 'r5', status: 'succeeded', currency: 'SAR', amount_minor: 38000, items_minor: 38000, shipping_minor: 0,
      duties_minor: 0, platform_minor: 38000, reason: 'Return R-104850-1: faulty burner', restock: false, error: null, credit_note_status: 'issued', credit_note: 'CN-2026-000041',
      created_at: '2026-10-14T11:58:00Z', completed_at: '2026-10-14T12:00:00Z', lines: [{ kind: 'item', quantity: 1, amount_minor: 38000, name_en: 'Bakhoor burner, brass' }] }],
  };
}

export function demoAdminReviews(): { reviews: AdminReview[]; replies: AdminReply[] } {
  return {
    reviews: [
      { id: 'v9', status: 'pending', rating: 5, title: 'Beautiful mat', body: 'Soft and dense. If you want one too, message me on ••• and I will tell you where to buy it cheaper.', lang: 'en',
        author: 'Khalid M.', flags: ['contact_phone', 'solicit'], moderation_note: null, created_at: '2026-10-31T06:30:00Z', published_at: null,
        product: { id: 'demo-mat', slug: 'rawdah-mihrab-mat', name_en: 'Mihrab prayer mat, hand-woven wool' }, seller: 'Rawdah Looms', photos: [] },
      { id: 'v8', status: 'pending', rating: 4, title: 'رائحة جميلة', body: 'رائحة العود ثابتة طوال اليوم، والتغليف أنيق. أتمنى لو كانت العبوة أكبر.', lang: 'ar',
        author: 'نورة', flags: [], moderation_note: null, created_at: '2026-10-30T21:10:00Z', published_at: null,
        product: { id: 'demo-live', slug: 'ameer-al-oud-6ml', name_en: 'Ameer al oud, aged oud oil, 6 ml' }, seller: SELLER.name_en,
        photos: [{ id: 'ph1', bucket: 'catalogue', path: '/products/aam/aswad-by-ahmed-10-ml-1.jpg', status: 'passed' }] },
    ],
    replies: [{ review_id: 'v3', status: 'pending', body: 'We are sorry for the wait, Yusuf. Our courier had a delay in the Eastern Province that week.', flags: [], created_at: '2026-10-20T12:00:00Z',
      seller: SELLER.name_en, product: 'Cambodian oud oil, 3 ml', review: { rating: 3, title: 'Good oil, slow delivery', body: 'The oil is lovely but it took six days to reach Dammam.', author: 'Yusuf A.' } }],
  };
}

export function demoPayouts(): PayoutRow[] {
  return [
    { id: SELLER.id, name_en: SELLER.name_en, slug: 'dar-al-oud-madinah', country: 'SA', status: 'approved', kind: 'marketplace', kyc_status: 'approved', iban_last4: '7519',
      last_payout: { amount_sar_minor: 485000, paid_on: '2026-10-15', reference: 'TRX-2026-1015-07' }, balance_sar_minor: 222250, available_sar_minor: 148750, held_sar_minor: 73500, next_available_on: '2026-11-08' },
    { id: 'demo-looms', name_en: 'Rawdah Looms', slug: 'rawdah-looms', country: 'SA', status: 'approved', kind: 'marketplace', kyc_status: 'approved', iban_last4: '2207',
      last_payout: null, balance_sar_minor: 33750, available_sar_minor: 33750, held_sar_minor: 0, next_available_on: null },
    { id: 'demo-tailor', name_en: 'Al Noor Tailoring', slug: 'al-noor-tailoring', country: 'SA', status: 'approved', kind: 'marketplace', kyc_status: 'approved', iban_last4: '9904',
      last_payout: { amount_sar_minor: 1210000, paid_on: '2026-10-15', reference: 'TRX-2026-1015-03' }, balance_sar_minor: 287500, available_sar_minor: 0, held_sar_minor: 287500, next_available_on: '2026-11-03' },
  ];
}

export function demoAdminPerformance() {
  const p = demoPerformance();
  return [
    { ...p, name_en: SELLER.name_en, slug: 'dar-al-oud-madinah', seller_status: 'approved', kind: 'marketplace' },
    { ...p, seller_id: 'demo-tailor', status: 'ok' as const, orders: 31, name_en: 'Al Noor Tailoring', slug: 'al-noor-tailoring', seller_status: 'approved', kind: 'marketplace',
      metrics: { ...p.metrics, cancellation: { ...p.metrics.cancellation, bps: 0, count: 0, of: 31, status: 'ok' as const }, rating: { ...p.metrics.rating, x100: 488, count: 17 } } },
    { ...p, seller_id: 'demo-looms', status: 'new' as const, orders: 3, name_en: 'Rawdah Looms', slug: 'rawdah-looms', seller_status: 'approved', kind: 'marketplace' },
  ];
}

export function demoOutbox(): OutboxRow[] {
  const o = (id: number, key: string, channel: string, audience: string, en: string, ar: string, ben: string, bar: string, at: string): OutboxRow =>
    ({ id, template_key: key, channel, audience, lang: audience === 'customer' ? 'ar' : 'en', subject_en: en, subject_ar: ar, body_en: ben, body_ar: bar, status: 'queued', send_after: at, created_at: at, read_at: null });
  return [
    o(9, 'seller_new_order', 'email', 'seller', 'New order AM-104987-1', 'طلب جديد AM-104987-1', 'A customer in Riyadh ordered 1 × Ameer al oud, aged oud oil, 6 ml. Please accept it and prepare it for our courier. You receive SAR 735.00 after commission.', 'طلب عميل في الرياض: ١ × أمير العود ٦ مل. يرجى قبول الطلب وتجهيزه لمندوبنا. صافي ما تستلمه بعد العمولة: 735.00 ر.س.', '2026-10-31T07:40:00Z'),
    o(8, 'order_confirmed', 'email', 'customer', 'Your order AM-104987 is confirmed', 'تم تأكيد طلبك AM-104987', 'Thank you for your order. We have received your payment of SAR 1,380.00 and will tell you as each parcel is on its way.', 'شكرًا لطلبك. استلمنا دفعتك بقيمة 1,380.00 ر.س، وسنخبرك عند شحن كل طرد.', '2026-10-31T07:40:00Z'),
    o(7, 'return_declined', 'email', 'customer', 'About your return R-104902-1', 'بخصوص طلب الإرجاع R-104902-1', 'Dar Al Oud Madinah could not accept your request. You can read why on your order page and, if you disagree, ask Al Mukarramah to decide within 7 days.', 'لم يتمكن دار العود المدينة من قبول طلبك. يمكنك الاطلاع على السبب في صفحة طلبك، وإن لم توافق فاطلب من المكرمة البتّ فيه خلال 7 أيام.', '2026-10-22T10:00:00Z'),
    o(6, 'parcel_shipped', 'push', 'customer', 'Your parcel AM-104960-3 is on its way', 'طردك AM-104960-3 في الطريق إليك', 'Sandbox road courier has collected it. Tracking number: SBX1093847562.', 'استلمه المندوب. رقم التتبع: SBX1093847562.', '2026-10-29T10:00:00Z'),
  ];
}

// ---------------------------------------------------------------- the customer's example order (/order?id=demo-order)
export function demoOrderTracking(): import('./orders').OrderTracking {
  const r = demoReturns('customer')[0];
  const ev = (status: string, at: string, en: string, ar: string) => ({ status, at, en, ar, location: null });
  return {
    order: { id: 'demo-order', number: 104960, status: 'delivered', currency: 'SAR', duties_minor: 0, refunded_minor: 0 },
    refunds: [], faulty_claim_days: 30,
    sub_orders: [
      { id: 'so4', number: 'AM-104960-3', status: 'delivered', kind: 'marketplace', seller: { slug: 'dar-al-oud-madinah', name_en: SELLER.name_en, name_ar: SELLER.name_ar },
        items_minor: 98000, shipping_minor: 3000, duties_minor: 0, duties_mode: 'none', days_min: 2, days_max: 4, production_days: 0,
        expected_from: '2026-10-29', expected_to: '2026-10-31', cancel_reason: null, shipped_at: '2026-10-29T10:00:00Z', delivered_at: '2026-10-29T15:00:00Z',
        refunded_minor: 0, problem_until: '2026-11-28', not_received_from: null, thread_id: 't2', returns: [r],
        lines: [{ id: 'i1', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل', variant: '6 ml', quantity: 1, line_total_minor: 98000,
          return_policy: 'unopened_only', return_window_days: 7, product_id: 'demo-live', refunded_quantity: 0, returnable_quantity: 0, change_mind_until: '2026-11-05', review: null }],
        shipments: [{ status: 'delivered', tracking_number: 'SBX1093847562', tracking_url: 'https://almukarramah.com/track?number=SBX1093847562', carrier: 'Sandbox road courier',
          events: [ev('delivered', '2026-10-29T15:00:00Z', 'Delivered', 'تم التوصيل'), ev('out_for_delivery', '2026-10-29T12:00:00Z', 'Out for delivery', 'خرجت للتوصيل'),
            ev('picked_up', '2026-10-29T10:00:00Z', 'Collected from the seller', 'استلمها المندوب من البائع')] }] },
      { id: 'so5', number: 'AM-104960-1', status: 'delivered', kind: 'house', seller: null,
        items_minor: 6000, shipping_minor: 2500, duties_minor: 0, duties_mode: 'none', days_min: 1, days_max: 3, production_days: 0,
        expected_from: '2026-10-28', expected_to: '2026-10-30', cancel_reason: null, shipped_at: '2026-10-28T09:00:00Z', delivered_at: '2026-10-28T17:00:00Z',
        refunded_minor: 0, problem_until: '2026-11-27', not_received_from: null, thread_id: null, returns: [],
        lines: [{ id: 'i6', name_en: 'Ajwa dates, 1 kg', name_ar: 'تمر عجوة، ١ كغ', variant: null, quantity: 1, line_total_minor: 6000, return_policy: 'faulty_only', return_window_days: 3,
          product_id: 'demo-dates', refunded_quantity: 0, returnable_quantity: 1, change_mind_until: null, review: { id: 'v7', status: 'published', rating: 5 } }],
        shipments: [{ status: 'delivered', tracking_number: 'SBX5501928374', tracking_url: null, carrier: 'Sandbox road courier',
          events: [ev('delivered', '2026-10-28T17:00:00Z', 'Delivered', 'تم التوصيل')] }] },
    ],
  };
}

export function demoOverview(): import('./aftersale').Overview {
  return {
    days: 30,
    queues: { sellers_to_review: 3, listings_waiting: 7, listings_checking: 1, photos_checking: 2, returns_to_answer: 2, disputes: 1, refunds_to_make: 2,
      credit_notes_pending: 0, refunds_stuck: 0, reviews_to_publish: 3, conversations_flagged: 1, awaiting_acceptance: 1, late_to_ship: 1, not_collected: 0, delivery_failed: 0,
      shop_pages_to_approve: 1, payments_to_resolve: 0, moyasar_unrecorded: 1 },
    sales: { orders: 184, parcels: 236, marketplace_parcels: 97, marketplace_sar_minor: 6845000, house_sar_minor: 9120000, delivery_sar_minor: 702500,
      commission_sar_minor: 1711250, refunded_sar_minor: 188000, cancelled_by_sellers: 2, delivered: 201 },
    owed_to_sellers: { available_sar_minor: 1820000, held_sar_minor: 2430000, balance_sar_minor: 4250000 }, paid_out_sar_minor: 3170000,
    sellers: { approved: 12, partners: 2, applying: 5, suspended: 0 }, listings: { live: 318, waiting: 7, drafts: 41 },
    top_sellers: [
      { id: 's1', name_en: 'Dar Al Oud Madinah', slug: 'dar-al-oud-madinah', parcels: 38, sales_sar_minor: 2860000, commission_sar_minor: 715000, rating_avg: 4.71, standard: 'warn' },
      { id: 's2', name_en: 'Al Noor Tailoring', slug: 'al-noor-tailoring', parcels: 24, sales_sar_minor: 2170000, commission_sar_minor: 542500, rating_avg: 4.88, standard: 'ok' },
      { id: 's3', name_en: 'Rawdah Looms', slug: 'rawdah-looms', parcels: 3, sales_sar_minor: 135000, commission_sar_minor: 33750, rating_avg: 5, standard: 'new' },
    ],
    destinations: [{ country: 'SA', parcels: 171 }, { country: 'AE', parcels: 31 }, { country: 'KW', parcels: 14 }, { country: 'GB', parcels: 11 }, { country: 'QA', parcels: 9 }],
    notifications_queued: 412,
    pending_work: { orders_without_invoice: 0, orders_not_handed_on: 0, credit_notes_pending: 0, refunds_processing: 0, orders_without_invoice_old: 0, payment_issues: 0 },
    switches: { marketplace_open: false, sellers_open: false, payouts_enabled: false, sandbox_carrier: false, support_refund_limit_minor: 0 },
  };
}

export function demoTrack(number: string): import('./aftersale').ParcelTrack | null {
  if (!/^SBX\d{10}$/i.test(number)) return null;
  const e = (status: string, at: string, en: string, ar: string, location: string | null) => ({ status, at, en, ar, location });
  return {
    tracking_number: number.toUpperCase(), status: 'out_for_delivery', carrier: 'Sandbox road courier', expected_to: '2026-11-02', delivered_at: null,
    events: [
      e('out_for_delivery', '2026-11-01T07:10:00Z', 'Out for delivery', 'خرجت للتوصيل', 'Dammam'),
      e('in_transit', '2026-10-31T16:00:00Z', 'On the way', 'في الطريق', 'Riyadh hub'),
      e('picked_up', '2026-10-31T10:00:00Z', 'Collected from the seller', 'استلمها المندوب من البائع', 'Madinah'),
      e('label_created', '2026-10-31T08:00:00Z', 'Label created; waiting for the courier', 'تم إنشاء ملصق الشحن، بانتظار المندوب', null),
    ],
  };
}

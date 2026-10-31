-- Marketplace (8 of 9): after the sale.
--
-- * Statements. Each seller's money is an append-only ledger in SAR, the statement currency. A sale is booked when
--   the parcel is delivered (the items, less our commission). It can be paid out once the return window and a short
--   hold have passed and no return is open on it. Refunds come off it, and the commission on them is given back.
--   Adjustments need a reason. Our finance team pays sellers by bank transfer and RECORDS each payout here: nothing in
--   the database moves money. Monthly statements are worked out from the ledger.
-- * Refunds. Staff only (owner, manager, finance, support), through the refund-order function. The amount is worked
--   out here from the lines (never taken from a browser); Moyasar refunds it; a ZATCA credit note is issued against our
--   invoice for the part we invoiced; stock goes back when the items came back fit to sell; the ledger follows.
--   Partial and repeated refunds are supported, and nothing can be refunded twice (an idempotency key, and the amounts
--   still refundable on every line).
-- * Returns and disputes. The customer asks within the item's return policy. Made-to-measure and "faulty only" items
--   come back only when faulty, damaged, wrong, missing or not as described, and a problem can always be reported for
--   30 days after delivery (setting). The seller accepts (the customer sends it back and the seller confirms it
--   arrived) or declines with a reason; the customer can then ask Al Mukarramah to decide. Only our team refunds.
-- * Reviews. Verified purchases only: a delivered item, one review per item bought. Text is checked for contact
--   details by the after-sale function; our team reads every review before it is published (setting); photos are
--   screened like every photo. Sellers reply once per review. Products keep their average rating.
-- * Messages. Customers and sellers write to each other only through Al Mukarramah. The after-sale function masks
--   contact details before anything is stored, and a message asking to deal outside the platform flags the
--   conversation for our team. Sellers never see a customer's email address or phone number.
-- * Notifications. An outbox of service messages with English and Arabic templates, written out when queued. Nothing
--   is sent: no email or push provider is connected. In-app notifications are read from the outbox. Marketing is
--   never queued here.
-- * Performance. Late shipments, seller cancellations, returns and ratings over a window, against thresholds; the
--   seller is warned. Automatic suspension happens only if it is switched on, and it is off.
-- Every table has row-level security. Rows are written only by the functions below (most of them server only) and are
-- audited.

-- ================================================================ settings and columns
alter table mp_settings
  add column payout_hold_days int not null default 3 check (payout_hold_days between 0 and 60),         -- after the return window
  add column return_response_days int not null default 3 check (return_response_days between 1 and 14), -- the seller answers a return
  add column dispute_window_days int not null default 7 check (dispute_window_days between 1 and 30),    -- the customer can then ask us
  add column faulty_claim_days int not null default 30 check (faulty_claim_days between 7 and 365),      -- a problem can be reported
  add column review_window_days int not null default 365 check (review_window_days between 30 and 730),
  add column review_auto_publish boolean not null default false,                                         -- false: our team reads each one
  add column messages_per_hour int not null default 30 check (messages_per_hour between 1 and 500),
  add column notifications_send_enabled boolean not null default false,                                  -- no provider connected yet
  -- decisions given their safest default until Afzal decides (DECISIONS.md, "Needs Afzal")
  add column payouts_enabled boolean not null default false,            -- no payout is recorded until the VAT treatment of payouts is settled
  add column support_refund_limit_minor int not null default 0 check (support_refund_limit_minor >= 0),   -- SAR halalas; 0: support does not refund
  add column payout_bank_hold_days int not null default 7 check (payout_bank_hold_days between 0 and 60); -- payouts wait after bank details change

create or replace function mp_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allow_modest_models_in_fashion', allow_modest_models_in_fashion, 'min_quality_score', min_quality_score,
    'quality_weights', quality_weights, 'default_min_photos', default_min_photos, 'default_min_long_side_px', default_min_long_side_px,
    'price_change_review_bps', price_change_review_bps, 'strike_limit', strike_limit, 'strike_window_days', strike_window_days,
    'perf_window_days', perf_window_days, 'perf_thresholds', perf_thresholds,
    'require_sample', require_sample, 'min_portfolio_photos', min_portfolio_photos, 'min_story_chars', min_story_chars,
    'default_return_window_days', default_return_window_days, 'payout_hold_days', payout_hold_days,
    'return_response_days', return_response_days, 'dispute_window_days', dispute_window_days, 'faulty_claim_days', faulty_claim_days,
    'review_window_days', review_window_days, 'messages_per_hour', messages_per_hour,
    'marketplace_open', marketplace_open, 'sellers_open', sellers_open,
    'max_upload_bytes', 10485760, 'upload_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp'))
  from mp_settings where id = 1;
$$;
grant execute on function mp_public_settings() to anon, authenticated;

alter table orders
  add column fx_per_sar numeric(18,8) check (fx_per_sar is null or fx_per_sar > 0),   -- the rate used at checkout
  add column refunded_minor int not null default 0 check (refunded_minor >= 0);
alter table sub_orders add column refunded_minor int not null default 0 check (refunded_minor >= 0);
-- Tax documents keep the VAT rate and exchange rate they were issued with (a credit note copies its invoice's), and an
-- order has one tax invoice (mp_issue_document below; review H3, M9, M10). Existing invoices are not changed.
alter table invoices
  add column vat_rate_bp int check (vat_rate_bp is null or vat_rate_bp between 0 and 5000),
  add column fx_per_sar numeric(18,8) check (fx_per_sar is null or fx_per_sar > 0);   -- units of its currency per SAR
create unique index invoices_one_per_order on invoices (order_id) where doc = 'invoice' and order_id is not null;
alter table order_items
  add column refunded_quantity int not null default 0 check (refunded_quantity >= 0),
  add column refunded_minor int not null default 0 check (refunded_minor >= 0),
  add constraint order_items_refunded_quantity check (refunded_quantity <= quantity);

-- customers' photos of a problem with an order (screened like every photo)
alter table media_assets drop constraint media_assets_kind_check;
alter table media_assets add constraint media_assets_kind_check
  check (kind in ('listing_photo', 'seller_logo', 'seller_banner', 'portfolio', 'review_photo', 'return_photo'));

-- ================================================================ notifications
create table notification_templates (
  key text primary key check (key ~ '^[a-z][a-z_]{2,59}$'),
  audience text not null check (audience in ('customer', 'seller', 'staff')),
  channels text[] not null check (cardinality(channels) between 1 and 3 and channels <@ array['email', 'push', 'in_app']::text[]),
  purpose text not null default 'transactional' check (purpose = 'transactional'),   -- marketing is never queued here
  subject_en text not null check (char_length(subject_en) between 3 and 200),
  subject_ar text not null check (char_length(subject_ar) between 3 and 200),
  body_en text not null check (char_length(body_en) between 3 and 2000),
  body_ar text not null check (char_length(body_ar) between 3 and 2000),
  link text check (link is null or link ~ '^/'),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table notification_outbox (
  id bigint generated always as identity primary key,
  template_key text not null references notification_templates,
  channel text not null check (channel in ('email', 'push', 'in_app')),
  audience text not null check (audience in ('customer', 'seller', 'staff')),
  user_id uuid references auth.users on delete cascade,
  seller_id uuid references sellers on delete cascade,
  staff_roles staff_role[],
  order_id uuid references orders on delete cascade,        -- a guest's order: its email address is used when sending
  lang text not null default 'ar' check (lang in ('ar', 'en')),   -- the recipient's language when it was queued
  subject_en text not null,
  subject_ar text not null,
  body_en text not null,
  body_ar text not null,
  link text,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  dedupe_key text check (char_length(dedupe_key) <= 200),
  send_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dedupe_key, channel),
  check ((audience = 'customer' and (user_id is not null or order_id is not null))
      or (audience = 'seller' and seller_id is not null)
      or (audience = 'staff' and staff_roles is not null))
);
create index notification_outbox_user on notification_outbox (user_id, send_after desc) where channel = 'in_app';
create index notification_outbox_seller on notification_outbox (seller_id, send_after desc) where channel = 'in_app';
create index notification_outbox_queue on notification_outbox (status, send_after) where status = 'queued' and channel <> 'in_app';

-- ================================================================ returns
create table return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  sub_order_id uuid not null references sub_orders on delete cascade,
  seq int not null check (seq between 1 and 99),               -- R-<order number>-<seq>
  seller_id uuid references sellers,                           -- null: our own products (our team answers)
  -- the customer; kept for the accounts but unlinked if they delete their account (the apps' account deletion)
  user_id uuid references auth.users on delete set null,
  kind text not null check (kind in ('return', 'refund_only')),   -- refund only: nothing to send back (not received, missing)
  reason text not null check (reason in ('changed_mind', 'not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received')),
  unopened boolean not null default false,
  details text check (char_length(details) <= 2000),           -- the customer's words, contact details masked
  photos uuid[] not null default '{}' check (cardinality(photos) <= 4),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'escalated', 'approved', 'refunded', 'rejected', 'withdrawn')),
  seller_note text check (char_length(seller_note) <= 1000),   -- shown to the customer (masked)
  escalation_note text check (char_length(escalation_note) <= 1000),
  staff_note text check (char_length(staff_note) <= 1000),     -- our decision, shown to the customer and the seller
  restock boolean not null default false,                       -- the items came back fit to sell again
  flags text[] not null default '{}',
  respond_by timestamptz,
  decided_by text check (decided_by in ('seller', 'staff')),
  approved_by uuid references auth.users on delete set null,   -- the person who approved it for a refund (review M13)
  accepted_at timestamptz,
  declined_at timestamptz,
  escalated_at timestamptz,
  received_at timestamptz,
  approved_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seq)
);
create index return_requests_seller on return_requests (seller_id, status, created_at desc);
create index return_requests_sub_order on return_requests (sub_order_id);
create index return_requests_queue on return_requests (status, created_at) where status in ('requested', 'escalated', 'approved');

create table return_lines (
  return_id uuid not null references return_requests on delete cascade,
  order_item_id uuid not null references order_items on delete cascade,
  quantity int not null check (quantity > 0),
  primary key (return_id, order_item_id)
);

-- ================================================================ refunds
create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  return_id uuid references return_requests,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  currency char(3) not null,
  amount_minor int not null check (amount_minor > 0),
  items_minor int not null default 0 check (items_minor >= 0),
  shipping_minor int not null default 0 check (shipping_minor >= 0),
  duties_minor int not null default 0 check (duties_minor >= 0),
  platform_minor int not null default 0 check (platform_minor >= 0),    -- the part on our tax invoice: the credit note's total
  reason text not null check (char_length(reason) between 3 and 500),
  restock boolean not null default false,
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  provider_ref text check (char_length(provider_ref) <= 200),
  credit_note_id uuid references invoices,
  credit_note_status text not null default 'not_needed' check (credit_note_status in ('not_needed', 'pending', 'issued')),
  error text check (char_length(error) <= 1000),
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (amount_minor = items_minor + shipping_minor + duties_minor),
  check (platform_minor <= items_minor + shipping_minor)
);
create index refunds_order on refunds (order_id, created_at);
-- One live refund per return (review H1); one refund waiting for Moyasar per order at a time, so reconciling with
-- Moyasar's refunded total is never ambiguous (review H2).
create unique index refunds_one_per_return on refunds (return_id) where return_id is not null and status in ('processing', 'succeeded');
create unique index refunds_one_processing on refunds (order_id) where status = 'processing';
create index refunds_pending_note on refunds (credit_note_status) where credit_note_status = 'pending';

create table refund_lines (
  id bigint generated always as identity primary key,
  refund_id uuid not null references refunds on delete cascade,
  sub_order_id uuid references sub_orders,
  order_item_id uuid references order_items,
  kind text not null check (kind in ('item', 'shipping', 'duties')),
  quantity int check (quantity > 0),
  amount_minor int not null check (amount_minor > 0),
  commission_minor int not null default 0 check (commission_minor >= 0),
  vat_rate_bp int check (vat_rate_bp between 0 and 5000),
  platform_invoiced boolean not null,
  check ((kind = 'item') = (order_item_id is not null and quantity is not null))
);
create index refund_lines_refund on refund_lines (refund_id);
create index refund_lines_item on refund_lines (order_item_id) where order_item_id is not null;
create index refund_lines_sub_order on refund_lines (sub_order_id) where sub_order_id is not null;

-- ================================================================ statements
create table seller_payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers,
  amount_sar_minor int not null check (amount_sar_minor > 0),
  method text not null default 'bank_transfer' check (method = 'bank_transfer'),
  iban_last4 text check (iban_last4 ~ '^[A-Z0-9]{4}$'),
  reference text not null check (char_length(reference) between 3 and 100),   -- the bank transfer's reference
  paid_on date not null,
  note text check (char_length(note) <= 500),
  status text not null default 'paid' check (status in ('paid', 'reversed')),
  reversed_reason text check (char_length(reversed_reason) <= 500),
  recorded_by uuid references auth.users on delete set null,
  reversed_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index seller_payouts_seller on seller_payouts (seller_id, paid_on desc);

create table seller_ledger (
  id bigint generated always as identity primary key,
  seller_id uuid not null references sellers,
  kind text not null check (kind in ('sale', 'commission', 'refund', 'commission_refund', 'adjustment', 'payout', 'payout_reversal')),
  sub_order_id uuid references sub_orders,
  refund_id uuid references refunds,
  payout_id uuid references seller_payouts,
  currency char(3) not null,                 -- the order's currency (SAR for adjustments and payouts)
  amount_minor int not null check (amount_minor <> 0),
  amount_sar_minor int not null,             -- in SAR at the order's checkout rate: what statements add up
  booked_on date not null default ((now() at time zone 'Asia/Riyadh')::date),
  month date generated always as ((date_trunc('month', booked_on::timestamp))::date) stored,
  available_on date not null,                -- counts towards what can be paid out from this day
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (case kind when 'sale' then amount_minor > 0 when 'commission' then amount_minor < 0 when 'refund' then amount_minor < 0
                   when 'commission_refund' then amount_minor > 0 when 'payout' then amount_minor < 0 when 'payout_reversal' then amount_minor > 0
                   else true end),
  check (kind not in ('sale', 'commission', 'refund', 'commission_refund') or sub_order_id is not null),
  check (kind not in ('refund', 'commission_refund') or refund_id is not null),
  check (kind not in ('payout', 'payout_reversal') or payout_id is not null)
);
create unique index seller_ledger_sale on seller_ledger (sub_order_id, kind) where kind in ('sale', 'commission');
create unique index seller_ledger_refund on seller_ledger (refund_id, sub_order_id, kind) where refund_id is not null;
create unique index seller_ledger_payout on seller_ledger (payout_id, kind) where payout_id is not null;
create index seller_ledger_seller on seller_ledger (seller_id, booked_on, id);

-- ================================================================ reviews
create table product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  seller_id uuid references sellers on delete cascade,                 -- null: our own products
  order_item_id uuid not null unique references order_items on delete cascade,   -- one review per item bought
  user_id uuid not null references auth.users on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),   -- a first name and an initial
  rating int not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 2000),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  photos uuid[] not null default '{}' check (cardinality(photos) <= 3),       -- review photos, screened at upload
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 3),   -- public copies, made when published
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'hidden')),
  flags text[] not null default '{}',                                  -- what the checks found
  moderation_note text check (char_length(moderation_note) <= 500),    -- our team's note, shown to the author
  moderated_by uuid references auth.users on delete set null,
  moderated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_reviews_product on product_reviews (product_id, status, published_at desc);
create index product_reviews_seller on product_reviews (seller_id, status, created_at desc);
create index product_reviews_queue on product_reviews (created_at) where status = 'pending';

create table review_replies (
  review_id uuid primary key references product_reviews on delete cascade,
  seller_id uuid references sellers on delete cascade,                 -- null: Al Mukarramah answers for its own products
  author_id uuid references auth.users on delete set null,
  body text not null check (char_length(body) between 2 and 1500),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'hidden')),
  flags text[] not null default '{}',
  moderation_note text check (char_length(moderation_note) <= 500),    -- shown to the seller
  moderated_by uuid references auth.users on delete set null,
  moderated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_replies_queue on review_replies (created_at) where status = 'pending';

-- ================================================================ messages
create table message_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,       -- the customer
  seller_id uuid references sellers on delete cascade,                 -- null: a conversation with Al Mukarramah
  product_id uuid references products on delete set null,              -- a question before buying
  sub_order_id uuid references sub_orders on delete set null,          -- about an order
  return_id uuid references return_requests on delete set null,        -- about a return
  subject text not null check (char_length(subject) between 2 and 140),
  status text not null default 'open' check (status in ('open', 'closed')),
  flagged boolean not null default false,            -- someone asked to deal outside Al Mukarramah: our team looks
  last_message_at timestamptz,
  last_sender text check (last_sender in ('customer', 'seller', 'staff', 'system')),
  customer_read_at timestamptz,
  seller_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index message_threads_return on message_threads (return_id) where return_id is not null;
create unique index message_threads_sub_order on message_threads (user_id, sub_order_id) where sub_order_id is not null and return_id is null;
create unique index message_threads_product on message_threads (user_id, product_id) where product_id is not null and sub_order_id is null and return_id is null;
create index message_threads_seller on message_threads (seller_id, last_message_at desc);
create index message_threads_user on message_threads (user_id, last_message_at desc);
create index message_threads_flagged on message_threads (last_message_at desc) where flagged;

create table messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references message_threads on delete cascade,
  sender text not null check (sender in ('customer', 'seller', 'staff', 'system')),
  sender_id uuid references auth.users on delete set null,
  body text not null check (char_length(body) between 1 and 2000),     -- contact details already masked
  masked int not null default 0 check (masked >= 0),                   -- how many details were masked
  flags text[] not null default '{}',                                  -- the kinds found (staff only)
  created_at timestamptz not null default now()
);
create index messages_thread on messages (thread_id, id);
create index messages_sender on messages (sender_id, created_at desc);

-- ================================================================ who reads what
alter table notification_templates enable row level security;
alter table notification_outbox enable row level security;
alter table return_requests enable row level security;
alter table return_lines enable row level security;
alter table refunds enable row level security;
alter table refund_lines enable row level security;
alter table seller_payouts enable row level security;
alter table seller_ledger enable row level security;
alter table product_reviews enable row level security;
alter table review_replies enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;

create policy "staff read templates" on notification_templates for select using (private.is_staff());
create policy "owner and manager edit templates" on notification_templates for update
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "recipients read in-app notifications, staff read the outbox" on notification_outbox for select using (
  (channel = 'in_app' and status <> 'cancelled' and send_after <= now()
   and (user_id = auth.uid() or (seller_id is not null and private.is_seller_member(seller_id))
        or (staff_roles is not null and private.is_staff(staff_roles))))
  or private.is_staff(array['owner', 'manager', 'support', 'operations']::staff_role[]));

create policy "customers, sellers and staff read returns" on return_requests for select using (
  user_id = auth.uid() or (seller_id is not null and private.is_seller_member(seller_id))
  or private.is_staff(array['owner', 'manager', 'support', 'operations', 'finance']::staff_role[]));
create policy "read the lines of returns you can see" on return_lines for select using (
  exists (select 1 from return_requests r where r.id = return_id));

create policy "customers and staff read refunds" on refunds for select using (
  private.is_staff(array['owner', 'manager', 'finance', 'support']::staff_role[])
  or exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "customers, sellers and staff read refund lines" on refund_lines for select using (
  private.is_staff(array['owner', 'manager', 'finance', 'support']::staff_role[])
  or exists (select 1 from refunds f join orders o on o.id = f.order_id where f.id = refund_id and o.user_id = auth.uid())
  or exists (select 1 from sub_orders s where s.id = sub_order_id and s.seller_id is not null and private.is_seller_member(s.seller_id)));

create policy "sellers and finance read payouts" on seller_payouts for select using (
  private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'finance']::staff_role[]));
create policy "sellers and finance read the ledger" on seller_ledger for select using (
  private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'finance']::staff_role[]));

create policy "authors, sellers and staff read reviews" on product_reviews for select using (
  user_id = auth.uid()
  or (status = 'published' and seller_id is not null and private.is_seller_member(seller_id))
  or private.is_staff(array['owner', 'manager', 'marketing', 'support']::staff_role[]));
-- (who wrote a review is not readable through the API, so the reply policy asks a definer function)
create or replace function private.review_author(p_review uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from product_reviews where id = p_review;
$$;
create policy "sellers, authors and staff read replies" on review_replies for select using (
  (seller_id is not null and private.is_seller_member(seller_id))
  or (status = 'published' and private.review_author(review_id) = auth.uid())
  or private.is_staff(array['owner', 'manager', 'marketing', 'support']::staff_role[]));

create policy "participants and staff read conversations" on message_threads for select using (
  user_id = auth.uid() or (seller_id is not null and private.is_seller_member(seller_id))
  or private.is_staff(array['owner', 'manager', 'support', 'operations']::staff_role[]));
create policy "participants and staff read messages" on messages for select using (
  exists (select 1 from message_threads t where t.id = thread_id));

-- What the API may read: the people behind a review or a conversation stay private; refunds keep their internals.
revoke all on notification_templates, notification_outbox, return_requests, return_lines, refunds, refund_lines, seller_payouts,
  seller_ledger, product_reviews, review_replies, message_threads, messages from anon;
revoke select on refunds, product_reviews, message_threads, messages from authenticated;
grant select (id, order_id, return_id, status, currency, amount_minor, items_minor, shipping_minor, duties_minor, platform_minor, reason,
  restock, credit_note_id, credit_note_status, created_at, completed_at) on refunds to authenticated;
grant select (id, product_id, seller_id, order_item_id, author_name, rating, title, body, lang, photos, photo_urls, status, moderation_note,
  published_at, created_at, updated_at) on product_reviews to authenticated;
grant select (id, seller_id, product_id, sub_order_id, return_id, subject, status, last_message_at, last_sender, customer_read_at,
  seller_read_at, created_at, updated_at) on message_threads to authenticated;
grant select (id, thread_id, sender, body, masked, created_at) on messages to authenticated;
-- Nothing is written through the API: every change goes through the functions below.
revoke insert, update, delete on notification_outbox, return_requests, return_lines, refunds, refund_lines, seller_payouts, seller_ledger,
  product_reviews, review_replies, message_threads, messages from authenticated;
revoke insert, delete on notification_templates from authenticated;

-- ================================================================ never edited
create or replace function private.immutable_row() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '%', coalesce(tg_argv[0], 'These records are never edited or deleted');
end $$;
create trigger seller_ledger_immutable before update or delete on seller_ledger for each row
  execute function private.immutable_row('Statement entries are never edited or deleted; record an adjustment instead');
create trigger messages_immutable before update or delete on messages for each row
  execute function private.immutable_row('Messages are never edited or deleted');
create trigger refund_lines_immutable before update or delete on refund_lines for each row
  execute function private.immutable_row('Refund lines are never edited or deleted');
create trigger return_lines_immutable before update on return_lines for each row
  execute function private.immutable_row('Return lines are never edited');

create or replace function private.refunds_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Refunds are never deleted'; end if;
  if (new.order_id, new.return_id, new.currency, new.amount_minor, new.items_minor, new.shipping_minor, new.duties_minor, new.platform_minor,
      new.reason, new.restock, new.idempotency_key, new.created_by, new.created_at)
     is distinct from (old.order_id, old.return_id, old.currency, old.amount_minor, old.items_minor, old.shipping_minor, old.duties_minor,
      old.platform_minor, old.reason, old.restock, old.idempotency_key, old.created_by, old.created_at) then
    raise exception 'A refund''s amounts never change';
  end if;
  if new.status is distinct from old.status and old.status <> 'processing' then raise exception 'This refund is already %', old.status; end if;
  if old.credit_note_id is not null and new.credit_note_id is distinct from old.credit_note_id then raise exception 'The credit note is already attached'; end if;
  return new;
end $$;
create trigger refunds_guard before update or delete on refunds for each row execute function private.refunds_guard();

create or replace function private.payouts_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Payouts are never deleted; reverse one instead'; end if;
  if (new.seller_id, new.amount_sar_minor, new.method, new.iban_last4, new.reference, new.paid_on, new.note, new.recorded_by, new.created_at)
     is distinct from (old.seller_id, old.amount_sar_minor, old.method, old.iban_last4, old.reference, old.paid_on, old.note, old.recorded_by, old.created_at)
     or old.status = 'reversed' then
    raise exception 'A recorded payout never changes; reverse it if the transfer came back';
  end if;
  return new;
end $$;
create trigger seller_payouts_guard before update or delete on seller_payouts for each row execute function private.payouts_guard();

create or replace function private.templates_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.key is distinct from old.key or new.audience is distinct from old.audience or new.purpose is distinct from old.purpose then
    raise exception 'Only the wording, channels and active flag of a template can change';
  end if;
  return new;
end $$;
create trigger notification_templates_guard before update on notification_templates for each row execute function private.templates_guard();

create trigger notification_templates_touch before update on notification_templates for each row execute function mp_touch();
create trigger return_requests_touch before update on return_requests for each row execute function mp_touch();
create trigger product_reviews_touch before update on product_reviews for each row execute function mp_touch();
create trigger review_replies_touch before update on review_replies for each row execute function mp_touch();
create trigger message_threads_touch before update on message_threads for each row execute function mp_touch();

create trigger audit_notification_templates after insert or update or delete on notification_templates for each row execute function audit_keyed('key');
create trigger audit_return_requests after insert or update or delete on return_requests for each row execute function audit_trigger();
create trigger audit_return_lines after insert or update or delete on return_lines for each row execute function audit_keyed('return_id', 'order_item_id');
create trigger audit_refunds after insert or update or delete on refunds for each row execute function audit_trigger();
create trigger audit_refund_lines after insert on refund_lines for each row execute function audit_trigger();
create trigger audit_seller_payouts after insert or update or delete on seller_payouts for each row execute function audit_trigger();
create trigger audit_seller_ledger after insert on seller_ledger for each row execute function audit_trigger();
create trigger audit_product_reviews after insert or update or delete on product_reviews for each row execute function audit_trigger();
create trigger audit_review_replies after insert or update or delete on review_replies for each row execute function audit_keyed('review_id');
create trigger audit_message_threads after insert or update or delete on message_threads for each row execute function audit_trigger();

-- ================================================================ helpers
create or replace function private.riyadh_today() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Riyadh')::date;
$$;

-- units of the order's currency per SAR, as used at checkout (older orders: today's rate)
create or replace function private.order_fx(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(o.fx_per_sar, case when o.currency = 'SAR' then 1 end, (select f.per_sar from fx_rates f where f.currency = o.currency), 1)::numeric
  from orders o where o.id = p_order;
$$;
create or replace function private.to_sar(p_minor bigint, p_fx numeric) returns int language sql immutable as $$
  select round(p_minor / coalesce(nullif(p_fx, 0), 1))::int;
$$;

create or replace function private.user_staff_role(p_user uuid) returns staff_role
language sql stable security definer set search_path = public as $$
  select role from staff_members where user_id = p_user;
$$;
create or replace function private.user_is_member(p_seller uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_seller is not null and p_user is not null and exists (select 1 from seller_members where seller_id = p_seller and user_id = p_user);
$$;
-- Staff (with one of the roles), or a server-side caller: a function using the service role, or a direct database
-- session (Claude's connector, a scheduled job). A request through the API always logs in as "authenticator", so an
-- API request without a role claim is never the server (review L3).
create or replace function private.is_staff_or_server(p_roles staff_role[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_staff(p_roles) or coalesce(auth.role(), '') = 'service_role'
      or (auth.role() is null and session_user not in ('authenticator', 'anon', 'authenticated', 'service_role'));
$$;

-- English and Arabic of one thing, for templates
create or replace function private.bi(p_en text, p_ar text) returns jsonb language sql immutable as $$
  select jsonb_build_object('en', coalesce(p_en, ''), 'ar', coalesce(nullif(p_ar, ''), p_en, ''));
$$;
create or replace function private.money_text(p_minor bigint, p_currency text) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'en', p_currency || ' ' || to_char(p_minor / 100.0, 'FM999,999,999,990.00'),
    'ar', to_char(p_minor / 100.0, 'FM999,999,999,990.00') || ' ' || case p_currency when 'SAR' then 'ر.س' when 'AED' then 'د.إ' else p_currency end);
$$;
-- "Maryam H." from "Maryam Al Harbi"; Arabic names give the first name only
create or replace function private.public_name(p_full text) returns text language sql immutable as $$
  select case when w is null or cardinality(w) = 0 then null
              when cardinality(w) = 1 then left(w[1], 30)
              when w[cardinality(w)] ~ '^[A-Za-z]' then left(w[1], 30) || ' ' || upper(left(w[cardinality(w)], 1)) || '.'
              else left(w[1], 30) end
  from (select regexp_split_to_array(nullif(trim(p_full), ''), '\s+') as w) x;
$$;
create or replace function private.return_reason(p text) returns jsonb language sql immutable as $$
  select case p
    when 'changed_mind' then private.bi('changed their mind', 'غيّر رأيه')
    when 'not_as_described' then private.bi('not as described', 'غير مطابق للوصف')
    when 'faulty' then private.bi('faulty', 'معيب')
    when 'damaged' then private.bi('arrived damaged', 'وصل تالفًا')
    when 'wrong_item' then private.bi('wrong item sent', 'أُرسل منتج خاطئ')
    when 'missing_item' then private.bi('item missing from the parcel', 'منتج ناقص من الطرد')
    when 'not_received' then private.bi('parcel not received', 'لم يصل الطرد')
    else private.bi(p, p) end;
$$;
create or replace function private.seller_label(p_seller uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select private.bi(s.name_en, s.name_ar) from sellers s where s.id = p_seller and s.kind = 'marketplace'),
                  private.bi('Al Mukarramah', 'المكرمة'));
$$;

-- ================================================================ notifications: queue (never sent from here)
-- {{name}} placeholders; a value may be text or {"en": ..., "ar": ...}
create or replace function private.render(p_text text, p_vars jsonb, p_lang text) returns text language plpgsql immutable as $$
declare
  k text;
  v jsonb;
  out text := p_text;
begin
  if out is null then return null; end if;
  for k, v in select key, value from jsonb_each(coalesce(p_vars, '{}')) loop
    out := replace(out, '{{' || k || '}}', coalesce(case jsonb_typeof(v) when 'object' then v ->> p_lang when 'string' then v #>> '{}'
                                                                         when 'null' then '' else v::text end, ''));
  end loop;
  return regexp_replace(out, '\{\{[a-z0-9_]+\}\}', '', 'g');
end $$;

-- p_to: {"user_id"} and/or {"order_id"} for a customer (a guest order: email only), {"seller_id"}, {"staff_roles": [...]}
create or replace function private.notify(p_key text, p_to jsonb, p_vars jsonb, p_dedupe text default null, p_send_after timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare
  t notification_templates;
  ch text;
  v_user uuid := nullif(p_to ->> 'user_id', '')::uuid;
  v_seller uuid := nullif(p_to ->> 'seller_id', '')::uuid;
  v_order uuid := nullif(p_to ->> 'order_id', '')::uuid;
  v_roles staff_role[];
  v_lang text;
  n int := 0;
begin
  select * into t from notification_templates where key = p_key and active;
  if t.key is null then return 0; end if;
  if t.audience = 'customer' and v_user is null and v_order is null then return 0; end if;
  if t.audience = 'seller' and v_seller is null then return 0; end if;
  if t.audience = 'staff' then
    v_roles := coalesce(case when jsonb_typeof(p_to -> 'staff_roles') = 'array' then array(select jsonb_array_elements_text(p_to -> 'staff_roles'))::staff_role[] end,
                        array['owner', 'manager', 'support']::staff_role[]);
  end if;
  v_lang := case t.audience
    when 'customer' then coalesce((select language from profiles where id = v_user), 'ar')
    when 'seller' then coalesce((select p.language from seller_members m join profiles p on p.id = m.user_id where m.seller_id = v_seller
                                 order by (m.role = 'owner') desc, m.created_at limit 1), 'ar')
    else 'en' end;
  foreach ch in array t.channels loop
    -- a guest has no account to show it in or push it to: email only
    if t.audience = 'customer' and v_user is null and ch <> 'email' then continue; end if;
    insert into notification_outbox (template_key, channel, audience, user_id, seller_id, staff_roles, order_id, lang,
                                     subject_en, subject_ar, body_en, body_ar, link, payload, dedupe_key, send_after)
    values (t.key, ch, t.audience, case when t.audience = 'customer' then v_user end, case when t.audience = 'seller' then v_seller end,
            v_roles, case when t.audience = 'customer' then v_order end, v_lang,
            private.render(t.subject_en, p_vars, 'en'), private.render(t.subject_ar, p_vars, 'ar'),
            private.render(t.body_en, p_vars, 'en'), private.render(t.body_ar, p_vars, 'ar'),
            private.render(t.link, p_vars, 'en'), coalesce(p_vars, '{}'), p_dedupe, coalesce(p_send_after, now()))
    on conflict (dedupe_key, channel) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function private.notify(text, jsonb, jsonb, text, timestamptz) from public, anon, authenticated;

-- ================================================================ the ledger
create or replace function private.return_open(p_status text, p_declined_at timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select p_status in ('requested', 'accepted', 'escalated', 'approved')
      or (p_status = 'declined' and p_declined_at > now() - make_interval(days => (select dispute_window_days from mp_settings where id = 1)));
$$;

-- The balance, and what can be paid out now: sales (with their commission) past their hold with no open return on the
-- parcel; anything else owed back (refunds, payouts, adjustments) counts at once.
create or replace function private.ledger_available(p_seller uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with e as (
    select l.amount_sar_minor, l.available_on,
           ((l.amount_sar_minor < 0 and l.kind <> 'commission') or (l.available_on <= private.riyadh_today()
             and not exists (select 1 from return_requests r where r.sub_order_id = l.sub_order_id and private.return_open(r.status, r.declined_at)))) as free
    from seller_ledger l where l.seller_id = p_seller)
  select jsonb_build_object(
    'balance_sar_minor', coalesce(sum(amount_sar_minor), 0),
    'available_sar_minor', greatest(0, coalesce(sum(amount_sar_minor) filter (where free), 0)),
    'held_sar_minor', coalesce(sum(amount_sar_minor) filter (where not free), 0),
    'next_available_on', min(available_on) filter (where not free and amount_sar_minor > 0))
  from e;
$$;

-- refunds on a seller's parcel come off their statement (once its sale is booked)
create or replace function private.book_refund(p_refund uuid, p_sub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f refunds;
  s sub_orders;
  fx numeric;
  v_items int;
  v_comm int;
  v_num text;
begin
  select * into f from refunds where id = p_refund;
  select * into s from sub_orders where id = p_sub;
  if f.status is distinct from 'succeeded' or s.seller_id is null then return; end if;
  if not exists (select 1 from seller_ledger where sub_order_id = s.id and kind = 'sale') then return; end if;
  select coalesce(sum(amount_minor), 0), coalesce(sum(commission_minor), 0) into v_items, v_comm
  from refund_lines where refund_id = f.id and sub_order_id = s.id and kind = 'item';
  if v_items <= 0 then return; end if;
  fx := private.order_fx(s.order_id);
  select format('AM-%s-%s', o.number, s.seq) into v_num from orders o where o.id = s.order_id;
  insert into seller_ledger (seller_id, kind, sub_order_id, refund_id, currency, amount_minor, amount_sar_minor, available_on, note)
  values (s.seller_id, 'refund', s.id, f.id, s.currency, -v_items, -private.to_sar(v_items, fx), private.riyadh_today(), left(v_num || ': ' || f.reason, 500))
  on conflict do nothing;
  if v_comm > 0 then
    insert into seller_ledger (seller_id, kind, sub_order_id, refund_id, currency, amount_minor, amount_sar_minor, available_on, note)
    values (s.seller_id, 'commission_refund', s.id, f.id, s.currency, v_comm, private.to_sar(v_comm, fx), private.riyadh_today(), v_num)
    on conflict do nothing;
  end if;
end $$;

-- a delivered parcel: the sale and our commission, payable after the problem window (or a longer return window) and the hold
create or replace function private.book_sale(p_sub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s sub_orders;
  fx numeric;
  v_days int;
  v_hold int;
  v_claim int;
  v_on date;
  v_avail date;
  v_num text;
  r record;
begin
  select * into s from sub_orders where id = p_sub;
  if s.seller_id is null or s.delivered_at is null or s.items_minor <= 0 then return; end if;
  -- partners (our private-label and fulfilment partners): what they are owed (a fulfilment fee or a cost price) is not
  -- decided yet, so nothing is booked as payable to them until it is (review M5; DECISIONS.md, Needs Afzal)
  if s.kind = 'partner' or exists (select 1 from sellers x where x.id = s.seller_id and x.kind = 'partner') then return; end if;
  if exists (select 1 from seller_ledger where sub_order_id = s.id and kind = 'sale') then return; end if;
  fx := private.order_fx(s.order_id);
  select coalesce(max(return_window_days), 0) into v_days from order_items where sub_order_id = s.id;
  select payout_hold_days, faulty_claim_days into v_hold, v_claim from mp_settings where id = 1;
  v_on := (s.delivered_at at time zone 'Asia/Riyadh')::date;
  -- payable once a problem can no longer be reported, not just after the return window (review L4)
  v_avail := v_on + greatest(v_days, coalesce(v_claim, 30)) + coalesce(v_hold, 3);
  select format('AM-%s-%s', o.number, s.seq) into v_num from orders o where o.id = s.order_id;
  insert into seller_ledger (seller_id, kind, sub_order_id, currency, amount_minor, amount_sar_minor, booked_on, available_on, note)
  values (s.seller_id, 'sale', s.id, s.currency, s.items_minor, private.to_sar(s.items_minor, fx), v_on, v_avail, v_num)
  on conflict do nothing;
  if s.commission_minor > 0 then
    insert into seller_ledger (seller_id, kind, sub_order_id, currency, amount_minor, amount_sar_minor, booked_on, available_on, note)
    values (s.seller_id, 'commission', s.id, s.currency, -s.commission_minor, -private.to_sar(s.commission_minor, fx), v_on, v_avail, v_num)
    on conflict do nothing;
  end if;
  -- refunds made before delivery (an item missing from the parcel, say) come off now
  for r in select distinct rl.refund_id from refund_lines rl join refunds f on f.id = rl.refund_id
           where rl.sub_order_id = s.id and rl.kind = 'item' and f.status = 'succeeded' loop
    perform private.book_refund(r.refund_id, s.id);
  end loop;
end $$;

-- Monthly statements (security invoker: each reader sees only the sellers they may see)
create view seller_statement_months with (security_invoker = true) as
select seller_id, month,
  coalesce(sum(amount_sar_minor) filter (where kind = 'sale'), 0)::int as sales_sar_minor,
  coalesce(sum(amount_sar_minor) filter (where kind = 'commission'), 0)::int as commission_sar_minor,
  coalesce(sum(amount_sar_minor) filter (where kind in ('refund', 'commission_refund')), 0)::int as refunds_sar_minor,
  coalesce(sum(amount_sar_minor) filter (where kind = 'adjustment'), 0)::int as adjustments_sar_minor,
  coalesce(sum(amount_sar_minor) filter (where kind in ('payout', 'payout_reversal')), 0)::int as payouts_sar_minor,
  sum(amount_sar_minor)::int as net_sar_minor,
  (sum(sum(amount_sar_minor)) over (partition by seller_id order by month) - sum(amount_sar_minor))::int as opening_sar_minor,
  (sum(sum(amount_sar_minor)) over (partition by seller_id order by month))::int as closing_sar_minor,
  (count(*) filter (where kind = 'sale'))::int as orders
from seller_ledger group by seller_id, month;
revoke all on seller_statement_months from anon, authenticated;
grant select on seller_statement_months to authenticated;

create or replace function seller_balance(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (private.is_seller_member(p_seller) or private.is_staff_or_server(array['owner', 'manager', 'finance']::staff_role[])) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return private.ledger_available(p_seller) || jsonb_build_object(
    'currency', 'SAR',
    'last_payout', (select jsonb_build_object('amount_sar_minor', amount_sar_minor, 'paid_on', paid_on, 'reference', reference)
                    from seller_payouts where seller_id = p_seller and status = 'paid' order by paid_on desc, created_at desc limit 1),
    'iban_last4', (select nullif(right(upper(regexp_replace(coalesce(iban, ''), '\s', '', 'g')), 4), '') from seller_private where seller_id = p_seller));
end $$;

-- One month's statement: opening balance, what came in and went out, the entries and payouts, the closing balance.
create or replace function seller_statement(p_seller uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m date := date_trunc('month', coalesce(p_month, private.riyadh_today())::timestamp)::date;
  v_open int;
  v_net int;
begin
  if not (private.is_seller_member(p_seller) or private.is_staff_or_server(array['owner', 'manager', 'finance']::staff_role[])) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select coalesce(sum(amount_sar_minor), 0) into v_open from seller_ledger where seller_id = p_seller and month < m;
  select coalesce(sum(amount_sar_minor), 0) into v_net from seller_ledger where seller_id = p_seller and month = m;
  return jsonb_build_object(
    'seller', (select jsonb_build_object('id', x.id, 'name_en', x.name_en, 'name_ar', x.name_ar, 'country', x.country) from sellers x where x.id = p_seller),
    'month', m, 'currency', 'SAR',
    'opening_sar_minor', v_open, 'closing_sar_minor', v_open + v_net,
    'totals', (select jsonb_build_object(
        'sales', coalesce(sum(amount_sar_minor) filter (where kind = 'sale'), 0),
        'commission', coalesce(sum(amount_sar_minor) filter (where kind = 'commission'), 0),
        'refunds', coalesce(sum(amount_sar_minor) filter (where kind in ('refund', 'commission_refund')), 0),
        'adjustments', coalesce(sum(amount_sar_minor) filter (where kind = 'adjustment'), 0),
        'payouts', coalesce(sum(amount_sar_minor) filter (where kind in ('payout', 'payout_reversal')), 0),
        'net', coalesce(sum(amount_sar_minor), 0),
        'orders', count(*) filter (where kind = 'sale'))
      from seller_ledger where seller_id = p_seller and month = m),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'booked_on', l.booked_on, 'available_on', l.available_on, 'currency', l.currency,
        'amount_minor', l.amount_minor, 'amount_sar_minor', l.amount_sar_minor, 'note', l.note,
        'items_en', case when l.kind = 'sale' then (select string_agg(i.quantity || ' × ' || i.name_en, ', ' order by i.name_en) from order_items i where i.sub_order_id = l.sub_order_id) end,
        'items_ar', case when l.kind = 'sale' then (select string_agg(i.quantity || ' × ' || i.name_ar, '، ' order by i.name_en) from order_items i where i.sub_order_id = l.sub_order_id) end)
      order by l.booked_on, l.id), '[]'::jsonb) from seller_ledger l where l.seller_id = p_seller and l.month = m),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount_sar_minor', p.amount_sar_minor, 'paid_on', p.paid_on,
        'reference', p.reference, 'iban_last4', p.iban_last4, 'status', p.status) order by p.paid_on, p.created_at), '[]'::jsonb)
      from seller_payouts p where p.seller_id = p_seller and date_trunc('month', p.paid_on::timestamp)::date = m),
    'months', (select coalesce(jsonb_agg(x.month order by x.month desc), '[]'::jsonb) from (select distinct month from seller_ledger where seller_id = p_seller) x),
    'balance', private.ledger_available(p_seller));
end $$;

-- Our finance team records a bank transfer it has made (nothing is paid from here).
create or replace function mp_record_payout(p_seller uuid, p_amount_sar int, p_reference text, p_paid_on date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ref text := nullif(left(trim(coalesce(p_reference, '')), 100), '');
  v_avail int;
  v_iban text;
  sp seller_private;
  st mp_settings;
  pid uuid;
begin
  if not private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into st from mp_settings where id = 1;
  if not st.payouts_enabled then
    raise exception 'Payouts are not switched on yet: the VAT treatment of sellers'' payouts must be settled with the adviser first (DECISIONS.md, Needs Afzal)';
  end if;
  if p_amount_sar is null or p_amount_sar <= 0 then raise exception 'Enter the amount paid'; end if;
  if v_ref is null or char_length(v_ref) < 3 then raise exception 'Enter the bank transfer reference'; end if;
  if p_paid_on is null or p_paid_on > private.riyadh_today() or p_paid_on < private.riyadh_today() - 31 then
    raise exception 'Enter the date the transfer was made (within the last 31 days)';
  end if;
  perform 1 from sellers where id = p_seller for update;      -- one payout at a time for a seller
  if not found then raise exception 'Seller not found'; end if;
  -- the bank details we pay to must be checked: KYC approved, and a hold after any change (review M12)
  select * into sp from seller_private where seller_id = p_seller;
  if coalesce(sp.kyc_status, '') <> 'approved' then
    raise exception 'The seller''s KYC is not approved (their bank details may have changed): review it before paying';
  end if;
  if sp.bank_changed_at is not null and sp.bank_changed_at > now() - make_interval(days => st.payout_bank_hold_days) then
    raise exception 'The seller''s bank details changed on %: payouts wait % days after a change. Confirm the new details with the seller by phone first.',
      to_char(sp.bank_changed_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD'), st.payout_bank_hold_days;
  end if;
  v_avail := (private.ledger_available(p_seller) ->> 'available_sar_minor')::int;
  if p_amount_sar > v_avail then raise exception 'Only % halalas can be paid out now', v_avail; end if;
  v_iban := nullif(right(upper(regexp_replace(coalesce(sp.iban, ''), '\s', '', 'g')), 4), '');
  insert into seller_payouts (seller_id, amount_sar_minor, iban_last4, reference, paid_on, note, recorded_by)
  values (p_seller, p_amount_sar, v_iban, v_ref, p_paid_on, nullif(left(trim(coalesce(p_note, '')), 500), ''), auth.uid())
  returning id into pid;
  -- booked on the day it is recorded, so a statement month already closed never changes (review L10); the transfer's
  -- own date stays on the payout
  insert into seller_ledger (seller_id, kind, payout_id, currency, amount_minor, amount_sar_minor, booked_on, available_on, note, created_by)
  values (p_seller, 'payout', pid, 'SAR', -p_amount_sar, -p_amount_sar, private.riyadh_today(), private.riyadh_today(),
          format('Bank transfer %s (paid %s)', v_ref, p_paid_on), auth.uid());
  perform private.notify('seller_payout_recorded', jsonb_build_object('seller_id', p_seller),
    jsonb_build_object('amount', private.money_text(p_amount_sar, 'SAR'), 'iban4', coalesce(v_iban, '····'), 'date', p_paid_on::text, 'reference', v_ref),
    'payout:' || pid);
  return jsonb_build_object('id', pid) || private.ledger_available(p_seller);
end $$;

-- The transfer came back: the amount is owed to the seller again.
create or replace function mp_reverse_payout(p_payout uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p seller_payouts;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if not private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Give the reason'; end if;
  select * into p from seller_payouts where id = p_payout for update;
  if p.id is null then raise exception 'Payout not found'; end if;
  if p.status <> 'paid' then raise exception 'This payout is already %', p.status; end if;
  update seller_payouts set status = 'reversed', reversed_reason = v_reason, reversed_by = auth.uid(), reversed_at = now() where id = p.id;
  insert into seller_ledger (seller_id, kind, payout_id, currency, amount_minor, amount_sar_minor, available_on, note, created_by)
  values (p.seller_id, 'payout_reversal', p.id, 'SAR', p.amount_sar_minor, p.amount_sar_minor, private.riyadh_today(), left('Returned: ' || v_reason, 500), auth.uid());
  return private.ledger_available(p.seller_id);
end $$;

-- A correction (always with a reason; never an edit of an entry).
create or replace function mp_ledger_adjust(p_seller uuid, p_amount_sar int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if not private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if p_amount_sar is null or p_amount_sar = 0 then raise exception 'Enter the amount'; end if;
  if v_note is null or char_length(v_note) < 5 then raise exception 'Give the reason for the adjustment'; end if;
  if not exists (select 1 from sellers where id = p_seller) then raise exception 'Seller not found'; end if;
  insert into seller_ledger (seller_id, kind, currency, amount_minor, amount_sar_minor, available_on, note, created_by)
  values (p_seller, 'adjustment', 'SAR', p_amount_sar, p_amount_sar, private.riyadh_today(), v_note, auth.uid());
  return private.ledger_available(p_seller);
end $$;

-- ================================================================ refunds (server only; refund-order calls these)
create or replace function private.refund_json(p_refund uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', f.id, 'order_id', f.order_id, 'order_number', o.number, 'return_id', f.return_id, 'status', f.status, 'currency', f.currency,
    'amount_minor', f.amount_minor, 'items_minor', f.items_minor, 'shipping_minor', f.shipping_minor, 'duties_minor', f.duties_minor,
    'platform_minor', f.platform_minor, 'reason', f.reason, 'restock', f.restock, 'payment_id', o.payment_id, 'error', f.error,
    'credit_note_status', f.credit_note_status, 'credit_note', (select i.number from invoices i where i.id = f.credit_note_id),
    'created_at', f.created_at, 'completed_at', f.completed_at, 'age_seconds', extract(epoch from now() - f.created_at)::int,
    'order_refunded_minor', o.refunded_minor, 'provider_ref', f.provider_ref,
    'invoice', (select jsonb_build_object('id', i.id, 'number', i.number, 'vat_rate_bp', i.vat_rate_bp, 'fx_per_sar', i.fx_per_sar)
                from invoices i where i.order_id = f.order_id and i.doc = 'invoice' order by i.icv limit 1),
    'order', jsonb_build_object('id', o.id, 'number', o.number, 'currency', o.currency, 'ship_to', o.ship_to),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'sub_order_id', l.sub_order_id, 'order_item_id', l.order_item_id,
               'quantity', l.quantity, 'amount_minor', l.amount_minor, 'commission_minor', l.commission_minor, 'vat_rate_bp', l.vat_rate_bp,
               'platform_invoiced', l.platform_invoiced, 'name_en', i.name_en, 'name_ar', i.name_ar, 'unit_price_minor', i.unit_price_minor) order by l.id), '[]'::jsonb)
              from refund_lines l left join order_items i on i.id = l.order_item_id where l.refund_id = f.id))
  from refunds f join orders o on o.id = f.order_id where f.id = p_refund;
$$;

-- Works out a refund and reserves it (status "processing") before Moyasar is asked. p: {key, reason, and one of
--   return_id (an approved return: its lines; the delivery too when the whole parcel comes back),
--   sub_order_id (a parcel: everything left on it, delivery and duties included; a seller's cancellation),
--   lines [{order_item_id, quantity}] with shipping [sub-order ids], order_shipping (older orders), duties [sub-order ids],
--   or nothing: everything left on the order}, restock.
create or replace function mp_prepare_refund(p_order uuid, p jsonb, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  f refunds;
  rr return_requests;
  v_key text := p ->> 'key';
  v_reason text := nullif(left(trim(coalesce(p ->> 'reason', '')), 500), '');
  v_mode text;
  v_sub uuid := nullif(p ->> 'sub_order_id', '')::uuid;
  v_restock boolean := coalesce((p ->> 'restock')::boolean, false);
  v_ship uuid[] := '{}';
  v_duty uuid[] := '{}';
  v_ship_order boolean := false;
  v_plan jsonb := '[]';
  l record;
  rq int; ra int; rc int; q int; amt int; comm int;
  t_items int := 0; t_ship int := 0; t_duty int := 0; t_platform int := 0;
  rid uuid;
  v_role text := coalesce(private.user_staff_role(p_user)::text, '');
  v_limit int;
begin
  if v_role not in ('owner', 'manager', 'finance', 'support') then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  perform private.act_as(p_user);
  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'A refund key is needed'; end if;
  select * into f from refunds where idempotency_key = v_key;
  if f.id is not null then
    if f.order_id <> p_order then raise exception 'Refund key reused for another order'; end if;
    return private.refund_json(f.id) || jsonb_build_object('duplicate', true);
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Give the reason for the refund'; end if;
  select * into o from orders where id = p_order for update;          -- one refund at a time on an order
  if o.id is null then raise exception 'Order not found' using detail = 'لم يُعثر على الطلب'; end if;
  if o.payment_id is null or o.status in ('pending_payment', 'cancelled') then raise exception 'Order not paid'; end if;
  if o.status = 'refunded' then raise exception 'Already refunded'; end if;
  -- one refund waiting for Moyasar per order: an answer that never came is reconciled first, never retried blind (H2)
  if exists (select 1 from refunds where order_id = o.id and status = 'processing') then
    raise exception 'A refund on this order is still being processed: check it with Moyasar (Reconcile) before starting another';
  end if;

  if nullif(p ->> 'return_id', '') is not null then
    select * into rr from return_requests where id = (p ->> 'return_id')::uuid and order_id = o.id for update;
    if rr.id is null then raise exception 'Return not found' using detail = 'لم يُعثر على طلب الإرجاع'; end if;
    -- a return is refunded once, whatever key a second press or a second person uses (H1)
    if exists (select 1 from refunds where return_id = rr.id and status in ('processing', 'succeeded')) then
      raise exception 'This return has already been refunded (or is being refunded): it is refunded only once';
    end if;
    if rr.status <> 'approved' then raise exception 'Approve the return before refunding it'; end if;
    v_mode := 'return';
    v_sub := rr.sub_order_id;
    v_restock := rr.restock and rr.kind = 'return';
  elsif v_sub is not null then
    if not exists (select 1 from sub_orders where id = v_sub and order_id = o.id) then raise exception 'That parcel is not in this order'; end if;
    v_mode := 'sub_order';
  elsif jsonb_typeof(p -> 'lines') = 'array' or jsonb_typeof(p -> 'shipping') = 'array' or jsonb_typeof(p -> 'duties') = 'array'
        or coalesce((p ->> 'order_shipping')::boolean, false) then
    v_mode := 'lines';
  else
    v_mode := 'full';
  end if;

  -- the items
  for l in
    select i.id, i.order_id, i.sub_order_id, i.quantity, i.line_total_minor, coalesce(i.commission_minor, 0) as commission_minor, i.vat_rate_bp,
           (i.sub_order_id is null or s.invoicer = 'platform') as platform, x.want
    from (
      select (e ->> 'order_item_id')::uuid as id, sum((e ->> 'quantity')::int)::int as want
      from jsonb_array_elements(case when v_mode = 'lines' and jsonb_typeof(p -> 'lines') = 'array' then p -> 'lines' else '[]'::jsonb end) e group by 1
      union all select rl.order_item_id, rl.quantity from return_lines rl where v_mode = 'return' and rl.return_id = rr.id
      union all select i2.id, null from order_items i2 where v_mode = 'sub_order' and i2.sub_order_id = v_sub
      union all select i2.id, null from order_items i2 where v_mode = 'full' and i2.order_id = o.id
    ) x join order_items i on i.id = x.id left join sub_orders s on s.id = i.sub_order_id
  loop
    if l.order_id <> o.id then raise exception 'That item is not in this order'; end if;
    select coalesce(sum(rl.quantity), 0), coalesce(sum(rl.amount_minor), 0), coalesce(sum(rl.commission_minor), 0) into rq, ra, rc
    from refund_lines rl join refunds rf on rf.id = rl.refund_id
    where rl.order_item_id = l.id and rl.kind = 'item' and rf.status in ('processing', 'succeeded');
    q := coalesce(l.want, l.quantity - rq);
    if l.want is null and q <= 0 then continue; end if;
    if q <= 0 or q > l.quantity - rq then raise exception 'Only % of that item can still be refunded', greatest(l.quantity - rq, 0); end if;
    if q = l.quantity - rq then
      amt := l.line_total_minor - ra;               -- the last of a line takes what is left (no rounding drift)
      comm := l.commission_minor - rc;
    else
      amt := round(l.line_total_minor::numeric * q / l.quantity)::int;
      comm := round(l.commission_minor::numeric * q / l.quantity)::int;
    end if;
    if amt <= 0 then continue; end if;
    v_plan := v_plan || jsonb_build_object('kind', 'item', 'sub_order_id', l.sub_order_id, 'order_item_id', l.id, 'quantity', q, 'amount_minor', amt,
                                           'commission_minor', greatest(comm, 0), 'vat_rate_bp', l.vat_rate_bp, 'platform_invoiced', l.platform);
    t_items := t_items + amt;
    if l.platform then t_platform := t_platform + amt; end if;
  end loop;

  -- delivery and duties
  if v_mode = 'full' then
    v_ship := array(select id from sub_orders where order_id = o.id);
    v_duty := v_ship;
    v_ship_order := not exists (select 1 from sub_orders where order_id = o.id);
  elsif v_mode = 'sub_order' then
    v_ship := array[v_sub];
    v_duty := array[v_sub];
  elsif v_mode = 'return' then
    -- the delivery comes back too when the whole parcel is returned
    if not exists (
      select 1 from order_items i where i.sub_order_id = v_sub
        and i.quantity > coalesce((select sum(rl.quantity) from refund_lines rl join refunds rf on rf.id = rl.refund_id
                                   where rl.order_item_id = i.id and rl.kind = 'item' and rf.status in ('processing', 'succeeded')), 0)
                       + coalesce((select sum((e ->> 'quantity')::int) from jsonb_array_elements(v_plan) e where (e ->> 'order_item_id')::uuid = i.id), 0)) then
      v_ship := array[v_sub];
    end if;
    if coalesce((p ->> 'duties')::boolean, false) then v_duty := array[v_sub]; end if;
  else
    v_ship := array(select x::uuid from jsonb_array_elements_text(case when jsonb_typeof(p -> 'shipping') = 'array' then p -> 'shipping' else '[]'::jsonb end) x);
    v_duty := array(select x::uuid from jsonb_array_elements_text(case when jsonb_typeof(p -> 'duties') = 'array' then p -> 'duties' else '[]'::jsonb end) x);
    v_ship_order := coalesce((p ->> 'order_shipping')::boolean, false) and not exists (select 1 from sub_orders where order_id = o.id);
    if exists (select 1 from unnest(v_ship || v_duty) x where not exists (select 1 from sub_orders s where s.id = x and s.order_id = o.id)) then
      raise exception 'That parcel is not in this order';
    end if;
  end if;
  for l in select s.id, s.shipping_minor, s.duties_minor, s.invoicer from sub_orders s where s.order_id = o.id and (s.id = any(v_ship) or s.id = any(v_duty)) loop
    if l.id = any(v_ship) then
      select coalesce(sum(rl.amount_minor), 0) into ra from refund_lines rl join refunds rf on rf.id = rl.refund_id
      where rl.sub_order_id = l.id and rl.kind = 'shipping' and rf.status in ('processing', 'succeeded');
      amt := l.shipping_minor - ra;
      if amt > 0 then
        v_plan := v_plan || jsonb_build_object('kind', 'shipping', 'sub_order_id', l.id, 'amount_minor', amt, 'platform_invoiced', l.invoicer = 'platform');
        t_ship := t_ship + amt;
        if l.invoicer = 'platform' then t_platform := t_platform + amt; end if;
      end if;
    end if;
    if l.id = any(v_duty) then
      select coalesce(sum(rl.amount_minor), 0) into ra from refund_lines rl join refunds rf on rf.id = rl.refund_id
      where rl.sub_order_id = l.id and rl.kind = 'duties' and rf.status in ('processing', 'succeeded');
      amt := l.duties_minor - ra;
      if amt > 0 then
        -- duties are collected for customs and are not on our invoice
        v_plan := v_plan || jsonb_build_object('kind', 'duties', 'sub_order_id', l.id, 'amount_minor', amt, 'platform_invoiced', false);
        t_duty := t_duty + amt;
      end if;
    end if;
  end loop;
  if v_ship_order then
    select coalesce(sum(rl.amount_minor), 0) into ra from refund_lines rl join refunds rf on rf.id = rl.refund_id
    where rf.order_id = o.id and rl.sub_order_id is null and rl.kind = 'shipping' and rf.status in ('processing', 'succeeded');
    amt := o.shipping_minor - ra;
    if amt > 0 then
      v_plan := v_plan || jsonb_build_object('kind', 'shipping', 'sub_order_id', null, 'amount_minor', amt, 'platform_invoiced', true);
      t_ship := t_ship + amt;
      t_platform := t_platform + amt;
    end if;
  end if;

  if t_items + t_ship + t_duty <= 0 then raise exception 'Nothing left to refund'; end if;
  if t_items + t_ship + t_duty > o.total_minor - coalesce((select sum(amount_minor) from refunds where order_id = o.id and status in ('processing', 'succeeded')), 0) then
    raise exception 'The refund is more than what is left of the payment';
  end if;
  if t_platform > 0 and not exists (select 1 from invoices where order_id = o.id and doc = 'invoice') then
    raise exception 'The tax invoice for this order has not been issued yet: run "Finish pending work" (or wait for it), so the refund can have its credit note';
  end if;
  -- support refunds only up to its limit; above it, finance, a manager or the owner (decision 54; Needs Afzal)
  if v_role = 'support' then
    select support_refund_limit_minor into v_limit from mp_settings where id = 1;
    if private.to_sar(t_items + t_ship + t_duty, private.order_fx(o.id)) > coalesce(v_limit, 0) then
      raise exception 'Refunds over % SAR are made by finance, a manager or the owner', to_char(coalesce(v_limit, 0) / 100.0, 'FM999,990.00');
    end if;
  end if;
  insert into refunds (order_id, return_id, currency, amount_minor, items_minor, shipping_minor, duties_minor, platform_minor, reason, restock,
                       idempotency_key, created_by)
  values (o.id, rr.id, o.currency, t_items + t_ship + t_duty, t_items, t_ship, t_duty, t_platform, v_reason, v_restock and t_items > 0, v_key, p_user)
  returning id into rid;
  insert into refund_lines (refund_id, sub_order_id, order_item_id, kind, quantity, amount_minor, commission_minor, vat_rate_bp, platform_invoiced)
  select rid, (e ->> 'sub_order_id')::uuid, (e ->> 'order_item_id')::uuid, e ->> 'kind', (e ->> 'quantity')::int, (e ->> 'amount_minor')::int,
         coalesce((e ->> 'commission_minor')::int, 0), (e ->> 'vat_rate_bp')::int, (e ->> 'platform_invoiced')::boolean
  from jsonb_array_elements(v_plan) e;
  return private.refund_json(rid) || jsonb_build_object('duplicate', false);
end $$;

-- Moyasar answered: the refund succeeded (order, lines, parcels, stock, the return, statements, the customer told) or failed.
create or replace function mp_complete_refund(p_refund uuid, p_ok boolean, p_provider_ref text default null, p_error text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f refunds;
  o orders;
  l record;
  v_sellers uuid[];
begin
  select * into f from refunds where id = p_refund for update;
  if f.id is null then raise exception 'Refund not found'; end if;
  if f.status <> 'processing' then return private.refund_json(f.id); end if;
  if not coalesce(p_ok, false) then
    update refunds set status = 'failed', error = left(coalesce(p_error, 'The payment provider did not refund it'), 1000), completed_at = now() where id = f.id;
    return private.refund_json(f.id);
  end if;
  update refunds set status = 'succeeded', provider_ref = left(p_provider_ref, 200), completed_at = now(),
                     credit_note_status = case when platform_minor > 0 then 'pending' else 'not_needed' end
  where id = f.id;
  select * into o from orders where id = f.order_id for update;
  update orders set refunded_minor = refunded_minor + f.amount_minor,
                    status = case when refunded_minor + f.amount_minor >= total_minor then 'refunded'::order_status else status end,
                    updated_at = now()
  where id = o.id;
  update order_items i set refunded_quantity = i.refunded_quantity + x.q, refunded_minor = i.refunded_minor + x.a
  from (select order_item_id, sum(quantity)::int as q, sum(amount_minor)::int as a from refund_lines where refund_id = f.id and kind = 'item' group by order_item_id) x
  where i.id = x.order_item_id;
  update sub_orders s set refunded_minor = s.refunded_minor + x.a,
                          needs_refund = case when s.refunded_minor + x.a >= s.items_minor + s.shipping_minor + s.duties_minor then false else s.needs_refund end
  from (select sub_order_id, sum(amount_minor)::int as a from refund_lines where refund_id = f.id and sub_order_id is not null group by sub_order_id) x
  where s.id = x.sub_order_id;
  -- stock back when the items came back fit to sell (a parcel the seller cancelled had its stock put back then)
  if f.restock then
    for l in select rl.quantity, i.product_id, i.variant_id, coalesce(p.made_to_measure, false) as mtm
             from refund_lines rl join order_items i on i.id = rl.order_item_id left join products p on p.id = i.product_id
             left join sub_orders s on s.id = i.sub_order_id
             where rl.refund_id = f.id and rl.kind = 'item' and i.product_id is not null and coalesce(s.status::text, '') <> 'cancelled' loop
      if l.variant_id is not null then update product_variants set stock = stock + l.quantity where id = l.variant_id;
      elsif not l.mtm then update products set stock = stock + l.quantity where id = l.product_id; end if;
    end loop;
  end if;
  if f.return_id is not null then
    update return_requests set status = 'refunded', resolved_at = now() where id = f.return_id and status <> 'refunded';
  end if;
  for l in select distinct sub_order_id from refund_lines where refund_id = f.id and sub_order_id is not null loop
    perform private.book_refund(f.id, l.sub_order_id);
  end loop;
  perform private.notify('refund_issued', jsonb_build_object('user_id', o.user_id, 'order_id', o.id),
    jsonb_build_object('amount', private.money_text(f.amount_minor, f.currency), 'order', o.number, 'order_id', o.id), 'refund:' || f.id);
  select array_agg(distinct s.seller_id) into v_sellers from refund_lines rl join sub_orders s on s.id = rl.sub_order_id
  where rl.refund_id = f.id and rl.kind = 'item' and s.seller_id is not null;
  for l in select s.seller_id, format('AM-%s-%s', o.number, s.seq) as num, sum(rl.amount_minor)::int as amt
           from refund_lines rl join sub_orders s on s.id = rl.sub_order_id
           where rl.refund_id = f.id and rl.kind = 'item' and s.seller_id is not null group by s.seller_id, s.seq loop
    perform private.notify('seller_refund_recorded', jsonb_build_object('seller_id', l.seller_id),
      jsonb_build_object('number', l.num, 'amount', private.money_text(l.amt, f.currency)), 'refund:' || f.id || ':' || l.seller_id);
  end loop;
  return private.refund_json(f.id);
end $$;

-- A refund as reconciling with Moyasar needs it (server only; review H2).
create or replace function mp_refund_state(p_refund uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'status', f.status, 'payment_id', o.payment_id, 'amount_minor', f.amount_minor, 'order_id', f.order_id,
    'order_refunded_minor', o.refunded_minor, 'age_seconds', extract(epoch from now() - f.created_at)::int)
  from refunds f join orders o on o.id = f.order_id where f.id = p_refund;
$$;
revoke all on function mp_refund_state(uuid) from public, anon, authenticated;

-- ================================================================ tax invoices and credit notes (server only)
-- ZATCA: every paid order we invoice gets ONE tax invoice; every refund of what we invoiced gets a credit note built
-- from that invoice (its VAT rate and exchange rate, never today's settings). The invoice counter (ICV) is taken and
-- the document stored in the same transaction, so a failure never leaves a gap in the numbers; a second attempt for
-- the same order or refund returns the document already issued (review H3, M9, M10). Invoices are never edited.

-- p: {doc: invoice | credit_note, order_id, refund_id (credit notes), original_invoice_id, reason, uuid, issue_at,
--     currency, totals (minor units, VAT included), vat_rate_bp, fx_per_sar, buyer, qr_base64,
--     xml (with {{NUMBER}} and {{ICV}} where the number and the counter go)}
create or replace function mp_issue_document(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_doc invoice_doc := coalesce(nullif(p ->> 'doc', ''), 'invoice')::invoice_doc;
  v_order uuid := (p ->> 'order_id')::uuid;
  v_refund uuid := nullif(p ->> 'refund_id', '')::uuid;
  v_issue timestamptz := coalesce(nullif(p ->> 'issue_at', '')::timestamptz, now());
  f refunds;
  existing invoices;
  v_icv bigint;
  v_number text;
  v_id uuid;
begin
  if v_doc = 'invoice' then
    select * into existing from invoices where order_id = v_order and doc = 'invoice';
    if existing.id is not null then return jsonb_build_object('id', existing.id, 'number', existing.number, 'duplicate', true); end if;
    if not exists (select 1 from orders where id = v_order and status not in ('pending_payment', 'cancelled')) then raise exception 'Order not paid'; end if;
  elsif v_doc = 'credit_note' then
    select * into f from refunds where id = v_refund for update;
    if f.id is null or f.order_id is distinct from v_order then raise exception 'Refund not found'; end if;
    if f.credit_note_status = 'issued' then
      return (select jsonb_build_object('id', i.id, 'number', i.number, 'duplicate', true) from invoices i where i.id = f.credit_note_id);
    end if;
    if f.status <> 'succeeded' or f.credit_note_status <> 'pending' then raise exception 'This refund needs no credit note'; end if;
    if not exists (select 1 from invoices i where i.id = nullif(p ->> 'original_invoice_id', '')::uuid and i.order_id = v_order and i.doc = 'invoice') then
      raise exception 'A credit note refers to the order''s tax invoice';
    end if;
  else
    raise exception 'Unknown document %', v_doc;
  end if;
  v_icv := next_invoice_slot();   -- in this transaction: undone with everything else if anything below fails
  v_number := format('%s-%s-%s', case when v_doc = 'credit_note' then 'CN' else 'INV' end,
                     extract(year from v_issue at time zone 'UTC')::int, lpad(v_icv::text, 6, '0'));
  insert into invoices (uuid, number, icv, kind, doc, order_id, original_invoice_id, reason, issue_at, currency, total_excl_vat_minor, vat_minor,
                        total_incl_vat_minor, total_sar_incl_vat_minor, vat_sar_minor, buyer, qr_base64, xml, vat_rate_bp, fx_per_sar)
  values (coalesce(nullif(p ->> 'uuid', '')::uuid, gen_random_uuid()), v_number, v_icv, 'simplified', v_doc, v_order,
          nullif(p ->> 'original_invoice_id', '')::uuid, nullif(p ->> 'reason', ''), v_issue, p ->> 'currency',
          (p ->> 'total_excl_vat_minor')::int, (p ->> 'vat_minor')::int, (p ->> 'total_incl_vat_minor')::int,
          (p ->> 'total_sar_incl_vat_minor')::int, (p ->> 'vat_sar_minor')::int, p -> 'buyer', p ->> 'qr_base64',
          replace(replace(p ->> 'xml', '{{NUMBER}}', v_number), '{{ICV}}', v_icv::text),
          nullif(p ->> 'vat_rate_bp', '')::int, nullif(p ->> 'fx_per_sar', '')::numeric)
  returning id into v_id;
  if v_doc = 'credit_note' then
    update refunds set credit_note_id = v_id, credit_note_status = 'issued' where id = f.id;
  end if;
  return jsonb_build_object('id', v_id, 'number', v_number, 'duplicate', false);
exception when unique_violation then
  -- the order's invoice was issued at the same moment by another request: that one stands, and nothing of ours is kept
  select * into existing from invoices where order_id = v_order and doc = 'invoice';
  if v_doc = 'invoice' and existing.id is not null then
    return jsonb_build_object('id', existing.id, 'number', existing.number, 'duplicate', true);
  end if;
  raise;
end $$;

-- What an order's tax invoice is made of (server only): the lines and delivery we invoice (our own products and the
-- parcels where the platform is the supplier; never duties), at the order's checkout rate.
create or replace function mp_invoice_context(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'number', o.number, 'currency', o.currency, 'status', o.status, 'ship_to', o.ship_to,
               'fx_per_sar', o.fx_per_sar, 'paid_at', o.paid_at, 'total_minor', o.total_minor),
    'invoice', (select jsonb_build_object('id', i.id, 'number', i.number) from invoices i where i.order_id = o.id and i.doc = 'invoice'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name_en', x.name_en, 'name_ar', x.name_ar, 'unit_price_minor', x.unit_price_minor,
                 'quantity', x.quantity, 'line_total_minor', x.line_total_minor, 'vat_rate_bp', x.vat_rate_bp) order by x.name_en, x.id), '[]'::jsonb)
              from order_items x left join sub_orders s on s.id = x.sub_order_id
              where x.order_id = o.id and (x.sub_order_id is null or s.invoicer = 'platform')),
    'shipping_minor', case when exists (select 1 from sub_orders s where s.order_id = o.id)
                           then (select coalesce(sum(s.shipping_minor), 0) from sub_orders s where s.order_id = o.id and s.invoicer = 'platform')
                           else o.shipping_minor end,
    'seller_invoiced', (select count(*) from sub_orders s where s.order_id = o.id and s.invoicer <> 'platform'))
  from orders o where o.id = p_order;
$$;

-- What a refund's credit note is made of (server only): the refund and the invoice it corrects.
create or replace function mp_credit_note_context(p_refund uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'refund', private.refund_json(f.id),
    'original', (select jsonb_build_object('id', i.id, 'number', i.number, 'currency', i.currency, 'vat_rate_bp', i.vat_rate_bp, 'fx_per_sar', i.fx_per_sar,
                   'total_incl_vat_minor', i.total_incl_vat_minor, 'vat_minor', i.vat_minor, 'total_sar_incl_vat_minor', i.total_sar_incl_vat_minor)
                 from invoices i where i.order_id = f.order_id and i.doc = 'invoice'),
    'order_fx_per_sar', (select o.fx_per_sar from orders o where o.id = f.order_id))
  from refunds f where f.id = p_refund;
$$;

-- What a failure left half done (server only; finish-pending works through it, the dashboard counts it): paid orders
-- with no tax invoice, paid orders whose parcels were not handed on, refunds whose credit note is missing, refunds
-- still waiting for Moyasar's answer. p_min_age_seconds leaves alone what a request may be finishing right now.
create or replace function mp_pending_work(p_limit int default 20, p_min_age_seconds int default 120) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orders_without_invoice', (select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
        select o.id from orders o
        where o.status not in ('pending_payment', 'cancelled') and o.paid_at <= now() - make_interval(secs => p_min_age_seconds)
          and not exists (select 1 from invoices i where i.order_id = o.id and i.doc = 'invoice')
          and exists (select 1 from order_items x left join sub_orders s on s.id = x.sub_order_id
                      where x.order_id = o.id and (x.sub_order_id is null or s.invoicer = 'platform'))
        order by o.paid_at limit p_limit) x),
    'orders_not_handed_on', (select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
        select o.id from orders o
        where o.status in ('paid', 'packing', 'shipped', 'delivered') and o.paid_at <= now() - make_interval(secs => p_min_age_seconds)
          and exists (select 1 from sub_orders s where s.order_id = o.id and s.status = 'pending_payment')
        order by o.paid_at limit p_limit) x),
    'credit_notes', (select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
        select id from refunds where status = 'succeeded' and credit_note_status = 'pending' order by completed_at limit p_limit) x),
    'refunds_processing', (select coalesce(jsonb_agg(x.id), '[]'::jsonb) from (
        select id from refunds where status = 'processing' and created_at <= now() - make_interval(secs => p_min_age_seconds) order by created_at limit p_limit) x));
$$;
revoke all on function mp_issue_document(jsonb) from public, anon, authenticated;
revoke all on function mp_invoice_context(uuid) from public, anon, authenticated;
revoke all on function mp_credit_note_context(uuid) from public, anon, authenticated;
revoke all on function mp_pending_work(int, int) from public, anon, authenticated;
revoke all on function mp_prepare_refund(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function mp_complete_refund(uuid, boolean, text, text) from public, anon, authenticated;

-- ================================================================ returns
-- how many of a line are refunded or in an open return already
create or replace function private.line_taken(p_item uuid, p_except uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select refunded_quantity from order_items where id = p_item), 0)
       + coalesce((select sum(rl.quantity) from return_lines rl join return_requests r on r.id = rl.return_id
                   where rl.order_item_id = p_item and r.id is distinct from p_except and private.return_open(r.status, r.declined_at)), 0)::int;
$$;

create or replace function private.return_json(p_return uuid, p_side text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'number', format('R-%s-%s', o.number, r.seq), 'order_id', r.order_id, 'order_number', o.number,
    'sub_order_id', r.sub_order_id, 'sub_order_number', format('AM-%s-%s', o.number, s.seq), 'status', r.status, 'kind', r.kind,
    'reason', r.reason, 'unopened', r.unopened, 'details', r.details, 'seller_note', r.seller_note, 'escalation_note', r.escalation_note,
    'staff_note', r.staff_note, 'restock', r.restock, 'respond_by', r.respond_by, 'decided_by', r.decided_by,
    'approved_by', case when p_side = 'staff' then (select coalesce(m.name, u.email) from auth.users u left join staff_members m on m.user_id = u.id where u.id = r.approved_by) end,
    'created_at', r.created_at, 'accepted_at', r.accepted_at, 'declined_at', r.declined_at, 'escalated_at', r.escalated_at,
    'received_at', r.received_at, 'approved_at', r.approved_at, 'resolved_at', r.resolved_at, 'currency', s.currency,
    'can_escalate', (r.status = 'declined' and r.declined_at > now() - make_interval(days => (select dispute_window_days from mp_settings where id = 1)))
                    or (r.status = 'requested' and r.respond_by is not null and r.respond_by < now())
                    or (r.status = 'accepted' and r.accepted_at < now() - interval '14 days'),
    'seller', case when r.seller_id is not null then (select jsonb_build_object('id', x.id, 'name_en', x.name_en, 'name_ar', x.name_ar) from sellers x where x.id = r.seller_id) end,
    'customer', case when p_side = 'customer' then null
                     when p_side = 'staff' then o.ship_to ->> 'recipient_name'
                     else split_part(coalesce(o.ship_to ->> 'recipient_name', ''), ' ', 1) end,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'bucket', a.bucket, 'path', a.path, 'status', a.status)), '[]'::jsonb)
               from media_assets a where a.id = any(r.photos) and a.path is not null),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('order_item_id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'variant', i.variant_label,
               'quantity', rl.quantity, 'bought', i.quantity, 'unit_price_minor', i.unit_price_minor, 'line_total_minor', i.line_total_minor,
               'return_policy', i.return_policy, 'custom', i.custom is not null) order by i.name_en), '[]'::jsonb)
              from return_lines rl join order_items i on i.id = rl.order_item_id where rl.return_id = r.id),
    'value_minor', (select coalesce(sum(round(i.line_total_minor::numeric * rl.quantity / i.quantity)), 0)::int
                    from return_lines rl join order_items i on i.id = rl.order_item_id where rl.return_id = r.id),
    'thread_id', (select t.id from message_threads t where t.return_id = r.id),
    'refund', (select jsonb_build_object('id', f.id, 'status', f.status, 'amount_minor', f.amount_minor, 'completed_at', f.completed_at)
               from refunds f where f.return_id = r.id and f.status <> 'failed' order by f.created_at desc limit 1),
    'flags', case when p_side = 'staff' then to_jsonb(r.flags) end)
  from return_requests r join orders o on o.id = r.order_id join sub_orders s on s.id = r.sub_order_id where r.id = p_return;
$$;

create or replace function private.notify_return(p_return uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r return_requests;
  o orders;
  v jsonb;
  cust jsonb;
begin
  select * into r from return_requests where id = p_return;
  select * into o from orders where id = r.order_id;
  v := jsonb_build_object('return', format('R-%s-%s', o.number, r.seq), 'order', o.number, 'order_id', o.id,
         'number', (select format('AM-%s-%s', o.number, s.seq) from sub_orders s where s.id = r.sub_order_id),
         'seller', private.seller_label(r.seller_id), 'reason', private.return_reason(r.reason),
         'respond_by', coalesce(to_char(r.respond_by at time zone 'Asia/Riyadh', 'YYYY-MM-DD'), ''),
         'days', (select dispute_window_days from mp_settings where id = 1), 'return_id', r.id);
  cust := jsonb_build_object('user_id', r.user_id, 'order_id', o.id);
  if p_event = 'requested' then
    perform private.notify('return_requested', cust, v, 'return:' || r.id || ':requested');
    if r.seller_id is not null then
      perform private.notify('seller_return_requested', jsonb_build_object('seller_id', r.seller_id), v, 'return:' || r.id || ':seller');
    else
      perform private.notify('staff_return_requested', jsonb_build_object('staff_roles', array['owner', 'manager', 'support', 'operations']), v, 'return:' || r.id || ':staff');
    end if;
  elsif p_event = 'accepted' then
    perform private.notify('return_accepted', cust, v, 'return:' || r.id || ':accepted');
  elsif p_event = 'approved' then
    perform private.notify('return_approved', cust, v, 'return:' || r.id || ':approved');
    perform private.notify('staff_refund_needed', jsonb_build_object('staff_roles', array['owner', 'manager', 'finance', 'support']),
      v || jsonb_build_object('why', private.bi('Return ' || (v ->> 'return') || ' was approved.', 'تمت الموافقة على طلب الإرجاع ' || (v ->> 'return') || '.')),
      'return:' || r.id || ':refund');
    if r.seller_id is not null and r.decided_by = 'staff' then
      perform private.notify('seller_return_decided', jsonb_build_object('seller_id', r.seller_id), v || jsonb_build_object('decision', private.bi('approved', 'قبول')),
        'return:' || r.id || ':decided');
    end if;
  elsif p_event = 'declined' then
    perform private.notify('return_declined', cust, v, 'return:' || r.id || ':declined');
  elsif p_event = 'escalated' then
    perform private.notify('staff_return_escalated', jsonb_build_object('staff_roles', array['owner', 'manager', 'support']), v, 'return:' || r.id || ':escalated');
    if r.seller_id is not null then
      perform private.notify('seller_return_escalated', jsonb_build_object('seller_id', r.seller_id), v, 'return:' || r.id || ':escalated:seller');
    end if;
  elsif p_event = 'rejected' then
    perform private.notify('return_rejected', cust, v, 'return:' || r.id || ':rejected');
    if r.seller_id is not null then
      perform private.notify('seller_return_decided', jsonb_build_object('seller_id', r.seller_id), v || jsonb_build_object('decision', private.bi('rejected', 'رفض')),
        'return:' || r.id || ':decided');
    end if;
  end if;
end $$;

-- The customer asks (server only: the after-sale function masks the details first).
-- p: {sub_order_id, reason, unopened, details, lines [{order_item_id, quantity}], photos [asset ids], flags}
create or replace function mp_return_request(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s sub_orders;
  o orders;
  st mp_settings;
  i order_items;
  e record;
  v_reason text := p ->> 'reason';
  v_problem boolean;
  v_kind text;
  v_unopened boolean := coalesce((p ->> 'unopened')::boolean, false);
  v_details text := nullif(left(trim(coalesce(p ->> 'details', '')), 2000), '');
  v_photos uuid[];
  v_expected date;
  v_seq int;
  rid uuid;
  n int := 0;
begin
  perform private.act_as(p_user);
  if not private.marketplace_open() then
    raise exception using message = 'Returns cannot be requested online yet: please contact us and we will help', detail = 'لا يمكن طلب الإرجاع عبر الموقع بعد: تواصل معنا وسنساعدك';
  end if;
  select * into s from sub_orders where id = nullif(p ->> 'sub_order_id', '')::uuid;
  if s.id is null then raise exception 'Order not found' using detail = 'لم يُعثر على الطلب'; end if;
  select * into o from orders where id = s.order_id for update;       -- numbering: one request at a time on an order
  if o.user_id is distinct from p_user then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into st from mp_settings where id = 1;
  if v_reason is null or v_reason not in ('changed_mind', 'not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received') then
    raise exception 'Choose a reason' using detail = 'اختر سببًا';
  end if;
  v_problem := v_reason <> 'changed_mind';
  v_kind := case when v_reason in ('not_received', 'missing_item') then 'refund_only' else 'return' end;
  if v_reason = 'not_received' then
    v_expected := coalesce(s.accepted_at, o.paid_at)::date + coalesce(s.days_max, 10);
    if not (s.status = 'delivered' or (s.status in ('ready_to_ship', 'shipped', 'delivery_failed') and private.riyadh_today() > v_expected + 2)) then
      raise exception 'Your parcel is still within its delivery time. If it has not arrived by %, tell us here.', v_expected + 3
        using detail = format('ما زالت شحنتك ضمن مدة التوصيل. إن لم تصل بحلول %s فأخبرنا هنا.', v_expected + 3);
    end if;
    if coalesce((s.delivered_at at time zone 'Asia/Riyadh')::date, v_expected) < private.riyadh_today() - st.faulty_claim_days then
      raise exception 'The time to report this has passed' using detail = 'انتهت مدة الإبلاغ عن ذلك';
    end if;
  else
    if s.status <> 'delivered' or s.delivered_at is null then raise exception 'You can ask for a return once the parcel has been delivered' using detail = 'يمكنك طلب الإرجاع بعد توصيل الشحنة'; end if;
    if v_problem and s.delivered_at < now() - make_interval(days => st.faulty_claim_days) then
      raise exception 'A problem can be reported up to % days after delivery', st.faulty_claim_days
        using detail = format('يمكن الإبلاغ عن مشكلة خلال %s يومًا من التوصيل', st.faulty_claim_days);
    end if;
  end if;
  if v_reason in ('not_as_described', 'faulty', 'damaged', 'wrong_item') and coalesce(char_length(v_details), 0) < 10 then
    raise exception 'Tell us what is wrong in a sentence or two' using detail = 'أخبرنا بالمشكلة في جملة أو جملتين';
  end if;
  v_photos := coalesce(array(select x::uuid from jsonb_array_elements_text(case when jsonb_typeof(p -> 'photos') = 'array' then p -> 'photos' else '[]'::jsonb end) x), '{}');
  if cardinality(v_photos) > 4 then raise exception 'Up to 4 photos' using detail = 'أربع صور كحد أقصى'; end if;
  if exists (select 1 from unnest(v_photos) x where not exists (
      select 1 from media_assets a where a.id = x and a.user_id = p_user and a.seller_id is null and a.kind = 'return_photo' and a.status in ('passed', 'review'))) then
    raise exception 'Every photo must pass the photo check' using detail = 'يجب أن تجتاز كل صورة فحص الصور';
  end if;
  v_seq := coalesce((select max(r.seq) from return_requests r where r.order_id = o.id), 0) + 1;
  insert into return_requests (order_id, sub_order_id, seq, seller_id, user_id, kind, reason, unopened, details, photos, flags, respond_by)
  values (o.id, s.id, v_seq, s.seller_id, p_user, v_kind, v_reason, v_unopened, v_details, v_photos,
          coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p -> 'flags') = 'array' then p -> 'flags' else '[]'::jsonb end)), '{}'),
          case when s.seller_id is not null then now() + make_interval(days => st.return_response_days) end)
  returning id into rid;
  for e in select (x ->> 'order_item_id')::uuid as id, sum((x ->> 'quantity')::int)::int as q
           from jsonb_array_elements(case when jsonb_typeof(p -> 'lines') = 'array' then p -> 'lines' else '[]'::jsonb end) x group by 1 loop
    select * into i from order_items where id = e.id;
    if i.id is null or i.sub_order_id is distinct from s.id then raise exception 'That item is not in this parcel' using detail = 'هذا المنتج ليس في هذه الشحنة'; end if;
    if e.q is null or e.q < 1 or e.q > i.quantity - private.line_taken(i.id, rid) then
      raise exception 'Only % of "%" can be returned', greatest(i.quantity - private.line_taken(i.id, rid), 0), i.name_en
        using detail = format('يمكن إرجاع %s فقط من «%s»', greatest(i.quantity - private.line_taken(i.id, rid), 0), coalesce(i.name_ar, i.name_en));
    end if;
    if not v_problem then
      if coalesce(i.return_policy, 'standard') in ('faulty_only', 'none') then
        raise exception '"%" can only be returned if it is faulty, damaged, wrong or not as described', i.name_en
          using detail = format('لا يمكن إرجاع «%s» إلا إذا كان معيبًا أو تالفًا أو مختلفًا عن الطلب أو عن الوصف', coalesce(i.name_ar, i.name_en));
      end if;
      if i.return_policy = 'unopened_only' and not v_unopened then raise exception '"%" can only be returned unopened', i.name_en using detail = format('لا يمكن إرجاع «%s» إلا إذا كان غير مفتوح', coalesce(i.name_ar, i.name_en)); end if;
      if s.delivered_at + make_interval(days => coalesce(i.return_window_days, st.default_return_window_days)) < now() then
        raise exception 'The return window for "%" has closed', i.name_en using detail = format('انتهت مدة إرجاع «%s»', coalesce(i.name_ar, i.name_en));
      end if;
    end if;
    insert into return_lines (return_id, order_item_id, quantity) values (rid, i.id, e.q);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Choose the items' using detail = 'اختر المنتجات'; end if;
  perform private.notify_return(rid, 'requested');
  return private.return_json(rid, 'customer');
end $$;

-- What happens next (server only). Customer: escalate, withdraw. Seller (or our team for them): accept, decline,
-- received. Our team: approve, reject (final). Only our team refunds, through refund-order.
create or replace function mp_return_action(p_user uuid, p_return uuid, p_action text, p_note text default null, p_restock boolean default null,
                                            p_flags text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r return_requests;
  st mp_settings;
  v_role text := coalesce(private.user_staff_role(p_user)::text, '');
  v_staff boolean;
  v_seller boolean;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_event text;
begin
  perform private.act_as(p_user);
  select * into r from return_requests where id = p_return for update;
  if r.id is null then raise exception 'Return not found' using detail = 'لم يُعثر على طلب الإرجاع'; end if;
  select * into st from mp_settings where id = 1;
  v_staff := v_role in ('owner', 'manager', 'support', 'operations', 'finance');
  v_seller := private.user_is_member(r.seller_id, p_user);
  if p_action in ('escalate', 'withdraw') then
    if r.user_id is distinct from p_user then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  elsif p_action in ('accept', 'received') then
    if not (v_seller or v_staff) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  elsif p_action = 'decline' then
    if not v_seller then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  elsif p_action in ('approve', 'reject') then
    if not v_staff then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  else
    raise exception 'Unknown action' using detail = 'إجراء غير معروف';
  end if;

  if p_action = 'accept' then
    if not (r.status = 'requested' or (r.status = 'escalated' and v_staff)) then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    update return_requests set
      status = case when r.kind = 'refund_only' then 'approved' else 'accepted' end,
      accepted_at = now(), approved_at = case when r.kind = 'refund_only' then now() end,
      seller_note = case when v_seller then coalesce(v_note, seller_note) else seller_note end,
      staff_note = case when not v_seller then coalesce(v_note, staff_note) else staff_note end,
      decided_by = case when v_seller then 'seller' else 'staff' end,
      approved_by = case when r.kind = 'refund_only' then p_user else approved_by end,
      flags = flags || coalesce(p_flags, '{}')
    where id = r.id;
    v_event := case when r.kind = 'refund_only' then 'approved' else 'accepted' end;
  elsif p_action = 'decline' then
    if r.status <> 'requested' then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    if v_note is null or char_length(v_note) < 5 then raise exception 'Tell the customer why' using detail = 'أخبر العميل بالسبب'; end if;
    update return_requests set status = 'declined', declined_at = now(), seller_note = v_note, decided_by = 'seller', flags = flags || coalesce(p_flags, '{}')
    where id = r.id;
    v_event := 'declined';
  elsif p_action = 'received' then
    if r.status <> 'accepted' then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    update return_requests set status = 'approved', received_at = now(), approved_at = now(), restock = coalesce(p_restock, false), approved_by = p_user,
      seller_note = case when v_seller and v_note is not null then v_note else seller_note end
    where id = r.id;
    v_event := 'approved';
  elsif p_action = 'escalate' then
    if not ((r.status = 'declined' and r.declined_at > now() - make_interval(days => st.dispute_window_days))
            or (r.status = 'requested' and r.respond_by is not null and r.respond_by < now())
            or (r.status = 'accepted' and r.accepted_at < now() - interval '14 days')) then
      raise exception 'You can ask us to decide once the seller has answered, or if they have not answered in time'
        using detail = 'يمكنك أن تطلب منا البت في الأمر بعد رد البائع، أو إن لم يرد في الوقت المحدد';
    end if;
    if v_note is null or char_length(v_note) < 5 then raise exception 'Tell us why you disagree' using detail = 'أخبرنا لماذا لا توافق'; end if;
    update return_requests set status = 'escalated', escalated_at = now(), escalation_note = v_note, flags = flags || coalesce(p_flags, '{}') where id = r.id;
    v_event := 'escalated';
  elsif p_action = 'withdraw' then
    if r.status not in ('requested', 'accepted', 'declined', 'escalated') then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    update return_requests set status = 'withdrawn', resolved_at = now() where id = r.id;
    v_event := 'withdrawn';
  elsif p_action = 'approve' then
    if r.status not in ('requested', 'accepted', 'declined', 'escalated') then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    update return_requests set status = 'approved', approved_at = now(), decided_by = 'staff', staff_note = coalesce(v_note, staff_note), approved_by = p_user,
      restock = coalesce(p_restock, restock), received_at = case when coalesce(p_restock, false) then coalesce(received_at, now()) else received_at end
    where id = r.id;
    v_event := 'approved';
  elsif p_action = 'reject' then
    if r.status not in ('requested', 'accepted', 'declined', 'escalated') then raise exception 'This return is %', r.status using detail = format('حالة طلب الإرجاع هذا: %s', private.status_ar(r.status)); end if;
    if v_note is null or char_length(v_note) < 5 then raise exception 'Explain the decision to the customer' using detail = 'اشرح القرار للعميل'; end if;
    update return_requests set status = 'rejected', resolved_at = now(), decided_by = 'staff', staff_note = v_note where id = r.id;
    v_event := 'rejected';
  end if;
  perform private.notify_return(r.id, v_event);
  return private.return_json(r.id, case when r.user_id is not distinct from p_user then 'customer' when v_seller then 'seller' else 'staff' end);
end $$;
revoke all on function mp_return_request(uuid, jsonb) from public, anon, authenticated;
revoke all on function mp_return_action(uuid, uuid, text, text, boolean, text[]) from public, anon, authenticated;

create or replace function seller_returns(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(private.return_json(r.id, 'seller') order by r.created_at desc) from return_requests r where r.seller_id = p_seller), '[]'::jsonb);
end $$;

-- ================================================================ reviews
create or replace function private.refresh_rating(p_product uuid) returns void
language sql security definer set search_path = public as $$
  update products p set rating_avg = x.avg, rating_count = x.n
  from (select round(avg(rating)::numeric, 2) as avg, count(*)::int as n from product_reviews where product_id = p_product and status = 'published') x
  where p.id = p_product and (p.rating_avg is distinct from x.avg or p.rating_count <> x.n);
$$;
create or replace function private.on_review_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform private.refresh_rating(new.product_id); end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.product_id <> old.product_id) then perform private.refresh_rating(old.product_id); end if;
  return null;
end $$;
create trigger product_reviews_rating after insert or update of status, rating, product_id or delete on product_reviews
  for each row execute function private.on_review_change();

create or replace function private.notify_review(p_review uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r product_reviews;
  v jsonb;
begin
  select * into r from product_reviews where id = p_review;
  v := (select jsonb_build_object('product', private.bi(p.name_en, p.name_ar), 'slug', p.slug, 'rating', r.rating, 'seller', private.seller_label(r.seller_id))
        from products p where p.id = r.product_id);
  if p_event = 'published' then
    perform private.notify('review_published', jsonb_build_object('user_id', r.user_id), v, 'review:' || r.id || ':published');
    if r.seller_id is not null then perform private.notify('seller_review_new', jsonb_build_object('seller_id', r.seller_id), v, 'review:' || r.id || ':seller'); end if;
  elsif p_event = 'reply' then
    perform private.notify('review_reply', jsonb_build_object('user_id', r.user_id), v, 'review:' || r.id || ':reply');
  end if;
end $$;

-- A verified purchase (server only: the after-sale function checks the text first).
-- p: {order_item_id, rating, title, body, lang, name, photos [asset ids], flags}
create or replace function mp_submit_review(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i order_items;
  o orders;
  st mp_settings;
  existing product_reviews;
  v_delivered timestamptz;
  v_seller uuid;
  v_rating int := nullif(p ->> 'rating', '')::int;
  v_title text := nullif(left(trim(coalesce(p ->> 'title', '')), 120), '');
  v_body text := left(trim(coalesce(p ->> 'body', '')), 2000);
  v_lang text := case when p ->> 'lang' = 'en' then 'en' else 'ar' end;
  v_photos uuid[];
  v_flags text[];
  v_auto boolean;
  v_name text;
  rid uuid;
begin
  perform private.act_as(p_user);
  if not private.marketplace_open() then
    raise exception using message = 'Reviews open soon', detail = 'ستتاح التقييمات قريبًا';
  end if;
  select * into i from order_items where id = nullif(p ->> 'order_item_id', '')::uuid;
  select * into o from orders where id = i.order_id;
  if i.id is null or o.user_id is distinct from p_user then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if i.product_id is null then raise exception 'This item cannot be reviewed' using detail = 'لا يمكن تقييم هذا المنتج'; end if;
  select * into st from mp_settings where id = 1;
  v_delivered := case when i.sub_order_id is not null then (select delivered_at from sub_orders where id = i.sub_order_id)
                      when o.status = 'delivered' then o.updated_at end;
  if v_delivered is null then raise exception 'You can review an item once it has been delivered' using detail = 'يمكنك تقييم المنتج بعد توصيله'; end if;
  if v_delivered < now() - make_interval(days => st.review_window_days) then raise exception 'The time to review this item has passed' using detail = 'انتهت مدة تقييم هذا المنتج'; end if;
  if v_rating is null or v_rating not between 1 and 5 then raise exception 'Choose from 1 to 5 stars' using detail = 'اختر من نجمة إلى خمس نجوم'; end if;
  v_photos := coalesce(array(select x::uuid from jsonb_array_elements_text(case when jsonb_typeof(p -> 'photos') = 'array' then p -> 'photos' else '[]'::jsonb end) x), '{}');
  if cardinality(v_photos) > 3 then raise exception 'Up to 3 photos' using detail = 'ثلاث صور كحد أقصى'; end if;
  if exists (select 1 from unnest(v_photos) x where not exists (
      select 1 from media_assets a where a.id = x and a.user_id = p_user and a.seller_id is null and a.kind = 'review_photo' and a.status in ('passed', 'review'))) then
    raise exception 'Every photo must pass the photo check' using detail = 'يجب أن تجتاز كل صورة فحص الصور';
  end if;
  v_flags := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p -> 'flags') = 'array' then p -> 'flags' else '[]'::jsonb end)), '{}');
  if exists (select 1 from media_assets a where a.id = any(v_photos) and a.status = 'review') then v_flags := array_append(v_flags, 'photo_review'); end if;
  select * into existing from product_reviews where order_item_id = i.id;
  if existing.id is not null and existing.status = 'hidden' then raise exception 'This review was removed by our team' using detail = 'أزال فريقنا هذا التقييم'; end if;
  v_seller := (select seller_id from products where id = i.product_id);
  v_name := coalesce(private.public_name(nullif(left(trim(coalesce(p ->> 'name', '')), 60), '')),
                     private.public_name((select full_name from profiles where id = p_user)),
                     case when v_lang = 'ar' then 'عميل' else 'Customer' end);
  v_auto := st.review_auto_publish and cardinality(v_flags) = 0 and cardinality(v_photos) = 0;
  insert into product_reviews (product_id, seller_id, order_item_id, user_id, author_name, rating, title, body, lang, photos, flags, status, published_at)
  values (i.product_id, v_seller, i.id, p_user, v_name, v_rating, v_title, v_body, v_lang, v_photos, v_flags,
          case when v_auto then 'published' else 'pending' end, case when v_auto then now() end)
  on conflict (order_item_id) do update set author_name = excluded.author_name, rating = excluded.rating, title = excluded.title, body = excluded.body,
    lang = excluded.lang, photos = excluded.photos, photo_urls = '{}', flags = excluded.flags, status = excluded.status, published_at = excluded.published_at,
    moderation_note = null, moderated_by = null, moderated_at = null
  returning id into rid;
  if v_auto then perform private.notify_review(rid, 'published'); end if;
  return jsonb_build_object('id', rid, 'status', case when v_auto then 'published' else 'pending' end);
end $$;

-- One reply per review: the seller (our team for our own products). Server only.
create or replace function mp_reply_review(p_user uuid, p_review uuid, p_body text, p_flags text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r product_reviews;
  existing review_replies;
  v_body text := trim(coalesce(p_body, ''));
  v_staff boolean := coalesce(private.user_staff_role(p_user)::text, '') in ('owner', 'manager', 'marketing', 'support');
  v_publish boolean;
begin
  perform private.act_as(p_user);
  select * into r from product_reviews where id = p_review;
  if r.id is null or r.status <> 'published' then raise exception 'Review not found' using detail = 'لم يُعثر على التقييم'; end if;
  if r.seller_id is not null then
    if not private.user_is_member(r.seller_id, p_user) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  elsif not v_staff then
    raise exception 'Not allowed' using detail = 'غير مسموح';
  end if;
  if char_length(v_body) < 2 or char_length(v_body) > 1500 then raise exception 'Write a reply (up to 1500 characters)' using detail = 'اكتب ردًا (حتى ١٥٠٠ حرف)'; end if;
  select * into existing from review_replies where review_id = r.id;
  if existing.review_id is not null and existing.status = 'hidden' then raise exception 'This reply was removed by our team' using detail = 'أزال فريقنا هذا الرد'; end if;
  -- our team's replies go out at once; a seller's are read first unless the setting says otherwise
  v_publish := r.seller_id is null or ((select review_auto_publish from mp_settings where id = 1) and cardinality(coalesce(p_flags, '{}')) = 0);
  insert into review_replies (review_id, seller_id, author_id, body, flags, status, published_at)
  values (r.id, r.seller_id, p_user, v_body, coalesce(p_flags, '{}'), case when v_publish then 'published' else 'pending' end, case when v_publish then now() end)
  on conflict (review_id) do update set author_id = excluded.author_id, body = excluded.body, flags = excluded.flags, status = excluded.status,
    published_at = excluded.published_at, moderation_note = null, moderated_by = null, moderated_at = null;
  if v_publish then perform private.notify_review(r.id, 'reply'); end if;
  return jsonb_build_object('review_id', r.id, 'status', case when v_publish then 'published' else 'pending' end);
end $$;

-- Our team publishes, rejects or hides a review or a reply (server only: the function publishes the photos first).
create or replace function mp_moderate_review(p_user uuid, p_review uuid, p_target text, p_action text, p_note text default null, p_photo_urls text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r product_reviews;
  y review_replies;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if coalesce(private.user_staff_role(p_user)::text, '') not in ('owner', 'manager', 'marketing', 'support') then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  perform private.act_as(p_user);
  if p_action not in ('publish', 'reject', 'hide') or p_target not in ('review', 'reply') then raise exception 'Unknown action' using detail = 'إجراء غير معروف'; end if;
  if p_action in ('reject', 'hide') and (v_note is null or char_length(v_note) < 5) then raise exception 'Write a short note for the author'; end if;
  select * into r from product_reviews where id = p_review for update;
  if r.id is null then raise exception 'Review not found' using detail = 'لم يُعثر على التقييم'; end if;
  if p_target = 'review' then
    if p_action = 'publish' then
      if r.status = 'published' then return jsonb_build_object('status', 'published'); end if;
      if exists (select 1 from unnest(coalesce(p_photo_urls, '{}')) u where u !~ ('^https://[^/]+/storage/v1/object/public/catalogue/reviews/' || r.id || '/[A-Za-z0-9._-]+$')) then
        raise exception 'Review photos are published by the after-sale function';
      end if;
      update product_reviews set status = 'published', published_at = coalesce(published_at, now()), moderated_by = p_user, moderated_at = now(),
        moderation_note = v_note, photo_urls = coalesce(p_photo_urls, '{}') where id = r.id;
      perform private.notify_review(r.id, 'published');
    elsif p_action = 'reject' then
      if r.status <> 'pending' then raise exception 'This review is %', r.status; end if;
      update product_reviews set status = 'rejected', moderated_by = p_user, moderated_at = now(), moderation_note = v_note where id = r.id;
    else
      if r.status <> 'published' then raise exception 'This review is %', r.status; end if;
      update product_reviews set status = 'hidden', moderated_by = p_user, moderated_at = now(), moderation_note = v_note where id = r.id;
    end if;
    return jsonb_build_object('status', (select status from product_reviews where id = r.id));
  end if;
  select * into y from review_replies where review_id = r.id for update;
  if y.review_id is null then raise exception 'Reply not found'; end if;
  if p_action = 'publish' then
    if y.status = 'published' then return jsonb_build_object('status', 'published'); end if;
    update review_replies set status = 'published', published_at = coalesce(published_at, now()), moderated_by = p_user, moderated_at = now(), moderation_note = v_note
    where review_id = r.id;
    perform private.notify_review(r.id, 'reply');
  elsif p_action = 'reject' then
    if y.status <> 'pending' then raise exception 'This reply is %', y.status; end if;
    update review_replies set status = 'rejected', moderated_by = p_user, moderated_at = now(), moderation_note = v_note where review_id = r.id;
  else
    if y.status <> 'published' then raise exception 'This reply is %', y.status; end if;
    update review_replies set status = 'hidden', moderated_by = p_user, moderated_at = now(), moderation_note = v_note where review_id = r.id;
  end if;
  return jsonb_build_object('status', (select status from review_replies where review_id = r.id));
end $$;
revoke all on function mp_submit_review(uuid, jsonb) from public, anon, authenticated;
revoke all on function mp_reply_review(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function mp_moderate_review(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;

-- What the product page shows: published reviews of a live product, with the seller's reply.
create or replace function product_reviews_public(p_product uuid, p_sort text default 'recent', p_limit int default 10, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select pr.id from products pr
    where pr.id = p_product and pr.is_active and pr.listing_status = 'approved' and (pr.seller_id is null or private.seller_approved(pr.seller_id))),
  pub as (select r.* from product_reviews r join live on live.id = r.product_id where r.status = 'published')
  select jsonb_build_object(
    'count', (select count(*) from pub),
    'avg', (select round(avg(rating)::numeric, 2) from pub),
    'stars', (select jsonb_object_agg(g::text, (select count(*) from pub where rating = g)) from generate_series(1, 5) g),
    'reviews', coalesce((select jsonb_agg(x.j order by x.ord) from (
        select row_number() over (order by case when p_sort = 'highest' then -r.rating when p_sort = 'lowest' then r.rating else 0 end,
                                           case when p_sort = 'photos' then -cardinality(r.photo_urls) else 0 end, r.published_at desc, r.id) as ord,
               jsonb_build_object('id', r.id, 'author', r.author_name, 'rating', r.rating, 'title', r.title, 'body', r.body, 'lang', r.lang,
                 'photos', to_jsonb(r.photo_urls), 'published_at', r.published_at, 'verified', true,
                 'variant', (select i.variant_label from order_items i where i.id = r.order_item_id),
                 'reply', (select jsonb_build_object('body', y.body, 'published_at', y.published_at,
                             'by_en', coalesce((select s.name_en from sellers s where s.id = y.seller_id), 'Al Mukarramah'),
                             'by_ar', coalesce((select coalesce(s.name_ar, s.name_en) from sellers s where s.id = y.seller_id), 'المكرمة'))
                           from review_replies y where y.review_id = r.id and y.status = 'published')) as j
        from pub r order by 1
        limit least(greatest(coalesce(p_limit, 10), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb))
  where exists (select 1 from live);
$$;
grant execute on function product_reviews_public(uuid, text, int, int) to anon, authenticated;

-- The review page: the item, whether it can be reviewed, and the customer's own review.
create or replace function my_review_item(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i order_items;
  o orders;
  v_delivered timestamptz;
begin
  select * into i from order_items where id = p_item;
  select * into o from orders where id = i.order_id;
  if i.id is null or o.user_id is distinct from auth.uid() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  v_delivered := case when i.sub_order_id is not null then (select delivered_at from sub_orders where id = i.sub_order_id)
                      when o.status = 'delivered' then o.updated_at end;
  return jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'variant', i.variant_label, 'order_number', o.number, 'order_id', o.id),
    'product', (select jsonb_build_object('id', p.id, 'slug', p.slug, 'image', (p.images)[1], 'name_en', p.name_en, 'name_ar', p.name_ar) from products p where p.id = i.product_id),
    'delivered_at', v_delivered,
    'can_review', i.product_id is not null and v_delivered is not null
                  and v_delivered >= now() - make_interval(days => (select review_window_days from mp_settings where id = 1)),
    'review', (select jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'lang', r.lang, 'status', r.status,
                 'author', r.author_name, 'moderation_note', r.moderation_note, 'photos', to_jsonb(r.photos))
               from product_reviews r where r.order_item_id = i.id));
end $$;

create or replace function seller_reviews(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name_en', p.name_en, 'name_ar', p.name_ar),
      'author', r.author_name, 'rating', r.rating, 'title', r.title, 'body', r.body, 'lang', r.lang, 'photos', to_jsonb(r.photo_urls),
      'published_at', r.published_at,
      'reply', (select jsonb_build_object('body', y.body, 'status', y.status, 'moderation_note', y.moderation_note, 'published_at', y.published_at)
                from review_replies y where y.review_id = r.id))
    order by r.published_at desc)
    from product_reviews r join products p on p.id = r.product_id where r.seller_id = p_seller and r.status = 'published'), '[]'::jsonb);
end $$;

-- ================================================================ messages
create or replace function private.notify_message(p_thread uuid, p_from text, p_flagged_now boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  t message_threads;
  v jsonb;
  hour text := to_char(now(), 'YYYYMMDDHH24');
begin
  select * into t from message_threads where id = p_thread;
  v := jsonb_build_object('subject', t.subject, 'thread', t.id,
         'from', case when p_from = 'seller' then private.seller_label(t.seller_id) else private.bi('Al Mukarramah', 'المكرمة') end);
  if p_from = 'customer' then
    if t.seller_id is not null then
      perform private.notify('message_to_seller', jsonb_build_object('seller_id', t.seller_id), v, 'msg:' || t.id || ':seller:' || hour);
    else
      perform private.notify('message_to_staff', jsonb_build_object('staff_roles', array['owner', 'manager', 'support']), v, 'msg:' || t.id || ':staff:' || hour);
    end if;
  else
    perform private.notify('message_to_customer', jsonb_build_object('user_id', t.user_id), v, 'msg:' || t.id || ':customer:' || hour);
  end if;
  if p_flagged_now then
    perform private.notify('staff_message_flagged', jsonb_build_object('staff_roles', array['owner', 'manager', 'support']), v, 'flag:' || t.id);
  end if;
end $$;

-- Posts a message (server only: the after-sale function has masked it). Opens the conversation if needed: about a
-- return, an order (a parcel), a product before buying, or a question to Al Mukarramah.
-- p: {as: customer | seller | staff, thread_id | return_id | sub_order_id | product_id, subject, body, masked, flags}
create or replace function mp_post_message(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t message_threads;
  st mp_settings;
  s sub_orders;
  o orders;
  r return_requests;
  pr products;
  v_as text := coalesce(p ->> 'as', 'customer');
  v_body text := trim(coalesce(p ->> 'body', ''));
  v_subject text := nullif(left(trim(coalesce(p ->> 'subject', '')), 140), '');
  v_flags text[] := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p -> 'flags') = 'array' then p -> 'flags' else '[]'::jsonb end)), '{}');
  v_role text := coalesce(private.user_staff_role(p_user)::text, '');
  v_recent int;
  v_was_flagged boolean;
  mid bigint;
begin
  perform private.act_as(p_user);
  if v_as not in ('customer', 'seller', 'staff') then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if v_as <> 'staff' and not private.marketplace_open() then
    raise exception using message = 'Messages open soon: please contact us by email or WhatsApp for now', detail = 'ستتاح الرسائل قريبًا: تواصل معنا الآن عبر البريد أو واتساب';
  end if;
  if v_as = 'staff' and v_role not in ('owner', 'manager', 'support', 'operations') then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'Write a message (up to 2000 characters)' using detail = 'اكتب رسالة (حتى ٢٠٠٠ حرف)'; end if;
  select * into st from mp_settings where id = 1;
  select count(*) into v_recent from messages where sender_id = p_user and created_at > now() - interval '1 hour';
  if v_as <> 'staff' and v_recent >= st.messages_per_hour then raise exception 'You have sent a lot of messages in the last hour. Please try again a little later.' using detail = 'أرسلت رسائل كثيرة خلال الساعة الماضية. يُرجى المحاولة بعد قليل.'; end if;

  if nullif(p ->> 'thread_id', '') is not null then
    select * into t from message_threads where id = (p ->> 'thread_id')::uuid for update;
    if t.id is null then raise exception 'Conversation not found' using detail = 'لم يُعثر على المحادثة'; end if;
  elsif nullif(p ->> 'return_id', '') is not null then
    select * into r from return_requests where id = (p ->> 'return_id')::uuid;
    if r.id is null then raise exception 'Return not found' using detail = 'لم يُعثر على طلب الإرجاع'; end if;
    select * into t from message_threads where return_id = r.id for update;
    if t.id is null then
      select * into o from orders where id = r.order_id;
      insert into message_threads (user_id, seller_id, sub_order_id, return_id, subject)
      values (r.user_id, r.seller_id, r.sub_order_id, r.id, format('Return R-%s-%s', o.number, r.seq))
      on conflict do nothing returning * into t;
      if t.id is null then select * into t from message_threads where return_id = r.id; end if;
    end if;
  elsif nullif(p ->> 'sub_order_id', '') is not null then
    select * into s from sub_orders where id = (p ->> 'sub_order_id')::uuid;
    if s.id is null then raise exception 'Order not found' using detail = 'لم يُعثر على الطلب'; end if;
    select * into o from orders where id = s.order_id;
    if o.user_id is null then raise exception 'This order was placed without an account: our team will contact the customer' using detail = 'طُلب هذا الطلب دون حساب: سيتواصل فريقنا مع العميل'; end if;
    select * into t from message_threads where user_id = o.user_id and sub_order_id = s.id and return_id is null for update;
    if t.id is null then
      insert into message_threads (user_id, seller_id, sub_order_id, subject)
      values (o.user_id, s.seller_id, s.id, coalesce(v_subject, format('Order AM-%s-%s', o.number, s.seq)))
      on conflict do nothing returning * into t;
      if t.id is null then select * into t from message_threads where user_id = o.user_id and sub_order_id = s.id and return_id is null; end if;
    end if;
  elsif nullif(p ->> 'product_id', '') is not null then
    if v_as <> 'customer' then raise exception 'Only customers ask about a product' using detail = 'السؤال عن المنتج متاح للعملاء فقط'; end if;
    select * into pr from products where id = (p ->> 'product_id')::uuid and is_active and listing_status = 'approved'
      and (seller_id is null or private.seller_approved(seller_id));
    if pr.id is null then raise exception 'Product not found' using detail = 'لم يُعثر على المنتج'; end if;
    select * into t from message_threads where user_id = p_user and product_id = pr.id and sub_order_id is null and return_id is null for update;
    if t.id is null then
      insert into message_threads (user_id, seller_id, product_id, subject) values (p_user, pr.seller_id, pr.id, coalesce(v_subject, left(pr.name_en, 140)))
      on conflict do nothing returning * into t;
      if t.id is null then select * into t from message_threads where user_id = p_user and product_id = pr.id and sub_order_id is null and return_id is null; end if;
    end if;
  else
    if v_as <> 'customer' then raise exception 'Choose the conversation' using detail = 'اختر المحادثة'; end if;
    if v_subject is null or char_length(v_subject) < 2 then raise exception 'Add a subject' using detail = 'أضف عنوانًا للرسالة'; end if;
    insert into message_threads (user_id, seller_id, subject) values (p_user, null, v_subject) returning * into t;
  end if;

  -- who may write here
  if v_as = 'customer' and t.user_id <> p_user then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if v_as = 'seller' and (t.seller_id is null or not private.user_is_member(t.seller_id, p_user)) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;

  v_was_flagged := t.flagged;
  insert into messages (thread_id, sender, sender_id, body, masked, flags)
  values (t.id, v_as, p_user, v_body, greatest(coalesce((p ->> 'masked')::int, 0), 0), v_flags)
  returning id into mid;
  update message_threads set last_message_at = now(), last_sender = v_as, status = 'open', flagged = flagged or 'solicit' = any(v_flags),
    customer_read_at = case when v_as = 'customer' then now() else customer_read_at end,
    seller_read_at = case when v_as = 'seller' then now() else seller_read_at end
  where id = t.id;
  perform private.notify_message(t.id, v_as, 'solicit' = any(v_flags) and not v_was_flagged);
  return jsonb_build_object('thread_id', t.id, 'message_id', mid);
end $$;
revoke all on function mp_post_message(uuid, jsonb) from public, anon, authenticated;

create or replace function private.thread_json(t message_threads, p_side text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'subject', t.subject, 'status', t.status, 'last_message_at', t.last_message_at, 'last_sender', t.last_sender,
    'unread', case when p_side = 'customer' then t.last_sender is not null and t.last_sender <> 'customer' and (t.customer_read_at is null or t.customer_read_at < t.last_message_at)
                   when p_side = 'seller' then t.last_sender in ('customer', 'staff') and (t.seller_read_at is null or t.seller_read_at < t.last_message_at)
                   else false end,
    'seller', (select jsonb_build_object('name_en', s.name_en, 'name_ar', s.name_ar, 'slug', s.slug) from sellers s where s.id = t.seller_id and s.kind = 'marketplace'),
    'customer', case when p_side <> 'customer' then coalesce(private.public_name((select full_name from profiles pf where pf.id = t.user_id)), 'Customer') end,
    'product', (select jsonb_build_object('id', p.id, 'slug', p.slug, 'name_en', p.name_en, 'name_ar', p.name_ar) from products p where p.id = t.product_id),
    'order', (select format('AM-%s-%s', o.number, so.seq) from sub_orders so join orders o on o.id = so.order_id where so.id = t.sub_order_id),
    'order_id', (select so.order_id from sub_orders so where so.id = t.sub_order_id),
    'return', (select format('R-%s-%s', o.number, r.seq) from return_requests r join orders o on o.id = r.order_id where r.id = t.return_id),
    'preview', (select left(m.body, 140) from messages m where m.thread_id = t.id order by m.id desc limit 1),
    'flagged', case when p_side = 'staff' then t.flagged end);
$$;

-- The customer's conversations (p_seller null) or a seller's.
create or replace function mp_threads(p_seller uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if p_seller is not null and not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(private.thread_json(t, case when p_seller is null then 'customer' else 'seller' end) order by t.last_message_at desc nulls last)
                   from message_threads t where case when p_seller is null then t.user_id = auth.uid() else t.seller_id = p_seller end), '[]'::jsonb);
end $$;

create or replace function mp_thread(p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t message_threads;
  v_side text;
begin
  select * into t from message_threads where id = p_thread;
  if t.id is null then raise exception 'Conversation not found' using detail = 'لم يُعثر على المحادثة'; end if;
  v_side := case when t.user_id = auth.uid() then 'customer'
                 when t.seller_id is not null and private.is_seller_member(t.seller_id) then 'seller'
                 when private.is_staff(array['owner', 'manager', 'support', 'operations']::staff_role[]) then 'staff' end;
  if v_side is null then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return private.thread_json(t, v_side) || jsonb_build_object('side', v_side,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'masked', m.masked, 'at', m.created_at,
                   'mine', m.sender = v_side, 'flags', case when v_side = 'staff' then to_jsonb(m.flags) end) order by m.id), '[]'::jsonb)
                 from messages m where m.thread_id = t.id));
end $$;

create or replace function mp_mark_thread_read(p_thread uuid) returns void
language sql security definer set search_path = public as $$
  update message_threads set
    customer_read_at = case when user_id = auth.uid() then now() else customer_read_at end,
    seller_read_at = case when seller_id is not null and private.is_seller_member(seller_id) then now() else seller_read_at end
  where id = p_thread and (user_id = auth.uid() or (seller_id is not null and private.is_seller_member(seller_id)));
$$;

-- ================================================================ in-app notifications
create or replace function my_notifications(p_seller uuid default null, p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if p_seller is not null and not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return jsonb_build_object(
    'unread', (select count(*) from notification_outbox n where n.channel = 'in_app' and n.status <> 'cancelled' and n.send_after <= now() and n.read_at is null
               and case when p_seller is null then n.user_id = auth.uid() else n.seller_id = p_seller end),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'key', n.template_key, 'subject_en', n.subject_en, 'subject_ar', n.subject_ar,
               'body_en', n.body_en, 'body_ar', n.body_ar, 'link', n.link, 'at', n.send_after, 'read', n.read_at is not null) order by n.send_after desc, n.id desc)
             from (select * from notification_outbox n where n.channel = 'in_app' and n.status <> 'cancelled' and n.send_after <= now()
                   and case when p_seller is null then n.user_id = auth.uid() else n.seller_id = p_seller end
                   order by n.send_after desc, n.id desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) n), '[]'::jsonb));
end $$;

create or replace function mp_mark_notifications_read(p_ids bigint[] default null, p_seller uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if p_seller is not null and not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  update notification_outbox set read_at = now()
  where channel = 'in_app' and read_at is null and (p_ids is null or id = any(p_ids))
    and case when p_seller is null then user_id = auth.uid() else seller_id = p_seller end;
  get diagnostics n = row_count;
  return n;
end $$;

-- ================================================================ events that queue notifications (and book sales)
create or replace function private.on_order_paid() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status = 'pending_payment' and new.kind = 'shop' then
    perform private.notify('order_confirmed', jsonb_build_object('user_id', new.user_id, 'order_id', new.id),
      jsonb_build_object('order', new.number, 'order_id', new.id, 'total', private.money_text(new.total_minor, new.currency)), 'order:' || new.id || ':paid');
  end if;
  return new;
end $$;
create trigger notify_order_paid after update of status on orders for each row execute function private.on_order_paid();

create or replace function private.on_sub_order_status() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v jsonb;
  cust jsonb;
  i record;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into o from orders where id = new.order_id;
  cust := jsonb_build_object('user_id', o.user_id, 'order_id', o.id);
  v := jsonb_build_object('order', o.number, 'order_id', o.id, 'number', format('AM-%s-%s', o.number, new.seq), 'sub_order', new.id,
         'seller', private.seller_label(new.seller_id), 'ship_by', coalesce(new.ship_by::text, ''));
  if new.status = 'awaiting_acceptance' and new.seller_id is not null then
    perform private.notify('seller_new_order', jsonb_build_object('seller_id', new.seller_id),
      v || jsonb_build_object('city', coalesce(o.ship_to ->> 'city', ''),
             'items', (select private.bi(string_agg(x.quantity || ' × ' || x.name_en, ', ' order by x.name_en), string_agg(x.quantity || ' × ' || x.name_ar, '، ' order by x.name_en))
                       from order_items x where x.sub_order_id = new.id),
             'earning', private.money_text(new.items_minor - new.commission_minor, new.currency)),
      'sub:' || new.id || ':new');
  elsif new.status = 'in_production' then
    perform private.notify('parcel_in_production', cust, v, 'sub:' || new.id || ':production');
  elsif new.status = 'shipped' and old.status in ('accepted', 'in_production', 'ready_to_ship') then
    perform private.notify('parcel_shipped', cust,
      v || coalesce((select jsonb_build_object('tracking', h.tracking_number, 'carrier', coalesce(c.carrier_name, 'our courier'))
                     from shipments h left join carrier_services c on c.id = h.service_id
                     where h.sub_order_id = new.id order by h.created_at desc limit 1), '{}'::jsonb),
      'sub:' || new.id || ':shipped');
  elsif new.status = 'delivered' then
    perform private.notify('parcel_delivered', cust, v, 'sub:' || new.id || ':delivered');
    -- an invitation to review each item, in the app only, a few days later
    if o.user_id is not null then
      for i in select x.id, x.name_en, x.name_ar from order_items x where x.sub_order_id = new.id and x.product_id is not null loop
        perform private.notify('review_invite', jsonb_build_object('user_id', o.user_id),
          jsonb_build_object('product', private.bi(i.name_en, i.name_ar), 'item_id', i.id), 'review_invite:' || i.id, now() + interval '3 days');
      end loop;
    end if;
    perform private.book_sale(new.id);
  elsif new.status = 'delivery_failed' then
    perform private.notify('delivery_failed', cust, v, 'sub:' || new.id || ':failed');
    perform private.notify('staff_delivery_failed', jsonb_build_object('staff_roles', array['owner', 'manager', 'operations', 'support']), v, 'sub:' || new.id || ':failed:staff');
  elsif new.status = 'cancelled' and new.needs_refund then
    perform private.notify('parcel_cancelled', cust, v || jsonb_build_object('reason', coalesce(new.cancel_reason, '')), 'sub:' || new.id || ':cancelled');
    perform private.notify('staff_refund_needed', jsonb_build_object('staff_roles', array['owner', 'manager', 'finance', 'support']),
      v || jsonb_build_object('why', private.bi('The seller cancelled ' || (v ->> 'number') || '.', 'ألغى البائع الطلب ' || (v ->> 'number') || '.')),
      'sub:' || new.id || ':refund');
  end if;
  return new;
end $$;
create trigger sub_orders_events after update of status on sub_orders for each row execute function private.on_sub_order_status();

create or replace function private.on_shipment_status() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s sub_orders;
  o orders;
begin
  if new.status = 'out_for_delivery' and old.status is distinct from 'out_for_delivery' then
    select * into s from sub_orders where id = new.sub_order_id;
    select * into o from orders where id = s.order_id;
    perform private.notify('parcel_out_for_delivery', jsonb_build_object('user_id', o.user_id, 'order_id', o.id),
      jsonb_build_object('number', format('AM-%s-%s', o.number, s.seq), 'order_id', o.id), 'ship:' || new.id || ':ofd');
  end if;
  return new;
end $$;
create trigger shipments_events after update of status on shipments for each row execute function private.on_shipment_status();

create or replace function private.on_seller_review_event() returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if not new.visible_to_seller then return new; end if;
  k := case new.kind when 'approved' then 'seller_approved' when 'info_requested' then 'seller_info_requested' when 'rejected' then 'seller_rejected'
                     when 'suspended' then 'seller_suspended' when 'reinstated' then 'seller_reinstated' end;
  if k is not null then
    perform private.notify(k, jsonb_build_object('seller_id', new.seller_id),
      (select jsonb_build_object('shop', private.bi(s.name_en, s.name_ar)) from sellers s where s.id = new.seller_id), 'seller_event:' || new.id);
  end if;
  return new;
end $$;
create trigger seller_review_events_notify after insert on seller_review_events for each row execute function private.on_seller_review_event();

create or replace function private.on_listing_decision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is not null and new.listing_status is distinct from old.listing_status and new.listing_status in ('approved', 'rejected') then
    perform private.notify(case when new.listing_status = 'approved' then 'seller_listing_approved' else 'seller_listing_rejected' end,
      jsonb_build_object('seller_id', new.seller_id), jsonb_build_object('product', private.bi(new.name_en, new.name_ar), 'product_id', new.id),
      'listing:' || new.id || ':' || new.listing_status || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
  end if;
  return new;
end $$;
create trigger products_listing_events after update of listing_status on products for each row execute function private.on_listing_decision();

-- ================================================================ performance
-- Over the window: late shipments (of those that shipped or were due), seller cancellations, returns for a problem (not
-- a change of mind) of what was delivered, the average rating, and the typical time to answer a customer.
create or replace function private.seller_performance(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  st mp_settings;
  th jsonb;
  since timestamptz;
  today date := private.riyadh_today();
  v_orders int; v_due int; v_late int; v_cancel int; v_delivered int; v_returns int; v_reviews int;
  v_rating int; v_response numeric;
  late_bps int; cancel_bps int; return_bps int;
  s_late text; s_cancel text; s_return text; s_rating text; overall text;
begin
  select * into st from mp_settings where id = 1;
  th := st.perf_thresholds;
  since := now() - make_interval(days => st.perf_window_days);
  select count(*),
         count(*) filter (where ship_by is not null and (shipped_at is not null or (ship_by < today and status in ('accepted', 'in_production', 'ready_to_ship')))),
         count(*) filter (where ship_by is not null and ((shipped_at is not null and (shipped_at at time zone 'Asia/Riyadh')::date > ship_by)
                                                       or (shipped_at is null and ship_by < today and status in ('accepted', 'in_production', 'ready_to_ship')))),
         count(*) filter (where status = 'cancelled' and cancelled_by = 'seller'),
         count(*) filter (where delivered_at is not null)
    into v_orders, v_due, v_late, v_cancel, v_delivered
  from sub_orders where seller_id = p_seller and status <> 'pending_payment' and created_at >= since;
  select count(distinct r.sub_order_id) into v_returns from return_requests r join sub_orders s on s.id = r.sub_order_id
  where r.seller_id = p_seller and s.created_at >= since and r.status in ('approved', 'refunded') and r.reason <> 'changed_mind';
  select count(*), round(avg(rating) * 100) into v_reviews, v_rating from product_reviews where seller_id = p_seller and status = 'published' and published_at >= since;
  select percentile_cont(0.5) within group (order by extract(epoch from (rep.at - q.at)) / 3600) into v_response
  from (select m.thread_id, m.created_at as at from messages m join message_threads t on t.id = m.thread_id
        where t.seller_id = p_seller and m.sender = 'customer' and m.created_at >= since) q
  cross join lateral (select m2.created_at as at from messages m2 where m2.thread_id = q.thread_id and m2.sender = 'seller' and m2.created_at > q.at
                      order by m2.id limit 1) rep;
  late_bps := case when v_due > 0 then round(v_late * 10000.0 / v_due) end;
  cancel_bps := case when v_orders > 0 then round(v_cancel * 10000.0 / v_orders) end;
  return_bps := case when v_delivered > 0 then round(v_returns * 10000.0 / v_delivered) end;
  s_late := case when late_bps is null then 'ok' when late_bps >= (th -> 'late_shipment_bps' ->> 'suspend')::int then 'suspend'
                 when late_bps >= (th -> 'late_shipment_bps' ->> 'warn')::int then 'warn' else 'ok' end;
  s_cancel := case when cancel_bps is null then 'ok' when cancel_bps >= (th -> 'cancellation_bps' ->> 'suspend')::int then 'suspend'
                   when cancel_bps >= (th -> 'cancellation_bps' ->> 'warn')::int then 'warn' else 'ok' end;
  s_return := case when return_bps is null then 'ok' when return_bps >= (th -> 'return_bps' ->> 'suspend')::int then 'suspend'
                   when return_bps >= (th -> 'return_bps' ->> 'warn')::int then 'warn' else 'ok' end;
  s_rating := case when v_rating is null or v_reviews < 3 then 'ok' when v_rating <= (th -> 'rating_x100' ->> 'suspend')::int then 'suspend'
                   when v_rating <= (th -> 'rating_x100' ->> 'warn')::int then 'warn' else 'ok' end;
  overall := case when v_orders < coalesce((th ->> 'min_orders')::int, 10) then 'new'
                  when 'suspend' in (s_late, s_cancel, s_return, s_rating) then 'suspend'
                  when 'warn' in (s_late, s_cancel, s_return, s_rating) then 'warn' else 'ok' end;
  return jsonb_build_object(
    'seller_id', p_seller, 'window_days', st.perf_window_days, 'status', overall, 'orders', v_orders, 'min_orders', coalesce((th ->> 'min_orders')::int, 10),
    'auto_suspend', st.perf_auto_suspend,
    'metrics', jsonb_build_object(
      'late_shipment', jsonb_build_object('bps', late_bps, 'count', v_late, 'of', v_due, 'status', s_late, 'warn', th -> 'late_shipment_bps' -> 'warn', 'limit', th -> 'late_shipment_bps' -> 'suspend'),
      'cancellation', jsonb_build_object('bps', cancel_bps, 'count', v_cancel, 'of', v_orders, 'status', s_cancel, 'warn', th -> 'cancellation_bps' -> 'warn', 'limit', th -> 'cancellation_bps' -> 'suspend'),
      'returns', jsonb_build_object('bps', return_bps, 'count', v_returns, 'of', v_delivered, 'status', s_return, 'warn', th -> 'return_bps' -> 'warn', 'limit', th -> 'return_bps' -> 'suspend'),
      'rating', jsonb_build_object('x100', v_rating, 'count', v_reviews, 'status', s_rating, 'warn', th -> 'rating_x100' -> 'warn', 'limit', th -> 'rating_x100' -> 'suspend'),
      'response_hours', jsonb_build_object('median', round(v_response, 1))));
end $$;

create or replace function mp_seller_performance(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (private.is_seller_member(p_seller) or private.is_staff_or_server()) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return private.seller_performance(p_seller);
end $$;

create or replace function admin_seller_performance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(private.seller_performance(s.id) || jsonb_build_object('name_en', s.name_en, 'slug', s.slug, 'seller_status', s.status, 'kind', s.kind)
                                    order by s.name_en)
                   from sellers s where s.status in ('approved', 'suspended')), '[]'::jsonb);
end $$;

-- Warns sellers below the standard (weekly at most) and tells our team; suspends only if perf_auto_suspend is on.
-- Run by our team or a scheduled job (service role).
create or replace function mp_performance_review() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  perf jsonb;
  week text := to_char(now(), 'IYYY-IW');
  v_auto boolean := (select perf_auto_suspend from mp_settings where id = 1);
  warned int := 0;
  suspended int := 0;
  summary_en text;
  summary_ar text;
begin
  -- owner or manager, a server function (service role) or a scheduled job in the database (no request at all)
  if not private.is_staff_or_server(array['owner', 'manager']::staff_role[]) then
    raise exception 'Not allowed' using detail = 'غير مسموح';
  end if;
  for s in select id, name_en, name_ar, status from sellers where status = 'approved' loop
    perf := private.seller_performance(s.id);
    if perf ->> 'status' not in ('warn', 'suspend') then continue; end if;
    select string_agg(x.en, '; '), string_agg(x.ar, '؛ ') into summary_en, summary_ar from (
      select case k when 'late_shipment' then 'late shipments ' when 'cancellation' then 'cancellations ' when 'returns' then 'returns for a problem ' else 'average rating ' end
               || case when k = 'rating' then to_char((perf -> 'metrics' -> k ->> 'x100')::numeric / 100, 'FM0.0') else to_char((perf -> 'metrics' -> k ->> 'bps')::numeric / 100, 'FM990.0') || '%' end as en,
             case k when 'late_shipment' then 'التأخر في الشحن ' when 'cancellation' then 'الإلغاءات ' when 'returns' then 'الإرجاع بسبب مشكلة ' else 'متوسط التقييم ' end
               || case when k = 'rating' then to_char((perf -> 'metrics' -> k ->> 'x100')::numeric / 100, 'FM0.0') else to_char((perf -> 'metrics' -> k ->> 'bps')::numeric / 100, 'FM990.0') || '٪' end as ar
      from unnest(array['late_shipment', 'cancellation', 'returns', 'rating']) k where perf -> 'metrics' -> k ->> 'status' in ('warn', 'suspend')) x;
    perform private.notify('seller_performance_warning', jsonb_build_object('seller_id', s.id),
      jsonb_build_object('days', perf ->> 'window_days', 'summary', private.bi(summary_en, summary_ar)), 'perf:' || s.id || ':' || week);
    warned := warned + 1;
    if perf ->> 'status' = 'suspend' then
      perform private.notify('staff_performance_at_risk', jsonb_build_object('staff_roles', array['owner', 'manager']),
        jsonb_build_object('shop', private.bi(s.name_en, s.name_ar), 'summary', private.bi(summary_en, summary_ar)), 'perf:' || s.id || ':' || week || ':staff');
      if v_auto then
        update sellers set status = 'suspended' where id = s.id;
        insert into seller_review_events (seller_id, actor, kind, message)
        values (s.id, auth.uid(), 'suspended', 'Paused automatically because the shop is below our standard: ' || summary_en || '. Our team will contact you.');
        suspended := suspended + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('warned', warned, 'suspended', suspended);
end $$;
revoke all on function mp_performance_review() from public, anon;
grant execute on function mp_performance_review() to authenticated, service_role;

-- ================================================================ the customer's order page, with returns and reviews
create or replace function my_order_tracking(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o orders;
  st mp_settings;
begin
  select * into o from orders where id = p_order;
  if o.id is null or not (o.user_id = auth.uid() or private.is_staff()) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into st from mp_settings where id = 1;
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'currency', o.currency, 'total_minor', o.total_minor,
               'shipping_minor', o.shipping_minor, 'duties_minor', o.duties_minor, 'refunded_minor', o.refunded_minor, 'paid_at', o.paid_at, 'created_at', o.created_at,
               'ship_to', jsonb_build_object('recipient_name', o.ship_to ->> 'recipient_name', 'city', o.ship_to ->> 'city', 'country', o.ship_to ->> 'country')),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('status', f.status, 'amount_minor', f.amount_minor, 'currency', f.currency, 'created_at', f.created_at,
                  'completed_at', f.completed_at, 'credit_note', (select i.number from invoices i where i.id = f.credit_note_id)) order by f.created_at), '[]'::jsonb)
                from refunds f where f.order_id = o.id and f.status <> 'failed'),
    'faulty_claim_days', st.faulty_claim_days,
    'sub_orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'number', format('AM-%s-%s', o.number, s.seq), 'status', s.status, 'kind', s.kind,
        'seller', (select jsonb_build_object('slug', x.slug, 'name_en', x.name_en, 'name_ar', x.name_ar) from sellers x where x.id = s.seller_id and x.kind = 'marketplace'),
        'items_minor', s.items_minor, 'shipping_minor', s.shipping_minor, 'duties_minor', s.duties_minor, 'duties_mode', s.duties_mode, 'refunded_minor', s.refunded_minor,
        'days_min', s.days_min, 'days_max', s.days_max, 'production_days', s.production_days, 'ship_by', s.ship_by,
        'expected_from', coalesce(s.accepted_at, o.paid_at)::date + s.days_min,
        'expected_to', coalesce(s.accepted_at, o.paid_at)::date + s.days_max,
        'cancel_reason', s.cancel_reason, 'shipped_at', s.shipped_at, 'delivered_at', s.delivered_at,
        'problem_until', case when s.delivered_at is not null then (s.delivered_at + make_interval(days => st.faulty_claim_days))::date end,
        'not_received_from', case when s.status in ('ready_to_ship', 'shipped', 'delivery_failed') then coalesce(s.accepted_at, o.paid_at)::date + coalesce(s.days_max, 10) + 3 end,
        'thread_id', (select t.id from message_threads t where t.sub_order_id = s.id and t.user_id = o.user_id and t.return_id is null),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar, 'variant', i.variant_label, 'quantity', i.quantity,
                   'line_total_minor', i.line_total_minor, 'return_policy', i.return_policy, 'return_window_days', i.return_window_days, 'product_id', i.product_id,
                   'refunded_quantity', i.refunded_quantity, 'returnable_quantity', greatest(i.quantity - private.line_taken(i.id), 0),
                   'change_mind_until', case when s.delivered_at is not null and coalesce(i.return_policy, 'standard') in ('standard', 'unopened_only')
                                             then (s.delivered_at + make_interval(days => coalesce(i.return_window_days, st.default_return_window_days)))::date end,
                   'review', (select jsonb_build_object('id', rv.id, 'status', rv.status, 'rating', rv.rating) from product_reviews rv where rv.order_item_id = i.id))
                   order by i.name_en), '[]'::jsonb)
                  from order_items i where i.sub_order_id = s.id),
        'returns', (select coalesce(jsonb_agg(private.return_json(r.id, 'customer') order by r.created_at), '[]'::jsonb) from return_requests r where r.sub_order_id = s.id),
        'shipments', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'tracking_number', h.tracking_number, 'tracking_url', h.tracking_url,
                        'carrier', (select c.carrier_name from carrier_services c where c.id = h.service_id),
                        'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.occurred_at, 'en', e.description_en, 'ar', e.description_ar, 'location', e.location)
                                   order by e.occurred_at desc), '[]'::jsonb) from shipment_events e where e.shipment_id = h.id))
                      order by h.created_at desc), '[]'::jsonb) from shipments h where h.sub_order_id = s.id)
      ) order by s.seq), '[]'::jsonb) from sub_orders s where s.order_id = o.id));
end $$;

-- ================================================================ our team's queues
create or replace function admin_returns(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server(array['owner', 'manager', 'support', 'operations', 'finance']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(private.return_json(r.id, 'staff') order by r.created_at desc)
                   from return_requests r where p_status is null or r.status = p_status), '[]'::jsonb);
end $$;

create or replace function admin_refund_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server(array['owner', 'manager', 'finance', 'support']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return jsonb_build_object(
    'returns', (select coalesce(jsonb_agg(private.return_json(r.id, 'staff') order by r.approved_at), '[]'::jsonb) from return_requests r where r.status = 'approved'),
    'cancelled', (select coalesce(jsonb_agg(jsonb_build_object('sub_order_id', s.id, 'number', format('AM-%s-%s', o.number, s.seq), 'order_id', o.id,
                    'order_number', o.number, 'seller', (select x.name_en from sellers x where x.id = s.seller_id), 'cancel_reason', s.cancel_reason,
                    'cancelled_at', s.cancelled_at, 'currency', s.currency,
                    'amount_minor', s.items_minor + s.shipping_minor + s.duties_minor - s.refunded_minor) order by s.cancelled_at), '[]'::jsonb)
                  from sub_orders s join orders o on o.id = s.order_id where s.needs_refund),
    'credit_notes', (select coalesce(jsonb_agg(private.refund_json(f.id) order by f.created_at), '[]'::jsonb) from refunds f where f.credit_note_status = 'pending'),
    'stuck', (select coalesce(jsonb_agg(private.refund_json(f.id) order by f.created_at), '[]'::jsonb) from refunds f
              where f.status = 'processing'),
    'recent', (select coalesce(jsonb_agg(private.refund_json(x.id) order by x.created_at desc), '[]'::jsonb)
               from (select id, created_at from refunds order by created_at desc limit 20) x));
end $$;

create or replace function admin_reviews(p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server(array['owner', 'manager', 'marketing', 'support']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return jsonb_build_object(
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'rating', r.rating, 'title', r.title, 'body', r.body, 'lang', r.lang, 'author', r.author_name, 'flags', to_jsonb(r.flags),
        'moderation_note', r.moderation_note, 'created_at', r.created_at, 'published_at', r.published_at,
        'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name_en', p.name_en),
        'seller', (select x.name_en from sellers x where x.id = r.seller_id),
        'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'bucket', a.bucket, 'path', a.path, 'status', a.status)), '[]'::jsonb)
                   from media_assets a where a.id = any(r.photos)))
      order by r.created_at), '[]'::jsonb)
      from product_reviews r join products p on p.id = r.product_id where p_status is null or r.status = p_status),
    'replies', (select coalesce(jsonb_agg(jsonb_build_object('review_id', y.review_id, 'status', y.status, 'body', y.body, 'flags', to_jsonb(y.flags),
        'created_at', y.created_at, 'seller', (select x.name_en from sellers x where x.id = y.seller_id),
        'review', jsonb_build_object('rating', r.rating, 'title', r.title, 'body', r.body, 'author', r.author_name), 'product', p.name_en) order by y.created_at), '[]'::jsonb)
      from review_replies y join product_reviews r on r.id = y.review_id join products p on p.id = r.product_id where p_status is null or y.status = p_status));
end $$;

create or replace function admin_payouts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server(array['owner', 'manager', 'finance']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name_en', s.name_en, 'slug', s.slug, 'country', s.country, 'status', s.status, 'kind', s.kind,
      'kyc_status', p.kyc_status, 'iban_last4', nullif(right(upper(regexp_replace(coalesce(p.iban, ''), '\s', '', 'g')), 4), ''),
      'last_payout', (select jsonb_build_object('amount_sar_minor', x.amount_sar_minor, 'paid_on', x.paid_on, 'reference', x.reference)
                      from seller_payouts x where x.seller_id = s.id and x.status = 'paid' order by x.paid_on desc, x.created_at desc limit 1))
      || private.ledger_available(s.id) order by s.name_en)
    from sellers s left join seller_private p on p.seller_id = s.id
    where s.status in ('approved', 'suspended') or exists (select 1 from seller_ledger l where l.seller_id = s.id)), '[]'::jsonb);
end $$;

create or replace function admin_threads(p_flagged boolean default true) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff_or_server(array['owner', 'manager', 'support', 'operations']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(private.thread_json(t, 'staff') order by t.last_message_at desc nulls last)
                   from (select * from message_threads where (not p_flagged or flagged) order by last_message_at desc nulls last limit 200) t), '[]'::jsonb);
end $$;

-- ================================================================ function grants
-- Helpers in the private schema that write (statements, notifications, ratings) or read across accounts are run only
-- by the functions above, never by the API roles (review L2). (Helpers used by row-level security policies and by the
-- guards that run as the person stay executable: is_staff, is_seller_member, review_author, the switches, ...)
do $$
declare f text;
begin
  foreach f in array array['private.book_sale(uuid)', 'private.book_refund(uuid, uuid)', 'private.refresh_rating(uuid)',
    'private.notify_return(uuid, text)', 'private.notify_message(uuid, text, boolean)', 'private.notify_review(uuid, text)',
    'private.ledger_available(uuid)', 'private.refund_json(uuid)', 'private.return_json(uuid, text)', 'private.thread_json(message_threads, text)',
    'private.seller_performance(uuid)', 'private.line_taken(uuid, uuid)', 'private.user_staff_role(uuid)', 'private.user_is_member(uuid, uuid)',
    'private.is_staff_or_server(staff_role[])', 'private.order_fx(uuid)', 'private.render(text, jsonb, text)', 'private.seller_label(uuid)',
    'private.set_listing_review(uuid, jsonb)', 'private.act_as(uuid)', 'private.asset_of(text, uuid)', 'private.seller_may_list(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Supabase gives new functions to the API roles; these are for signed-in people only (each checks who is asking).
do $$
declare f text;
begin
  foreach f in array array['seller_balance(uuid)', 'seller_statement(uuid, date)', 'mp_record_payout(uuid, integer, text, date, text)',
    'mp_reverse_payout(uuid, text)', 'mp_ledger_adjust(uuid, integer, text)', 'seller_returns(uuid)', 'my_review_item(uuid)', 'seller_reviews(uuid)',
    'mp_threads(uuid)', 'mp_thread(uuid)', 'mp_mark_thread_read(uuid)', 'my_notifications(uuid, integer)', 'mp_mark_notifications_read(bigint[], uuid)',
    'mp_seller_performance(uuid)', 'admin_seller_performance()', 'my_order_tracking(uuid)', 'admin_returns(text)', 'admin_refund_queue()',
    'admin_reviews(text)', 'admin_payouts()', 'admin_threads(boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ================================================================ customers' photos (review and return photos)
-- A customer's photo is screened (the AI costs money) only with an order that can have one (server only; review L5):
-- a review photo for an item delivered within the review window, a return photo for a parcel delivered within the
-- problem window or overdue. And only while the marketplace is open (review M6).
create or replace function mp_customer_may_upload(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select private.marketplace_open() and exists (
    select 1 from sub_orders s join orders o on o.id = s.order_id, mp_settings st
    where st.id = 1 and o.user_id = p_user
      and case p_kind
        when 'review_photo' then s.delivered_at > now() - make_interval(days => st.review_window_days)
        when 'return_photo' then s.delivered_at > now() - make_interval(days => st.faulty_claim_days)
                                 or s.status in ('ready_to_ship', 'shipped', 'delivery_failed')
        else false end);
$$;
revoke all on function mp_customer_may_upload(uuid, text) from public, anon, authenticated;
-- PRIVATE. Customers add files only under <their user id>/incoming/; screen-image checks each one and keeps it under
-- <user id>/media/. The customer, our team and (for a return) the seller can open them; published review photos are
-- copied to the public catalogue by the after-sale function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-uploads', 'customer-uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create or replace function private.can_read_customer_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = coalesce(auth.uid()::text, '-')
      or private.is_staff(array['owner', 'manager', 'support', 'operations', 'marketing']::staff_role[])
      or exists (select 1 from media_assets a join return_requests r on a.id = any(r.photos)
                 where a.bucket = 'customer-uploads' and a.path = p_name and r.seller_id is not null and private.is_seller_member(r.seller_id));
$$;
create policy "customers upload to their incoming folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-uploads' and (storage.foldername(name))[1] = auth.uid()::text
              and (storage.foldername(name))[2] = 'incoming' and array_length(storage.foldername(name), 1) = 2);
create policy "customers, sellers of the return and staff read customer photos" on storage.objects for select to authenticated
  using (bucket_id = 'customer-uploads' and private.can_read_customer_file(name));
create policy "customers delete their incoming files" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-uploads' and (storage.foldername(name))[1] = auth.uid()::text and (storage.foldername(name))[2] = 'incoming');

-- ================================================================ the templates (service messages only)
insert into notification_templates (key, audience, channels, subject_en, subject_ar, body_en, body_ar, link) values
-- customers
('order_confirmed', 'customer', '{email,in_app}',
 'Your order AM-{{order}} is confirmed', 'تم تأكيد طلبك AM-{{order}}',
 'Thank you for your order. We have received your payment of {{total}} and will tell you as each parcel is on its way.',
 'شكرًا لطلبك. استلمنا دفعتك بقيمة {{total}}، وسنخبرك عند شحن كل طرد.', '/order?id={{order_id}}'),
('parcel_in_production', 'customer', '{email,in_app}',
 '{{seller}} has started making your order', 'بدأ {{seller}} تنفيذ طلبك',
 'The made-to-measure pieces in {{number}} are being made. They should be ready to ship by {{ship_by}}.',
 'بدأ تنفيذ القطع المفصّلة في الطلب {{number}}، ويُتوقع أن تكون جاهزة للشحن بحلول {{ship_by}}.', '/order?id={{order_id}}'),
('parcel_shipped', 'customer', '{email,push,in_app}',
 'Your parcel {{number}} is on its way', 'طردك {{number}} في الطريق إليك',
 '{{carrier}} has collected it. Tracking number: {{tracking}}. You can follow it from your order page.',
 'استلمه {{carrier}}. رقم التتبع: {{tracking}}. يمكنك متابعته من صفحة طلبك.', '/order?id={{order_id}}'),
('parcel_out_for_delivery', 'customer', '{push,in_app}',
 'Your parcel arrives today', 'يصلك طردك اليوم',
 'Parcel {{number}} is out for delivery.', 'خرج الطرد {{number}} للتوصيل.', '/order?id={{order_id}}'),
('parcel_delivered', 'customer', '{email,in_app}',
 'Your parcel {{number}} was delivered', 'تم توصيل طردك {{number}}',
 'We hope it brings barakah to your home. If something is not right, you can ask for a return or report a problem from your order page.',
 'نسأل الله أن يجعل فيه البركة لبيتك. وإن لم يكن شيء كما ينبغي، يمكنك طلب إرجاع أو الإبلاغ عن مشكلة من صفحة طلبك.', '/order?id={{order_id}}'),
('delivery_failed', 'customer', '{email,in_app}',
 'We could not deliver parcel {{number}}', 'تعذّر توصيل الطرد {{number}}',
 'The courier could not deliver your parcel. Our team will contact you to arrange delivery.',
 'لم يتمكن المندوب من توصيل طردك، وسيتواصل معك فريقنا لترتيب التوصيل.', '/order?id={{order_id}}'),
('parcel_cancelled', 'customer', '{email,in_app}',
 'Part of your order AM-{{order}} was cancelled', 'أُلغي جزء من طلبك AM-{{order}}',
 '{{seller}} could not fulfil {{number}}: {{reason}} We will refund you for it.',
 'تعذّر على {{seller}} تنفيذ الطلب {{number}}: {{reason}} وسنعيد إليك المبلغ.', '/order?id={{order_id}}'),
('review_invite', 'customer', '{in_app}',
 'How do you find {{product}}?', 'ما رأيك في {{product}}؟',
 'Share a review to help other customers choose. Only customers who bought it can review it.',
 'شاركنا رأيك لتساعد غيرك على الاختيار. لا يقيّم المنتج إلا من اشتراه.', '/review?item={{item_id}}'),
('return_requested', 'customer', '{email,in_app}',
 'We have your return request {{return}}', 'استلمنا طلب الإرجاع {{return}}',
 '{{seller}} will answer by {{respond_by}}. We will let you know as soon as they do.',
 'سيرد {{seller}} قبل {{respond_by}}، وسنخبرك فور الرد.', '/order?id={{order_id}}'),
('return_accepted', 'customer', '{email,in_app}',
 'Your return {{return}} is accepted', 'قُبل طلب الإرجاع {{return}}',
 'Please send the items back as explained on your order page. We will refund you once they arrive.',
 'يرجى إعادة المنتجات كما هو موضح في صفحة طلبك، وسنعيد إليك المبلغ عند وصولها.', '/order?id={{order_id}}'),
('return_approved', 'customer', '{email,in_app}',
 'Your refund for {{return}} is approved', 'تمت الموافقة على استرداد مبلغ الطلب {{return}}',
 'Our team will issue the refund shortly, and you will receive a confirmation.',
 'سيصدر فريقنا المبلغ المسترد قريبًا، وستصلك رسالة تأكيد.', '/order?id={{order_id}}'),
('return_declined', 'customer', '{email,in_app}',
 'About your return {{return}}', 'بخصوص طلب الإرجاع {{return}}',
 '{{seller}} could not accept your request. You can read why on your order page and, if you disagree, ask Al Mukarramah to decide within {{days}} days.',
 'لم يتمكن {{seller}} من قبول طلبك. يمكنك الاطلاع على السبب في صفحة طلبك، وإن لم توافق فاطلب من المكرمة البتّ فيه خلال {{days}} أيام.', '/order?id={{order_id}}'),
('return_rejected', 'customer', '{email,in_app}',
 'Our decision on your return {{return}}', 'قرارنا بشأن طلب الإرجاع {{return}}',
 'We have looked at your request carefully and cannot approve it. You can read our reasons on your order page.',
 'راجعنا طلبك بعناية ولا يمكننا الموافقة عليه. يمكنك الاطلاع على الأسباب في صفحة طلبك.', '/order?id={{order_id}}'),
('refund_issued', 'customer', '{email,in_app}',
 'Your refund of {{amount}}', 'استرداد مبلغ {{amount}}',
 'We have refunded {{amount}} for order AM-{{order}} to your original payment method. It may take a few working days to appear, depending on your bank.',
 'أعدنا {{amount}} عن الطلب AM-{{order}} إلى وسيلة الدفع الأصلية. قد يستغرق ظهوره بضعة أيام عمل بحسب البنك.', '/order?id={{order_id}}'),
('message_to_customer', 'customer', '{email,in_app}',
 'New message from {{from}}', 'رسالة جديدة من {{from}}',
 'You have a new message about "{{subject}}". Reply on Al Mukarramah: for your safety, keep conversations and payments on the platform.',
 'لديك رسالة جديدة بخصوص "{{subject}}". ردّ عبر المكرمة، وحفاظًا على أمانك أبقِ المحادثات والمدفوعات داخل المنصة.', '/messages?thread={{thread}}'),
('review_published', 'customer', '{in_app}',
 'Your review is live', 'نُشر تقييمك',
 'Thank you for reviewing {{product}}.', 'شكرًا لتقييمك {{product}}.', '/product/{{slug}}'),
('review_reply', 'customer', '{in_app}',
 '{{seller}} replied to your review', 'ردّ {{seller}} على تقييمك',
 'See the reply on the page of {{product}}.', 'اطّلع على الرد في صفحة {{product}}.', '/product/{{slug}}'),
-- sellers
('seller_new_order', 'seller', '{email,push,in_app}',
 'New order {{number}}', 'طلب جديد {{number}}',
 'A customer in {{city}} ordered {{items}}. Please accept it and prepare it for our courier. You receive {{earning}} after commission.',
 'طلب عميل في {{city}}: {{items}}. يرجى قبول الطلب وتجهيزه لمندوبنا. صافي ما تستلمه بعد العمولة: {{earning}}.', '/seller/orders'),
('seller_return_requested', 'seller', '{email,in_app}',
 'Return request {{return}}', 'طلب إرجاع {{return}}',
 'A customer asked to return items from {{number}} ({{reason}}). Please answer by {{respond_by}}.',
 'طلب عميل إرجاع منتجات من الطلب {{number}} ({{reason}}). يرجى الرد قبل {{respond_by}}.', '/seller/returns'),
('seller_return_escalated', 'seller', '{email,in_app}',
 'Al Mukarramah will decide on return {{return}}', 'ستبتّ المكرمة في طلب الإرجاع {{return}}',
 'The customer asked our team to decide. You can add anything we should know in the return''s messages.',
 'طلب العميل من فريقنا البتّ في الطلب. يمكنك إضافة ما ينبغي أن نعرفه في رسائل طلب الإرجاع.', '/seller/returns'),
('seller_return_decided', 'seller', '{email,in_app}',
 'Decision on return {{return}}', 'القرار بشأن طلب الإرجاع {{return}}',
 'Our team has {{decision}} the return. The details are on your returns page.',
 'قرر فريقنا {{decision}} طلب الإرجاع. التفاصيل في صفحة طلبات الإرجاع.', '/seller/returns'),
('seller_refund_recorded', 'seller', '{in_app}',
 'Refund on {{number}}', 'استرداد على الطلب {{number}}',
 '{{amount}} was refunded to the customer. Your statement shows the change.',
 'أُعيد {{amount}} إلى العميل، ويظهر التعديل في كشف حسابك.', '/seller/statements'),
('seller_review_new', 'seller', '{in_app}',
 'A new review of {{product}}', 'تقييم جديد على {{product}}',
 'A customer gave {{rating}} out of 5. You can reply from Reviews.', 'منح عميل {{rating}} من 5. يمكنك الرد من صفحة التقييمات.', '/seller/reviews'),
('message_to_seller', 'seller', '{email,in_app}',
 'New message from a customer', 'رسالة جديدة من عميل',
 'A customer wrote about "{{subject}}". Please reply within one working day.', 'كتب عميل بخصوص "{{subject}}". يرجى الرد خلال يوم عمل واحد.', '/seller/messages?thread={{thread}}'),
('seller_payout_recorded', 'seller', '{email,in_app}',
 'Payout of {{amount}} sent', 'تم تحويل {{amount}}',
 'We transferred {{amount}} to your account ending {{iban4}} on {{date}} (reference {{reference}}).',
 'حوّلنا {{amount}} إلى حسابك المنتهي بـ {{iban4}} بتاريخ {{date}} (المرجع {{reference}}).', '/seller/statements'),
('seller_approved', 'seller', '{email,in_app}',
 'Welcome to Al Mukarramah', 'أهلًا بك في المكرمة',
 '{{shop}} is approved. You can now add listings in your approved categories.',
 'تمت الموافقة على {{shop}}، ويمكنك الآن إضافة منتجاتك في الفئات المعتمدة لك.', '/seller'),
('seller_info_requested', 'seller', '{email,in_app}',
 'We need a little more about {{shop}}', 'نحتاج إلى بعض المعلومات الإضافية عن {{shop}}',
 'Our team has asked for more information. You can read the request and send your file again from your seller dashboard.',
 'طلب فريقنا معلومات إضافية. يمكنك الاطلاع على الطلب وإرسال ملفك مجددًا من لوحة البائع.', '/seller/application'),
('seller_rejected', 'seller', '{email,in_app}',
 'About your application for {{shop}}', 'بخصوص طلب انضمام {{shop}}',
 'We are not able to approve your application. You can read our message in your seller dashboard.',
 'لا يمكننا الموافقة على طلبك، ويمكنك قراءة رسالتنا في لوحة البائع.', '/seller'),
('seller_suspended', 'seller', '{email,in_app}',
 '{{shop}} is paused', 'تم إيقاف {{shop}} مؤقتًا',
 'Your shop is not visible to customers for now. Please read our message in your seller dashboard.',
 'متجرك غير ظاهر للعملاء حاليًا. يرجى قراءة رسالتنا في لوحة البائع.', '/seller'),
('seller_reinstated', 'seller', '{email,in_app}',
 '{{shop}} is open again', 'عاد {{shop}} للعمل',
 'Your shop is visible to customers again.', 'أصبح متجرك ظاهرًا للعملاء مجددًا.', '/seller'),
('seller_listing_approved', 'seller', '{in_app}',
 '{{product}} is live', '{{product}} متاح الآن',
 'Customers can now find it and buy it.', 'يمكن للعملاء الآن العثور عليه وشراؤه.', '/seller/products'),
('seller_listing_rejected', 'seller', '{email,in_app}',
 '{{product}} needs changes', '{{product}} يحتاج إلى تعديلات',
 'Open the listing to see what to change, then send it again.', 'افتح المنتج لمعرفة ما يلزم تعديله، ثم أرسله مجددًا.', '/seller/product?id={{product_id}}'),
('seller_performance_warning', 'seller', '{email,in_app}',
 'Your shop''s standards need attention', 'مستوى متجرك يحتاج إلى عناية',
 'Over the last {{days}} days: {{summary}}. See Performance in your dashboard for what to improve.',
 'خلال آخر {{days}} يومًا: {{summary}}. اطّلع على صفحة الأداء في لوحتك لمعرفة ما يحتاج إلى تحسين.', '/seller/performance'),
-- our team (in the admin panel)
('staff_return_requested', 'staff', '{in_app}',
 'Return request {{return}} (our products)', 'طلب إرجاع {{return}} (منتجاتنا)',
 'A customer asked to return items from {{number}} ({{reason}}).', 'طلب عميل إرجاع منتجات من الطلب {{number}} ({{reason}}).', '/admin/returns'),
('staff_return_escalated', 'staff', '{in_app}',
 'Return {{return}} needs a decision', 'طلب الإرجاع {{return}} بحاجة إلى قرار',
 'The customer disagrees with {{seller}}''s answer on {{number}}.', 'لا يوافق العميل على رد {{seller}} بشأن الطلب {{number}}.', '/admin/returns'),
('staff_refund_needed', 'staff', '{in_app}',
 'Refund needed: {{number}}', 'استرداد مطلوب: {{number}}',
 '{{why}} Refund it from Returns and refunds.', '{{why}} أصدر المبلغ المسترد من صفحة الإرجاع والاسترداد.', '/admin/returns'),
('staff_delivery_failed', 'staff', '{in_app}',
 'Delivery failed: {{number}}', 'تعذّر التوصيل: {{number}}',
 'Arrange delivery with the customer.', 'رتّب التوصيل مع العميل.', '/admin/orders'),
('message_to_staff', 'staff', '{in_app}',
 'Customer message: {{subject}}', 'رسالة عميل: {{subject}}',
 'A customer wrote to Al Mukarramah.', 'كتب عميل إلى المكرمة.', '/admin/messages'),
('staff_message_flagged', 'staff', '{in_app}',
 'Check a conversation', 'راجع محادثة',
 'A message in "{{subject}}" may be trying to take a sale off Al Mukarramah.', 'قد تحاول رسالة في "{{subject}}" إتمام بيع خارج المكرمة.', '/admin/messages'),
('staff_performance_at_risk', 'staff', '{in_app}',
 '{{shop}} is below our standard', '{{shop}} دون المستوى المطلوب',
 '{{summary}}.', '{{summary}}.', '/admin/performance');

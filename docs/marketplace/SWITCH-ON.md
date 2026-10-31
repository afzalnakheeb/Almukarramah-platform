# Marketplace: switching it on

Everything is on the branch `shots/market`. Nothing has been applied to the live database, no function has been
deployed and no secret has been set. This is the order to do it in, what each step changes, how to check it, and how
to undo it. Read it with `DECISIONS.md` (the defaults waiting for a yes) and `PROGRESS.md` (where the code is).

Every step below changes the live service. Under the project's approval rule, show Afzal exactly what will change and
wait for his yes before each one. The live project is `axpwiixtqkjwjbsqzwqv`.

The marketplace has switches in the database (`mp_settings`), all off after the migrations: `marketplace_open`,
`sellers_open`, `payouts_enabled`, support's refund limit (0) and the test courier (inactive). Applying the
migrations and deploying the functions therefore opens nothing to the public by itself: the shop keeps working as it
does today until Afzal switches the marketplace on (step 7). The decisions behind each switch are at the top of
`DECISIONS.md` ("Needs Afzal").

## 0. Before you start

1. Merge `shots/market` into `main` after review. CI builds the site; check that `shots/typecheck.txt` has only the 7
   known errors and that `shots/errors.txt` has no page errors.
2. Take a backup: Supabase dashboard → Database → Backups (a manual backup, or point-in-time recovery if the plan has
   it), or `pg_dump`. Write down the deployed version of every Edge Function.
3. Decide the open items in `DECISIONS.md`, and record the tax adviser's sign-off for each corridor that will open
   (decision 2). The items in "Waiting for the legal and accounts phase" below can follow, as long as no real seller
   or customer uses the marketplace before they are done.

## 1. The database: migrations 0012 to 0020, in order

The live project records its migrations with timestamp versions. As of 31 October 2026 they were `init_platform` …
`claim_orders` (nine rows, including `enable_pg_net`, which is not a file in the repository). So apply the marketplace
files one at a time, in order, with the Supabase MCP `apply_migration` (name: the file name without `.sql`) or
`psql -v ON_ERROR_STOP=1 -f <file>`. Do not use `supabase db push`, which would try to reconcile local numbers with
the live timestamps.

Migrations 0010 and 0011 belong to the apps workstream and are independent of these. Nothing in 0012 to 0020 limits
what the API can read on `products` (no column grants: every client, including main and the apps branch, reads
products with `select *` as before; the review fields live in `listing_reviews`), so no grant is needed when the apps
migrations add columns.

| File | What it adds or changes |
|---|---|
| `0012_marketplace.sql` | Sellers, their private details and members; marketplace columns on `products` (`listing_status` defaults to `approved`, so every existing product stays live); `listing_reviews` (the review notes, AI findings and reviewers, readable by staff and the listing's seller only); measurement profiles; seller and commission columns on order lines; the public read policy on products is replaced (sellers' listings show only when approved and the marketplace is open); buckets `seller-uploads` (private) and `catalogue` (public). |
| `0013_rulebook_model_b.sql` | Countries, duties, corridors (our own products' routes open; the Saudi marketplace corridor and the rest closed until the adviser signs), permits, KYC requirements, seller documents, product permits, pickup addresses, carriers (the sandbox, inactive; providers listed but not connected), carrier services, rate cards, delivery prices; compliance columns on products. |
| `0014_categories_standards.sql` | The category tree (departments and groups around the existing collections), category policies and attributes, document types, the Islamic standard (`policy_rules`: 15 prohibited, 7 restricted awaiting the scholar), `mp_settings` with the switches `marketplace_open` and `sellers_open` (both off), garment styles. |
| `0015_ai_screening.sql` | Screened media, verdict records (append-only), strikes, blocked hashes, rate counters, product documents; the `quarantine` bucket (staff only). |
| `0016_onboarding.sql` | The seller's application file and checklist, categories per seller, review history; KYC and brand papers; approval through `mp_review_seller` only. |
| `0017_listings_search.sql` | Product options (`product_variants`), the price guard (against the approved price), search columns and indexes, `mp_search`, storefronts, `mp_approve_listing` / `mp_reject_listing`. No change to what the API can read on `products`. |
| `0018_orders_shipping.sql` | Sub-orders, shipments, tracking events, the `labels` bucket (private); new columns on `orders` (including `stock_taken_at` and `charge_given_id`, the key of each renewal charge) and `order_items`; `mp_payment_received` (payment, parcels and stock in one transaction; a payment for an order no longer waiting, or whose order no longer exists, is kept in `payment_issues` for finance; a renewal follows the paid period and keeps the saved card); `shipment_claims` (one label bought at a time per parcel; kept when the carrier's answer is lost); the seller's order flow; the customer's tracking. |
| `0019_after_sale.sql` | Statements (ledger, payouts, monthly view), refunds (one per return, one waiting for Moyasar per order), returns, reviews and replies, messages, the notifications outbox with 44 templates, seller performance; `orders.fx_per_sar` and refunded amounts; `invoices.vat_rate_bp` and `fx_per_sar`, one invoice per order, and `mp_issue_document` (the counter and the document in one transaction); `payouts_enabled`, `support_refund_limit_minor` and `payout_bank_hold_days` (off, 0, 7); the `customer-uploads` bucket (private); replaces `my_order_tracking` and `mp_public_settings`; widens `media_assets.kind` for return photos; only the owner changes the switches (a guard on `mp_settings`); message threads are kept, unlinked, when a customer deletes their account (`message_threads.user_id` becomes `on delete set null`); finance's tools for refunds settled by hand, refunds made in the Moyasar dashboard (`mp_record_moyasar_refund`, `moyasar_refund_checks`, refunds' `goodwill_minor`) and payments to resolve; the last refund after goodwill is what is left of the payment (refunds' `goodwill_deducted_minor`) and an approved return can be closed with a reason (return status `closed`); `return_autoclose_days` (30, owner only), the customer's "I have sent it back" (`sent_back_at`) and `mp_autoclose_returns`, which closes returns never sent back (Afzal, 31 October). |
| `0020_marketplace_dashboard.sql` | `admin_marketplace_overview` (read only), with the half-done work, the payments to resolve and the switches. |

Checks after the last file:

```sql
select count(*) from products where listing_status <> 'approved';   -- 0: every existing product is still live
select count(*) from notification_templates;                         -- 40
select mp_public_settings();                                          -- returns the settings, marketplace_open false
select marketplace_open, sellers_open, payouts_enabled, support_refund_limit_minor from mp_settings;   -- f, f, f, 0
select active from carrier_providers where id = 'sandbox';            -- f
select count(*) from corridors where status <> 'closed';             -- our own products' routes only
select count(*) from invoices i group by order_id having count(*) filter (where doc = 'invoice') > 1;   -- no rows
select mp_pending_work(500, 0);   -- read only: what finish-pending would do on its first run (step 4)
```

Then run the Supabase security advisors (`get_advisors`) and confirm nothing new about row-level security. Load the
live website and an installed app build: products and collections still show (they read products with `select *`,
which works unchanged).

### What changes for the existing shop as soon as the migrations run

Even with every switch off, these apply to Al Mukarramah's own products and orders (review M7):

- **The products read policy is replaced.** Our own products read exactly as before; sellers' listings are public only
  when approved and the marketplace is open. New triggers run on `products` (the seller guards, the price and
  compliance guards), `orders` (notifications) and `categories`.
- **Return windows from the category policies apply to our own products** (dates: only if faulty, 3 days; perfume:
  unopened, 7 days; everything else 14 days; problems 30 days). Online returns stay closed while the marketplace is
  off, so in practice nothing changes until it opens, but the windows are what our team will apply. To be confirmed
  with the legal adviser (DECISIONS.md, Needs Afzal J).
- **Every paid order queues notification rows** (`notification_outbox`, English and Arabic). Nothing is sent until a
  provider is connected; they show in the app.
- **Orders get new columns** (`fx_per_sar`, refunded amounts, `stock_taken_at`, sub-orders for new orders). Stock
  comes off in the database when a payment is recorded (`mp_order_paid`), for orders with parcels and for orders made
  by an older `create-payment` without them, once (`orders.stock_taken_at`).
- **Invoices get `vat_rate_bp` and `fx_per_sar`**, and one tax invoice per order is enforced by a unique index.
  Existing invoice rows are never edited.

## 2. Server functions (after the migrations)

Deploy each with `npx supabase functions deploy <name>` (or the MCP `deploy_edge_function`). `supabase/config.toml`
sets which ones skip the sign-in check (`verify_jwt = false`): cron jobs and webhooks, which check their own secret.

| Function | New or changed | Notes |
|---|---|---|
| `screen-image` | new | photos from sellers and customers |
| `listing-check` | new | the full check at submission |
| `screening-retry` | new | cron, `verify_jwt = false` |
| `review-screening` | new | staff overrides |
| `review-listing` | new | approval publishes photos |
| `translate-draft` | new | the second language, drafted |
| `review-seller` | new | approval, logo and banner |
| `shipping-quote` | new | the checkout's quote |
| `create-shipment` | new | labels; the parcel is claimed before a label is bought, a lost answer keeps the claim and the next press asks the carrier with the same key, and a label that cannot be recorded is cancelled at the carrier. A real carrier's adapter must call its API through `carrierCall` (`carriers/http.ts`), which tells a refusal from an unknown outcome, and must answer a second request with the same idempotency key with the label it already sold (or look our reference up at the carrier before buying again): the contract test in `review4.test.ts` runs every registered adapter |
| `carrier-webhook` | new | `verify_jwt = false`, HMAC signature |
| `shipment-sync` | new | cron, `verify_jwt = false` |
| `after-sale` | new | messages, returns, reviews, replies, moderation, a seller's cancellation of a parcel |
| `finish-pending` | new | cron every 15 minutes and staff (owner, manager, finance), `verify_jwt = false`, checks the cron secret or the staff role itself |
| `create-payment` | changed | sub-orders, idempotency key, checkout rate, the marketplace switch |
| `moyasar-webhook` | changed | `mp_payment_received` (paid, parcels handed on and stock taken in one transaction); invoices only what we sell, once; a payment for an order no longer waiting is recorded for finance and answered 200 (`stray: true`) |
| `refund-order` | changed | partial, idempotent refunds and credit notes; a timeout stays "processing" and is reconciled (`action: "reconcile"`); finance settles a refund by hand after checking Moyasar (`action: "resolve"`), records a refund made in the Moyasar dashboard (`action: "record_moyasar"`) and resolves payments for orders no longer waiting (`action: "payment_issue"`: refund, attach or close, each after reading the payment from Moyasar); Moyasar is read back before every new refund; `action: "preview"` shows what a refund would be (nothing reserved, Moyasar not asked); an unknown action is refused |
| `charge-subscriptions` | changed | the invoice through the same once-only path; each renewal is charged with its own `given_id` (Moyasar answers a repeat with the same payment), and a lost answer leaves the renewal waiting to be asked again, never cancelled. Check with Moyasar that `given_id` is accepted on saved-card (merchant-initiated) payments before scheduling it |
| `shipping-rates` | changed | the same rulebook for older app builds |

Deploy the changed ones only after the migrations (they call the new database functions). The payment functions are
not live yet (only `concierge` and `manage-subscription` are deployed): they go live with the Moyasar switch-on, and
the marketplace needs them.

**Versions that move together.** Deploy every function above from the same commit, and roll back together:

- `create-payment` and `moyasar-webhook`: the new checkout creates parcels that only the new webhook hands on. The new
  webhook still takes stock once for an order made by an older checkout (no parcels), but an older webhook with the new
  checkout marks orders paid without handing their parcels to the sellers, and its own stock update then repeats
  when `finish-pending` hands them on. Never run the old webhook with the new checkout.
- `refund-order`, `finish-pending` and `after-sale` call database functions added by 0018 and 0019, and
  `_shared/zatca.ts` stores documents through `mp_issue_document`: an older version of one of them against the new
  database stops with an error rather than doing anything wrong, but refunds and credit notes stop too.
- `review-listing`, `review-seller`, `create-shipment`, `carrier-webhook` and `shipment-sync` depend on 0016 to 0018.
- The app (`EXPO_PUBLIC_MARKET_LIVE`) can be switched off on its own at any time (step 9).

## 3. Secrets

No new secret is required. The functions use the ones already planned:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (provided by Supabase).
- `ANTHROPIC_API_KEY`: the AI screening. Without it nothing is passed unchecked: photos and listings wait as
  "checking" until the key is there.
- `CRON_SECRET`: the scheduled jobs.
- `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `MOYASAR_PUBLISHABLE_KEY`, `PUBLIC_SITE_URL`: payments.

One new secret for the test courier: `SANDBOX_WEBHOOK_SECRET`, a random string (for example `openssl rand -hex 32`).
The sandbox's webhooks are refused without it; the scheduler's secret is never accepted in its place (review L9).

Optional: `SCREENING_FAST_MODEL` and `SCREENING_STRONG_MODEL` (defaults `claude-haiku-5-5` and `claude-sonnet-5-5`:
confirm both are available on the account before relying on the defaults); `MOYASAR_TIMEOUT_MS` (default 20000, the
time limit on each call to Moyasar); `REFUND_RECONCILE_GRACE_MINUTES` (default 15: a refund Moyasar never answered is
marked failed only if Moyasar still shows no refund this long after it was asked); `FINISH_PENDING_MIN_AGE_SECONDS`
(default 120: `finish-pending` leaves alone anything younger, which a request may still be finishing). Real carriers'
keys come with their accounts, under the secret names recorded in `carrier_providers`.

## 4. Scheduled jobs

With Supabase Cron (pg_cron) and `pg_net` (already enabled live), each sending the header `x-cron-secret`:

- `screening-retry` every 5 minutes: finishes checks that could not run, deletes quarantined photos after 30 days.
- `shipment-sync` every 15 minutes: asks the carrier for tracking when no webhook came.
- `finish-pending` every 15 minutes: issues missing tax invoices and credit notes, hands on paid orders a failure left
  behind, and checks refunds still waiting for Moyasar's answer (review H3). The same runs from "Finish pending work
  now" on `/admin/marketplace`. It invoices only orders paid in the last 7 days and not refunded; older ones are
  listed for our team (re-review N5). It also asks Moyasar again about refunds marked failed in the last three days
  and lists what Moyasar completed for finance (re-review R3-2). It closes returns accepted for sending back whose items
  were never sent back, 30 days after the seller accepted them (`return_autoclose_days`; Afzal, 31 October): the
  customer and the seller are told and each closure is in the audit log. **Before scheduling it**, run
  `select mp_pending_work(500, 0);` on the live database (read only) and show Afzal what it lists,
  `orders_without_invoice` and `orders_without_invoice_old` above all, and how many returns its first run would close
  (`select count(*) from return_requests where status = 'accepted' and kind = 'return' and sent_back_at is null and
  accepted_at <= now() - interval '30 days';`, none while online returns are closed); schedule it only after his yes.
- Optional, weekly: `select mp_performance_review();` warns sellers below the standard (it never suspends while
  `perf_auto_suspend` is off).

## 5. Storage

The migrations create the buckets: `seller-uploads`, `quarantine`, `labels` and `customer-uploads` (private) and
`catalogue` (public). Image transformations (Storage settings) are optional: when they are off, large photos reach the
AI model through a short-lived signed link instead of a resized copy.

## 6. The website and the apps

- Vercel (production): set `EXPO_PUBLIC_MARKET_LIVE=1` and redeploy. The header search moves to `/search`; the
  checkout asks `shipping-quote`; orders show parcels, returns and reviews; product pages show options and reviews;
  the seller dashboard and the admin pages call the marketplace functions.
- Never set `EXPO_PUBLIC_MARKET_DEMO` in any deployment. It exists only for the screenshot build in CI, where it shows
  example data, and on localhost only.
- The phone apps get the same flag in their next EAS build, when the marketplace is ready on mobile.

## 7. Switching the marketplace on, and settings to review with Afzal

Each switch is Afzal's decision (DECISIONS.md, "Needs Afzal"); show him the statement and wait for his yes. Only the
owner's account, the server or the database connector can change these columns (a manager is refused: re-review N9).

```sql
update mp_settings set sellers_open = true where id = 1;       -- B: sellers can apply at /sell
update mp_settings set marketplace_open = true where id = 1;   -- A: sellers' listings, shops, checkout, returns, reviews, messages
update mp_settings set payouts_enabled = true where id = 1;    -- C: only after the adviser's ruling on VAT in payouts
update mp_settings set support_refund_limit_minor = 50000 where id = 1;   -- D: an example, 500 SAR (Afzal, 31 Oct: stays 0)
update mp_settings set return_autoclose_days = 30 where id = 1;          -- L: already 30 (Afzal, 31 Oct); owner only
```

Switching `marketplace_open` back to false closes it again at once, in the database: sellers' listings and shops
disappear from the public, marketplace lines are refused at checkout, and online returns, reviews and messages close.
Parcels already ordered can still be accepted, shipped and refunded by our team.

- `mp_settings`: commission defaults, photo rules, strike limits, the price guard, return windows, payout hold,
  the bank-change hold, review moderation, message limits, performance thresholds (all in `DECISIONS.md`).
- Corridors to open, each with the adviser's sign-off, and the delivery price for every open route.
- The wording of the 44 notification templates (`/admin/notifications` shows what each one looks like).
- `store_settings.zero_rate_exports` stays as it is.

## 8. A test run in production (sandbox shipping, Moyasar test mode)

Before it: switch the test courier on (`update carrier_providers set active = true where id = 'sandbox';`), open
seller applications, and open the marketplace only for the run if Afzal agrees (or keep it closed and use staff
accounts). Switch the courier off again afterwards.

1. A test seller applies from `/sell`, completes the file and is approved by a manager (KYC, sample).
2. They list a product. The check rejects a phone number in the description; the corrected listing reaches the queue
   and is approved from `/admin/listings`.
3. A test customer orders it with Moyasar's test card; the order is confirmed and the seller's new order appears.
4. The seller accepts and prints the label (it says SAMPLE, and the customer's phone is masked); `shipment-sync`
   moves it to delivered within a day and a half.
5. The sale appears on `/seller/statements`, held for 33 days (the problem window and the hold).
6. The customer asks for a return; the seller accepts and confirms it came back; finance refunds it from
   `/admin/returns` (Moyasar test mode), and the credit note appears.
7. The customer reviews the product; support publishes it from `/admin/reviews`.
8. Delete the test seller's listings, or suspend the seller.

The same journey runs in the test suite (`supabase/tests/e2e_journey.test.ts`) against a fresh database.

## 9. Undoing it

1. **The switch, first.** `update mp_settings set marketplace_open = false where id = 1;` closes the marketplace in
   the database at once (tested: `review_medium.test.ts`, M6), whatever app build people use. Close `sellers_open`
   too if needed.
2. **Website and apps:** remove `EXPO_PUBLIC_MARKET_LIVE` and redeploy. The site stops showing the marketplace pages.
3. **Functions:** redeploy the versions noted in step 0, all of them together (see "Versions that move together" in
   step 2). Rolling back only some breaks the flow: the earlier `moyasar-webhook` does not hand parcels to sellers,
   and the earlier `refund-order` does not know returns or parcels. While orders with parcels exist, keep the new
   payment and refund functions and use the switch instead.
4. **Database:** leave the marketplace tables in place, with the switch off. What still applies to the existing shop
   is listed in step 1 ("What changes for the existing shop"); there are no grants to undo. Removing the tables would
   delete sellers' and customers' data. If a full undo is needed before any marketplace data exists, restore the
   backup taken in step 0.

## Waiting for the legal and accounts phase

Built and tested now, but only in the sandbox, or held until these are in place:

- **Carrier accounts.** OTO (Saudi Arabia and the UAE) and DHL Express (cross-border with duties paid) are listed but
  not connected; every label and tracking event comes from the sandbox until their accounts and adapters exist.
  (Shiprocket stays listed for India, which is not a focus market.)
- **Moyasar's confirmation** that the platform may take payments for sellers' goods as a marketplace (Al Mukarramah
  is paid, then pays sellers by bank transfer; refunds go through Moyasar).
- **VAT registrations and the adviser's sign-off** per corridor: the deemed-supplier position on sellers' goods, the
  destinations where the platform would collect import VAT/GST (UK, EU IOSS, Australia, New Zealand, Canada: all
  seeded closed), duties as a disbursement, multi-rate invoices if a corridor needs one, and the tax treatment of
  sellers' statements and our commission before the first payout.
- **The seller agreement**: commission, payout schedule and holds, returns, standards and suspension, photo rules,
  liability; and a legal read of the seller handbook pages.
- **Consumer law per market** for returns and refunds (the UK and EU 14-day cancellation right includes the standard
  delivery).
- **An email and push provider.** Notifications are queued with their English and Arabic text and shown in the app;
  nothing is sent until a provider is connected and `notifications_send_enabled` is switched on.
- **The scholar's review** of the 7 restricted categories in the Islamic standard.

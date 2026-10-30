# Marketplace: switching it on

Everything is on the branch `shots/market`. Nothing has been applied to the live database, no function has been
deployed and no secret has been set. This is the order to do it in, what each step changes, how to check it, and how
to undo it. Read it with `DECISIONS.md` (the defaults waiting for a yes) and `PROGRESS.md` (where the code is).

Every step below changes the live service. Under the project's approval rule, show Afzal exactly what will change and
wait for his yes before each one. The live project is `axpwiixtqkjwjbsqzwqv`.

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

Migrations 0010 and 0011 belong to the apps workstream and are independent of these. If they add a column to
`products` after 0017 has run, grant it: `grant select (new_column) on products to anon, authenticated` (0017 limits
what the API can read on products).

| File | What it adds or changes |
|---|---|
| `0012_marketplace.sql` | Sellers, their private details and members; marketplace columns on `products` (`listing_status` defaults to `approved`, so every existing product stays live); measurement profiles; seller and commission columns on order lines; the public read policy on products is replaced (sellers' listings show only when approved); buckets `seller-uploads` (private) and `catalogue` (public). |
| `0013_rulebook_model_b.sql` | Countries, duties, corridors (phase 1 open, the rest closed), permits, KYC requirements, seller documents, product permits, pickup addresses, carriers (the sandbox, and providers listed but not connected), carrier services, rate cards, delivery prices; compliance columns on products. |
| `0014_categories_standards.sql` | The category tree (departments and groups around the existing collections), category policies and attributes, document types, the Islamic standard (`policy_rules`: 15 prohibited, 7 restricted awaiting the scholar), `mp_settings`, garment styles. |
| `0015_ai_screening.sql` | Screened media, verdict records (append-only), strikes, blocked hashes, rate counters, product documents; the `quarantine` bucket (staff only). |
| `0016_onboarding.sql` | The seller's application file and checklist, categories per seller, review history; KYC and brand papers; approval through `mp_review_seller` only. |
| `0017_listings_search.sql` | Product options (`product_variants`), the price guard, search columns and indexes, `mp_search`, storefronts. **Narrows what the API can read on `products`** to every column except the review fields. |
| `0018_orders_shipping.sql` | Sub-orders, shipments, tracking events, the `labels` bucket (private); new columns on `orders` and `order_items`; the seller's order flow; the customer's tracking. |
| `0019_after_sale.sql` | Statements (ledger, payouts, monthly view), refunds, returns, reviews and replies, messages, the notifications outbox with 40 templates, seller performance; `orders.fx_per_sar` and refunded amounts; the `customer-uploads` bucket (private); replaces `my_order_tracking` and `mp_public_settings`; widens `media_assets.kind` for return photos. |
| `0020_marketplace_dashboard.sql` | `admin_marketplace_overview` (read only). |

Checks after the last file:

```sql
select count(*) from products where listing_status <> 'approved';   -- 0: every existing product is still live
select count(*) from notification_templates;                         -- 40
select mp_public_settings();                                          -- returns the settings
select count(*) from corridors where status <> 'closed';             -- the phase 1 corridors only
```

Then run the Supabase security advisors (`get_advisors`) and confirm nothing new about row-level security. Load the
live website: products and collections still show (it still reads only the columns it read before).

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
| `create-shipment` | new | labels |
| `carrier-webhook` | new | `verify_jwt = false`, HMAC signature |
| `shipment-sync` | new | cron, `verify_jwt = false` |
| `after-sale` | new | messages, returns, reviews, replies, moderation |
| `create-payment` | changed | sub-orders, idempotency key, checkout rate |
| `moyasar-webhook` | changed | `mp_order_paid`; invoices only what we sell |
| `refund-order` | changed | partial, idempotent refunds and credit notes |
| `shipping-rates` | changed | the same rulebook for older app builds |

Deploy the changed ones only after the migrations (they call the new database functions). The payment functions are
not live yet (only `concierge` and `manage-subscription` are deployed): they go live with the Moyasar switch-on, and
the marketplace needs them.

## 3. Secrets

No new secret is required. The functions use the ones already planned:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (provided by Supabase).
- `ANTHROPIC_API_KEY`: the AI screening. Without it nothing is passed unchecked: photos and listings wait as
  "checking" until the key is there.
- `CRON_SECRET`: the scheduled jobs, and the sandbox carrier's webhook signature.
- `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `MOYASAR_PUBLISHABLE_KEY`, `PUBLIC_SITE_URL`: payments.

Optional: `SCREENING_FAST_MODEL` and `SCREENING_STRONG_MODEL` (defaults `claude-haiku-5-5` and `claude-sonnet-5-5`:
confirm both are available on the account before relying on the defaults), `SANDBOX_WEBHOOK_SECRET`. Real carriers'
keys come with their accounts, under the secret names recorded in `carrier_providers`.

## 4. Scheduled jobs

With Supabase Cron (pg_cron) and `pg_net` (already enabled live), each sending the header `x-cron-secret`:

- `screening-retry` every 5 minutes: finishes checks that could not run, deletes quarantined photos after 30 days.
- `shipment-sync` every 15 minutes: asks the carrier for tracking when no webhook came.
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

## 7. Settings to review with Afzal

- `mp_settings`: commission defaults, photo rules, strike limits, the price guard, return windows, payout hold,
  review moderation, message limits, performance thresholds (all in `DECISIONS.md`).
- Corridors to open, each with the adviser's sign-off, and the delivery price for every open route.
- The wording of the 40 notification templates (`/admin/notifications` shows what each one looks like).
- `store_settings.zero_rate_exports` stays as it is.

## 8. A test run in production (sandbox shipping, Moyasar test mode)

1. A test seller applies from `/sell`, completes the file and is approved by a manager (KYC, sample).
2. They list a product. The check rejects a phone number in the description; the corrected listing reaches the queue
   and is approved from `/admin/listings`.
3. A test customer orders it with Moyasar's test card; the order is confirmed and the seller's new order appears.
4. The seller accepts and prints the label (it says SAMPLE); `shipment-sync` moves it to delivered within a day and a
   half.
5. The sale appears on `/seller/statements`, held until the return window passes.
6. The customer asks for a return; the seller accepts and confirms it came back; finance refunds it from
   `/admin/returns` (Moyasar test mode), and the credit note appears.
7. The customer reviews the product; support publishes it from `/admin/reviews`.
8. Delete the test seller's listings, or suspend the seller.

The same journey runs in the test suite (`supabase/tests/e2e_journey.test.ts`) against a fresh database.

## 9. Undoing it

1. Website: remove `EXPO_PUBLIC_MARKET_LIVE` and redeploy. The site goes back to reading only what it read before.
   This is immediate and safe, and enough in most cases.
2. Functions: redeploy the versions noted in step 0. The earlier `create-payment`, `moyasar-webhook`, `refund-order`
   and `shipping-rates` still work with the new tables (every new column has a default).
3. Database: leave the marketplace tables in place, with the flag off. They change nothing for the existing shop:
   every existing product stays live, and orders work as before. Removing them would delete sellers' and customers'
   data. If a full undo is needed before any marketplace data exists, restore the backup taken in step 0.

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

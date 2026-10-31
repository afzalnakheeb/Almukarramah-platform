# Marketplace build: progress

Branch `shots/market` (worktree `.claude/worktrees/agent-ae2c6e6e0a5430ba3`). Nothing here is applied to the live
database or deployed. Read this first if you are picking the work up.

## Milestones

| | Milestone | State |
|---|---|---|
| M1 | Finish and test the base marketplace and rulebook migrations | done |
| M2 | Categories, Islamic and premium standards, guidance pages | done |
| M3 | AI screening (images at upload, full listing at submission) | done |
| M4 | Onboarding, KYC and admin review | done |
| M5 | Listings with variants, storefronts, search | done |
| M6 | Checkout, rulebook, sub-orders, sandbox shipping, order flows | done |
| M7 | Statements, returns/disputes, reviews, messages, notifications, performance | done |
| M8 | Dashboards, polish, screenshots, docs | done |
| Review | Fix pass after the independent review (6 High, 15 Medium, 11 Low): `REVIEW-FIXES.md` | done |

## Where things are

- Migrations: `supabase/migrations/0012_*` onwards are the marketplace (0010 and 0011 are the apps workstream's).
  The earlier drafts `0009_marketplace.sql` and `0010_rulebook_model_b.sql` were renamed to 0012 and 0013.
  - 0012 sellers, listings, made-to-measure seam, photos · 0013 rulebook tables, KYC, permits, pickup addresses,
    carriers · 0014 category tree and policies, attributes, the Islamic standard, settings, document types, styles
    · 0015 AI screening: media assets, verdict records, strikes, quarantine, rate limits, product documents
    · 0016 onboarding: the vetting application, checklist, categories per seller, review history, seller review
    · 0017 listings and search: variants and stock, the price guard, mp_search, storefronts (no column grants:
    products are read with `select *` as before; review fields are in `listing_reviews`, 0012)
    · 0018 orders and shipping: sub-orders, shipments, tracking events, labels, the seller's order flow, tracking
    · 0019 after the sale: the seller ledger, statements and recorded payouts, refunds, returns and disputes, reviews
    and replies, messages, the notifications outbox and its templates, seller performance
    · 0020 our team's marketplace dashboard (`admin_marketplace_overview`) and public parcel tracking (`track_parcel`).
- Switching it on: `docs/marketplace/SWITCH-ON.md` (the order, the checks, the secrets, the jobs, how to undo it, and
  what waits for the legal and accounts phase).
- Shared pure modules (no imports; the app imports them too): `supabase/functions/_shared/quality.ts`,
  `contact.ts`, `search.ts` (Arabic normalisation and the in-memory search the site uses before switch-on).
- Products: anon and authenticated read every column except the review fields (0017). A new products column the
  website needs must be granted: `grant select (col) on products to anon, authenticated`. Server modules: `images.ts` (type sniffing, metadata stripping), `screening.ts` (prompts, parsing,
  decisions; no I/O), `claude.ts` (the Messages API call), `media.ts` (storage + database flows).
- Server functions (M3): `screen-image`, `listing-check`, `screening-retry` (cron), `review-screening` (staff
  overrides), `review-listing` (approval publishes photos), `translate-draft`. M4: `review-seller` (approval through
  the database checks, then publishes the shop's logo and banner).
- The rulebook: `supabase/functions/_shared/rules.ts` (pure, 15 unit tests); the server checkout: `cart.ts` (prices,
  options, made-to-measure from the listing's own measurement list), `checkout.ts` (tables, plan, totals), `quote.ts`.
  Carriers: `_shared/carriers/` (`types.ts` the adapter interface, `sandbox.ts`, `index.ts` the registry).
  Functions (M6): `shipping-quote` (website), `shipping-rates` (older apps, same rulebook), `create-payment`
  (rewritten: idempotent, sub-orders), `moyasar-webhook` (hands paid orders to `mp_order_paid`, invoices only what we
  sell), `create-shipment`, `carrier-webhook` (HMAC), `shipment-sync` (cron). M7: `after-sale` (messages, returns,
  reviews, replies, moderation: text masked with `_shared/aftersale.ts`), `refund-order` (rewritten: partial,
  idempotent, credit notes), `screen-image` (customers' review and return photos, bucket `customer-uploads`).
- After-sale client code: `src/lib/aftersale.ts` (calls), `src/lib/aftersale-demo.ts` (screenshot data),
  `src/components/aftersale.tsx` (stars, a return, the return form, the statement, standards, updates),
  `conversation.tsx`, `reviews.tsx`, `admin-refund.tsx`. Pages: `/seller/{returns,messages,reviews,statements,
  performance}`, `/messages`, `/review`, returns and reviews on `/order`, reviews on product pages,
  `/admin/{returns,reviews,payouts,messages,notifications,performance}`.
- Build flags: `src/lib/flags.ts`. `EXPO_PUBLIC_MARKET_LIVE=1` is set at switch-on; until then the catalogue and the
  build script read only the columns the live database has (the earlier preview's marketplace columns caused 400s).
- Demo mode: `EXPO_PUBLIC_MARKET_DEMO=1` (set only in `.github/workflows/shots.yml`) shows the seller and admin
  marketplace screens with the example data in `src/lib/market-demo.ts`; the admin shell skips sign-in only in that
  build and only on localhost. `EXPO_PUBLIC_MARKET_LIVE=1` (set at switch-on) lets the site call the marketplace
  functions; until then the handbook reads the snapshot.
- Seller handbook: `app/sell/{guidelines,categories,islamic-standard,premium-standard,photos,prohibited}.tsx`,
  components in `src/components/guidelines.tsx`, static text in `src/lib/guidelines.ts`, database-driven parts
  through `src/lib/market.ts` (`useGuidance`: committed snapshot `src/generated/market-guidance.json`, then
  `mp_guidance()` live). Regenerate the snapshot after changing seeds: `node supabase/tests/tools/export-guidance.ts`.
- Tests: `supabase/tests/` (run `npm run test:market`, needs a local PostgreSQL 16; see below).
  - `lib/db.ts` creates a fresh database from `supabase_stub.sql` (a minimal Supabase stand-in), migrations
    0001–0011, `fixtures/live_baseline.sql` (the live categories, zones and a few products) and then the marketplace
    migrations; it runs SQL as anon, a signed-in user, the service role or the migration owner.
- Decisions waiting for Afzal: `docs/marketplace/DECISIONS.md` (the ones from the review are at the top).
- Edge Function tests: `supabase/tests/lib/edge.ts` runs the functions under Node against the test database, with
  supabase-js replaced by a local stand-in (`lib/fake-supabase.ts`, which runs each call as SQL with the caller's
  role), Moyasar and the carriers mocked, and every other host refused.

## Running the tests

```
# a scratch PostgreSQL 16 listening on a unix socket (defaults: /var/run/postgresql, port 54329, user postgres)
PGHOST=/var/run/postgresql PGPORT=54329 npm run test:market
```

npm's registry is blocked in the build sandbox, so the app is type-checked by CI (typecheck.txt in the
[shots-result] commit) and locally against loose stubs of react/react-native/expo.

## Log

- M1: 0012/0013 reviewed and fixed (see commit d16aa80): renumbered; audit for composite keys; country locked for
  sellers; sellers only take listings back to draft; uploads only into `<seller>/incoming/`, never overwritten;
  permits table with staff verification; IBAN check digits; pickup addresses in the seller's country; provider
  references server-only. Shipments, the seller order list and statements move to 0018/0019. 23 tests.
- M2: 0014 category tree (10 departments, 3 fashion groups, 48 listable categories including the existing
  collections), inherited policies and attributes, document types, `mp_settings`, 22 policy rows (15 prohibited,
  7 restricted awaiting the scholar), garment styles; RPCs `mp_category_policy`, `mp_category_attributes`,
  `mp_category_requirements`, `mp_category_tree`, `mp_guidance`, `mp_public_settings`, `mp_commission_bps`.
  Quality score module with 11 unit tests; 11 more SQL tests. Six handbook pages in English and Arabic.
- M3: 0015 AI screening. Photos are checked at upload (`screen-image`: type from the bytes, 10 MB, JPEG/PNG/WebP,
  hidden metadata removed, duplicate and blocked-hash checks, rate limit, then a fast model and, when unsure, a
  stronger one); the whole listing at submission (`listing-check`: premium-standard score on the server, contact
  details, claims, prohibited keywords to review, then the models). Outcomes: block (rejected with reasons in English
  and Arabic, never in the queue), review (queue with notes), pass (queue; staff always approve). Never fails open:
  no key, a model error or a timeout leave the photo "checking" and the listing "being checked" for the retry job.
  Every verdict is kept (`screening_runs`, append-only); strikes (3 hard in 90 days suspend the seller; severe ones
  suspend the listing at once and flag the seller); prohibited images go to the staff-only quarantine bucket and are
  deleted after 30 days; staff overrides always need a reason and void the strike. New listing form (category first,
  attributes, documents, photos with their status, live quality score, AI draft of the other language without Quran
  text, made-to-measure style/measurements/options/fabrics by season) and the staff listing page (photos with
  screening results, AI notes, documents, screening record, overrides). Tests: 21 screening unit tests (mocked
  model), 6 image tests, 18 SQL tests; 90 in all.
- M4: 0016 onboarding. Applying opens the seller's file (story, relationship, years, links, categories requested);
  the seller completes it in the dashboard (`/seller/application`: portfolio photos screened at upload, legal entity,
  tax and bank details, the documents their country requires, brand papers per brand, pickup addresses in shop
  settings) and sends it when the server's checklist is complete. Owner/manager review it (`/admin/sellers`): ask for
  more information (the seller answers and sends it again), approve, reject, suspend, reinstate; KYC and document
  decisions; sample status; categories. Approval checks KYC, sample and corridor in the database (direct approval
  through the API is refused); `review-seller` publishes the screened logo and banner. Sellers list only in approved
  categories; staff notes on `seller_private` are no longer readable by sellers. Rulebook (coordinator, 31 Oct):
  destination import VAT/GST regimes and collection flags on countries and corridors; GB, US, CA, AU, NZ and ten EU
  states seeded as closed destinations for Saudi sellers' goods (values to confirm with the adviser); India stays
  closed, data only. Tests: 14 new SQL tests (104 in all).
- M5: 0017. Variants (label en/ar, options, SKU, own price, own stock; the product's stock is their sum) with the
  same guards as listings; the price guard (a live listing's price may move up to 30% at once; more sends it back to
  our team, off sale until approved; any other content change goes back to draft as before; the limit is read through
  `mp_public_settings()` because sellers cannot read `mp_settings`). AI notes and review notes are no longer readable
  through the API; sellers and staff get them from `mp_listing_private()`. `mp_search` (one English/Arabic index,
  Arabic normalised, word prefixes; category with everything under it, seller, price, rating, made to measure, the
  category's filterable attributes; facets with counts; six sorts; pages) and `mp_storefront`. Pages: `/search`
  (filters and facets, phone sheet), storefront with logo/banner, rating, categories and shop search; options and
  stock in the listing form. The header search moves to `/search` once `EXPO_PUBLIC_MARKET_LIVE` is set.
  Tests: 10 SQL tests and 4 unit tests (118 in all).
- M6: 0018 and the rulebook. Every line decided on the server from the tables: corridor (open, or a pilot with the
  seller), category routes, restricted/allowed destinations, customs clearance for cross-border sellers, permits
  (SFDA for perfume/oud and food into Saudi Arabia, verified and unexpired), dangerous goods needing a courier that
  takes them, an approved carrier service, the platform's delivery price (most specific row, weight steps, free over),
  VAT by the corridor (origin, destination, zero; our exports zero-rated only when switched on), duties at checkout
  (DDP: longest HS prefix, GCC-made goods free within the GCC, de minimis) or on delivery (DAP), import VAT collected
  at checkout on low-value routes once we are registered, made-to-measure production time, and the return policy
  (made to measure: faulty only). One sub-order per seller (and ours); paid orders move on in the database
  (`mp_order_paid`: ours accepted, sellers accept theirs, stock off the option or product); the seller accepts, makes,
  packs and prints our label (sandbox: deterministic tracking numbers, a real PDF marked SAMPLE, tracking by the
  clock); tracking events are de-duplicated and never go backwards, and carry the sub-order and the order along.
  Checkout shows each seller's parcel, items that cannot come to the address (with the reason), duties; the customer's
  order page shows each parcel with its tracking and return policy. Tests: 15 rulebook, 5 carrier, 9 SQL (147 in all).
- M7: 0019. Statements: an append-only ledger in SAR (sale and commission booked on delivery, payable after the return
  window and a 3-day hold with no open return; refunds with the commission given back; adjustments with a reason;
  payouts recorded by finance from bank transfers, reversible, never more than is payable), monthly statements.
  Refunds: staff only through refund-order; worked out on the server (a whole order, a parcel, an approved return or
  chosen lines; delivery when the whole parcel comes back), reserved under an idempotency key before Moyasar, never
  twice, refused until our invoice exists; credit notes for what we invoiced; stock back when fit to sell; the seller's
  statement follows. Returns and disputes (policy and windows checked in the database, made to measure faulty only,
  problems up to 30 days, photos screened, the seller answers in 3 days, the customer can take it to us, our decision
  final). Verified-purchase reviews read by our team first, photos published to the catalogue on approval, seller
  replies, product ratings kept. Messages masked by the after-sale function, flagged when someone asks to deal
  elsewhere, rate-limited. Notifications: 40 English/Arabic templates queued (never sent), in-app updates for
  customers and sellers. Seller performance against the thresholds; weekly warnings; automatic suspension off.
  Pages for customers, sellers and our team. Tests: 24 SQL (every new table's readers and writers: anon, customers,
  sellers A and B, each staff role), 8 unit (masking, return reasons, customer photo decisions), and the scripted
  end-to-end journey (apply, approve, list, AI verdicts, approve the listing, order with the rulebook, label,
  tracking, delivery, statement, review, payout): 185 in all.
- M8: 0020. The marketplace dashboard (`/admin/marketplace`: queues linked to their pages, the last 30 days' sales by
  sellers and our own products in SAR, commission, refunds, what is payable to sellers, the busiest sellers with
  their standards, destinations), readable by staff and by server-side callers (Claude's connector, scheduled jobs:
  `private.is_staff_or_server`), never by customers or sellers. Public tracking at `/track?number=` (the link on
  labels and emails): progress only, no names or addresses. The checkout example with duties paid at checkout for the
  screenshots (`/checkout?demo=ddp`, screenshot build only). Screenshots of every after-sale page in English and
  Arabic, phone and desktop. `SWITCH-ON.md`; marketplace routines added to `docs/run-from-claude.md`.
  Tests: 4 more SQL (189 in all).
- Review fix pass: every finding of the independent review reproduced by a failing test first, then fixed
  (`REVIEW-FIXES.md` has the table). Highlights: a return is refunded once; a Moyasar timeout is never a failed
  refund (read back and reconciled); payment, parcels and stock in one transaction, one invoice per order, the counter
  and the document in one transaction, and `finish-pending` for anything a failure leaves; products readable with
  `select *` again (review fields in `listing_reviews`); shop pages show only approved text and our own media;
  option pictures screened and reviewed; the marketplace, seller applications, payouts and the test courier switched
  off in the database until Afzal decides; errors in Arabic and English end to end. A test harness now runs the Edge
  Functions (moyasar-webhook, refund-order, finish-pending, after-sale, create-shipment, review-listing,
  screen-image) against the local database with Moyasar and the carriers mocked. Tests: 272 (189 before).

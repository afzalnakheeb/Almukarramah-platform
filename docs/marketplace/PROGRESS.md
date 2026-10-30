# Marketplace build: progress

Branch `shots/market` (worktree `.claude/worktrees/agent-ae2c6e6e0a5430ba3`). Nothing here is applied to the live
database or deployed. Read this first if you are picking the work up.

## Milestones

| | Milestone | State |
|---|---|---|
| M1 | Finish and test the base marketplace and rulebook migrations | done |
| M2 | Categories, Islamic and premium standards, guidance pages | done |
| M3 | AI screening (images at upload, full listing at submission) | done |
| M4 | Onboarding, KYC and admin review | next |
| M5 | Listings with variants, storefronts, search | |
| M6 | Checkout, rulebook, sub-orders, sandbox shipping, order flows | |
| M7 | Statements, returns/disputes, reviews, messages, notifications, performance | |
| M8 | Dashboards, polish, screenshots, docs | |

## Where things are

- Migrations: `supabase/migrations/0012_*` onwards are the marketplace (0010 and 0011 are the apps workstream's).
  The earlier drafts `0009_marketplace.sql` and `0010_rulebook_model_b.sql` were renamed to 0012 and 0013.
  - 0012 sellers, listings, made-to-measure seam, photos · 0013 rulebook tables, KYC, permits, pickup addresses,
    carriers · 0014 category tree and policies, attributes, the Islamic standard, settings, document types, styles
    · 0015 AI screening: media assets, verdict records, strikes, quarantine, rate limits, product documents.
- Shared pure modules (no imports; the app imports them too): `supabase/functions/_shared/quality.ts`,
  `contact.ts`. Server modules: `images.ts` (type sniffing, metadata stripping), `screening.ts` (prompts, parsing,
  decisions; no I/O), `claude.ts` (the Messages API call), `media.ts` (storage + database flows).
- Server functions (M3): `screen-image`, `listing-check`, `screening-retry` (cron), `review-screening` (staff
  overrides), `review-listing` (approval publishes photos), `translate-draft`.
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
- Decisions waiting for Afzal: `docs/marketplace/DECISIONS.md`.

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


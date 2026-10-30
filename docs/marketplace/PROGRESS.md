# Marketplace build: progress

Branch `shots/market` (worktree `.claude/worktrees/agent-ae2c6e6e0a5430ba3`). Nothing here is applied to the live
database or deployed. Read this first if you are picking the work up.

## Milestones

| | Milestone | State |
|---|---|---|
| M1 | Finish and test the base marketplace and rulebook migrations | done |
| M2 | Categories, Islamic and premium standards, guidance pages | done |
| M3 | AI screening (images at upload, full listing at submission) | next |
| M4 | Onboarding, KYC and admin review | |
| M5 | Listings with variants, storefronts, search | |
| M6 | Checkout, rulebook, sub-orders, sandbox shipping, order flows | |
| M7 | Statements, returns/disputes, reviews, messages, notifications, performance | |
| M8 | Dashboards, polish, screenshots, docs | |

## Where things are

- Migrations: `supabase/migrations/0012_*` onwards are the marketplace (0010 and 0011 are the apps workstream's).
  The earlier drafts `0009_marketplace.sql` and `0010_rulebook_model_b.sql` were renamed to 0012 and 0013.
  - 0012 sellers, listings, made-to-measure seam, photos · 0013 rulebook tables, KYC, permits, pickup addresses,
    carriers · 0014 category tree and policies, attributes, the Islamic standard, settings, document types, styles.
- Shared pure modules (no imports; the app imports them too): `supabase/functions/_shared/quality.ts`.
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

# Marketplace build: progress

Branch `shots/market` (worktree `.claude/worktrees/agent-ae2c6e6e0a5430ba3`). Nothing here is applied to the live
database or deployed. Read this first if you are picking the work up.

## Milestones

| | Milestone | State |
|---|---|---|
| M1 | Finish and test the base marketplace and rulebook migrations | done |
| M2 | Categories, Islamic and premium standards, guidance pages | next |
| M3 | AI screening (images at upload, full listing at submission) | |
| M4 | Onboarding, KYC and admin review | |
| M5 | Listings with variants, storefronts, search | |
| M6 | Checkout, rulebook, sub-orders, sandbox shipping, order flows | |
| M7 | Statements, returns/disputes, reviews, messages, notifications, performance | |
| M8 | Dashboards, polish, screenshots, docs | |

## Where things are

- Migrations: `supabase/migrations/0012_*` onwards are the marketplace (0010 and 0011 are the apps workstream's).
  The earlier drafts `0009_marketplace.sql` and `0010_rulebook_model_b.sql` were renamed to 0012 and 0013.
- Tests: `supabase/tests/` (run `npm run test:market`, needs a local PostgreSQL 16; see below).
  - `lib/db.ts` creates a fresh database from `supabase_stub.sql` (a minimal Supabase stand-in) plus every migration,
    and runs SQL as anon, a signed-in user, the service role or the migration owner.
- Decisions waiting for Afzal: `docs/marketplace/DECISIONS.md`.

## Running the tests

```
# a scratch PostgreSQL 16 listening on a unix socket (defaults: /var/run/postgresql, port 54329, user postgres)
PGHOST=/var/run/postgresql PGPORT=54329 npm run test:market
```

## Log

- M1: 0012 (sellers, listings, made-to-measure seam, photos) and 0013 (countries, corridors, permits, KYC,
  product compliance and permits, pickup addresses, carriers, customer delivery prices) reviewed and fixed:
  - renumbered to avoid the apps workstream's 0010/0011; audit for composite-key tables; country locked for sellers;
    sellers can only take a listing back to draft (the server moves it forward); uploads only into
    `<seller>/incoming/` and never overwritten (a screened photo cannot be swapped); permits are their own table with
    staff verification; IBAN check digits; pickup addresses in the seller's country only; provider references
    server-only; corridors cannot carry duties when domestic.
  - shipments, the seller order list and statements moved to the order milestones (0018/0019) where sub-orders are built.
  - 23 tests: `supabase/tests/m1_sellers_rulebook.test.ts`.

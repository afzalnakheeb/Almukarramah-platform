# Al Mukarramah platform: instructions for Claude Code

This repository is Al Mukarramah's own commerce platform: one Expo (React Native) codebase for the website,
the iPhone app and the Android app, with Supabase as the backend. Afzal (the founder) directs the work; Claude writes the code
and also runs the business through the Supabase connector (`.mcp.json`).

## Stack
- `app/` — screens (Expo Router). `(shop)` is the customer app; `admin/` is the backup admin panel (staff only).
- `src/lib/` — Supabase client, i18n (Arabic/English, RTL), cart, money, catalogue queries, RevenueCat.
- `supabase/migrations/` — the database. Every table has row-level security. Never weaken a policy to make something work.
- `supabase/functions/` — server code (Deno): payments (Moyasar), webhooks, shipping, ZATCA invoices, Quran text, AI concierge.

## Rules that must never be broken
1. **Money** is integer minor units (halalas, pence, cents). Prices are VAT-inclusive. The server recalculates every total; never trust amounts sent by the app.
2. **Card data** never touches our code or database. Payments go through Moyasar's hosted page or SDK; only Moyasar tokens are stored.
3. **ZATCA**: every paid order gets a tax invoice from `issueInvoice()`; every refund gets a credit note. Never edit or delete an invoice row; correct with a credit note. Invoice numbers and ICV are gap-free and sequential.
4. **Quran text** from the Quran Foundation API is shown exactly as received: never edited, summarised, translated by AI or reordered. Seerah lessons are published only after `reviewed_by` is set by a qualified scholar.
5. **Digital subscriptions inside the iPhone/Android apps** use app-store billing (RevenueCat). Physical goods and box clubs use Moyasar.
6. **Arabic first**: every user-facing string exists in both `en` and `ar` in `src/lib/i18n.tsx`; layouts must work right-to-left.
7. **Marketing consent** is never switched on automatically.
8. **Approvals**: before running anything that spends money, changes live prices, publishes publicly, refunds, or changes `store_settings`, show Afzal exactly what will change and wait for a yes.
9. **Audit**: staff and Claude changes are logged by database triggers; do not bypass them with raw service-role writes from the app.
10. **Halts are treated as accidental**: Afzal may press the stop button by mistake. Long-running work saves its progress as it goes (e.g. `docs/marketplace/PROGRESS.md`) and is checked on regularly. If work has stopped, tell Afzal and resume it from the saved progress, unless he has said in words to stop it.

## Everyday commands
- `npm install` then `npm run fix-deps` (aligns package versions to the installed Expo SDK)
- `npm run web` — website at http://localhost:8081
- `npx expo start` — scan the QR with Expo Go to try it on a phone
- `npm run typecheck`
- `npx supabase db push` — apply migrations to the linked Supabase project
- `npx supabase functions deploy <name>` — deploy one server function
- `npx eas build --platform ios|android` — store builds (when the developer accounts exist)

## Running the business from Claude
See `docs/run-from-claude.md` for the daily brief, product listing, SEO/AEO/GEO and approval routines,
and `docs/zatca.md` for the e-invoicing set-up.

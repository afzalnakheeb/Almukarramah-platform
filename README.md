# Al Mukarramah platform

Our own store, website and apps: one codebase for the website, iPhone and Android, built and run with Claude.

## What is already built (version 0.1)
- **Storefront** in Arabic and English: home with "What's the occasion?", "Who is it for?" and gifts by budget; shop filters; product pages; bag; checkout with home, hotel or office delivery; delivery options by zone; prices in SAR, AED, GBP, USD and EUR.
- **Payments** through Moyasar's secure payment page (mada, Apple Pay, STC Pay, cards); the order is confirmed only after Moyasar confirms the payment.
- **ZATCA e-invoicing**: a tax invoice with QR code for every paid order, credit notes for refunds, and the data and XML ready for Phase 2 reporting.
- **Membership and subscriptions**: member plan and box clubs; Quran Trail (Quran text from the Quran Foundation API) and Seerah Trail; app-store subscriptions through RevenueCat.
- **Gift concierge** on the Claude API, answering only from the live catalogue.
- **Backup admin panel** (`/admin`, staff only): emergency switches (close store, pause checkout, flag ads paused), orders, refunds, stock, audit log, ZATCA status.
- **Database** with security rules on every table and an audit log of every change.

## Set it up (about one hour, once)
1. **Supabase**: create a free project at supabase.com. In the SQL editor, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
2. **Your staff login**: sign up in the app with your email, then in Supabase run
   `insert into staff_members (user_id, role, name) select id, 'owner', 'Afzal' from auth.users where email = 'YOUR EMAIL';`
3. **Company details**: in `store_settings`, set the real VAT number, CR number and address (used on every tax invoice).
4. **App keys**: copy `.env.example` to `.env` and add the Supabase URL and anon key.
5. **Server secrets** (Supabase > Edge Functions > Secrets): `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, and later `QF_CLIENT_ID`/`QF_CLIENT_SECRET`, `REVENUECAT_WEBHOOK_AUTH`, `ZATCA_MODE`.
6. **Deploy server functions**: `npx supabase link`, then `npx supabase functions deploy`.
7. **Moyasar**: in the Moyasar dashboard, add the webhook URL `https://YOUR-PROJECT.supabase.co/functions/v1/moyasar-webhook` with the same secret token.
8. **Run it**: `npm install`, `npm run fix-deps`, `npm run web`. On a phone: `npx expo start` and scan with Expo Go.

Claude Code can do steps 4 to 8 for you: open this folder in Claude Code and say "set up the project".

## Publishing
- **Website**: `npm run build:web`, then upload the `dist` folder to Cloudflare Pages (free).
- **Apps**: Apple Developer (USD 99 a year) and Google Play (USD 25 once), then `npx eas build` and `npx eas submit`.

## Not finished yet (next steps for Claude Code)
- OTO live shipping rates and labels (zone rates work now).
- Moyasar saved cards for automatic box-club renewals (needs recurring enabled by Moyasar).
- ZATCA Phase 2: connect a certified provider's API in `zatca-report`, or complete Fatoora onboarding for direct reporting.
- Product photos, the full catalogue import, the brand design from our design canvas, and the partner and creator portals.

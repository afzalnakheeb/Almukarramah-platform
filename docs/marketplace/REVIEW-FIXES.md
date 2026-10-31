# Marketplace: fixes after the independent review

The review before switch-on (31 October 2026) found 6 High, 15 Medium and 11 Low issues. Each one below was first
reproduced by a test that failed on the reviewed code (commit `ae59a8b`), then fixed. Nothing has been applied to the
live database or deployed. Statuses: **FIXED**, **NEEDS-AFZAL** (a safe default is in place and enforced; the
decision is at the top of `DECISIONS.md`), **LEFT** (with the reason).

Tests live in `supabase/tests/`: `review_high.test.ts`, `review_medium.test.ts`, `review_text.test.ts` and
`edge_functions.test.ts`. The last one runs the Edge Functions themselves under Node against the local test database
(`lib/edge.ts`): supabase-js is a local stand-in that runs every call as SQL with the caller's role, Moyasar is a
programmable mock (answers, timeouts before and after it acts, 5xx and HTML pages, dropped connections, definite
rejections, duplicate and concurrent webhooks) and the carriers are mocked (timeouts, 5xx).

## High

| | Finding | Fix | Test | Status |
|---|---|---|---|---|
| H1 | A return could be refunded twice (a new key each time), with the delivery added again. | `mp_prepare_refund` refunds a return once whatever the key; unique indexes allow one live refund per return and one refund waiting for Moyasar per order. | `review_high`: H1 (2 tests) | FIXED |
| H2 | A Moyasar timeout or 5xx was recorded as a failed refund, inviting a second real refund. | `_shared/moyasar.ts` tells a definite refusal (400/401/403/404/422 with Moyasar's JSON) from an unknown outcome (timeout, dropped connection, 5xx, HTML page). Only a refusal marks the refund failed. Otherwise it stays processing: the payment is read back at once (Moyasar's refunded total less what we recorded), then by "Check with Moyasar" (`refund-order`, `action: "reconcile"`) and `finish-pending`; it is marked failed only if Moyasar still shows no refund after 15 minutes. No other refund can start on the order meanwhile. The admin button shows "waiting", never "failed". | `edge_functions`: refund-order (6 tests: timeout after the refund, read-back timeout then reconcile, 5xx, 400, network) | FIXED |
| H3 | A paid order could be left unprocessed and uninvoiced; nothing finished pending invoices or credit notes. | `mp_payment_received`: paid, parcels handed on, stock taken and a box club started in one transaction, only if the order was waiting. `mp_issue_document`: the invoice counter and the document in one transaction, one invoice per order (unique index), the existing one returned on a retry. New `finish-pending` job (every 15 minutes, and "Finish pending work now" for owner, manager, finance): missing invoices and credit notes, orders not handed on, refunds waiting for Moyasar. The dashboard counts what is waiting. | `edge_functions`: moyasar-webhook H3 (2), finish-pending H3 | FIXED |
| H4 | 0017's column grants broke `select *` on products for main and the apps branch. | No column grants. The review-only fields (notes, AI findings, reviewers, compliance notes) moved to `listing_reviews` (staff and the listing's seller only; written only by the server). main's and the apps branch's catalogue queries run unchanged after 0012 to 0020. | `review_high`: H4 (3, including main's `PRODUCT_FIELDS` with embedded tables as anon) | FIXED |
| H5 | An approved seller could put an outside logo or banner, contact details or a misleading name on their public shop page. | Logo and banner: only the seller's own screened upload (`<seller>/media/<id>.<ext>`), published by our team to our catalogue storage; the shop page shows only that. Shop text: contact details, links and our name are refused; once a shop is live, text changes wait for our team's approval (`profile_pending`; "Shop page changes" on `/admin/sellers`) and the page keeps the approved text. | `review_high`: H5 (3) | FIXED |
| H6 | Made-to-measure design-option pictures went public on approval without screening, unseen by the reviewer. | Option pictures must be the seller's own screened uploads (links refused), must pass the photo check before the listing is sent and before approval, are shown to the reviewer with their check result, and are published by the approval like the photos. | `review_high`: H6 (2); `edge_functions`: review-listing H6, approval publishes | FIXED |

## Medium

| | Finding | Fix | Test | Status |
|---|---|---|---|---|
| M1 | The price guard was per change, so a price could move any distance in steps, or change during review. | The limit is measured from the price our team last approved (products and options); a price changed while waiting for review sends the listing back through the check. | `review_medium`: M1 (4) | FIXED |
| M2 | Options were never screened and could change during review. | Options are content: adding, changing or removing one sends the listing back (also while waiting); the checks and reviewers see them; removing the last option leaves no stale stock. | `review_medium`: M2 (3); `review_text`: option labels | FIXED |
| M3 | Contact details had unguarded channels, and masking was easy to bypass. | `contact.ts` rewritten (Arabic and full-width digits, letters for digits, any separators, numbers spelled out in English and Arabic, spoken emails, spaced app names, IBANs, invitations to pay outside, a number split across two messages). The same checks run on listing details and options, shop text (H5) and a seller's cancellation reason (now through `after-sale`); the label no longer prints the customer's full phone. | `review_text`: M3 (14); `edge_functions`: messages, M3 cancel reason | FIXED |
| M4 | A failed attempt followed by a delivery stayed "failed" for ever. | A delivery after a failure counts, at the carrier's time; a failure as the latest news still shows. | `review_medium`: M4 (2) | FIXED |
| M5 | Partners were credited the full VAT-inclusive retail price. | Nothing is booked as payable to a partner until their terms are decided; finance can add an adjustment with a reason. | `review_medium`: M5 | NEEDS-AFZAL (E) |
| M6 | `EXPO_PUBLIC_MARKET_LIVE` was not a gate. | `mp_settings.marketplace_open` and `sellers_open`, off by default, checked in the database (the products and sellers read policies, storefronts, search, returns, reviews, messages, applications, listing checks) and by the functions (checkout, payment, photo screening). The test courier is off by default. Switching on is Afzal's call. | `review_medium`: M6 (2) | FIXED; switching on NEEDS-AFZAL (A, B) |
| M7 | The undo plan in SWITCH-ON was not accurate. | SWITCH-ON.md corrected: what changes for the existing shop, no grants to undo, the database switch as the first undo step, which function versions move together. An order made by an older `create-payment` (no parcels) now still takes its stock once (`orders.stock_taken_at`). | `edge_functions`: M7 (older checkout order) | FIXED |
| M8 | Arabic readers saw English or a generic error. | The app reads the function's answer (`error`, `error_ar`, `code`) instead of supabase-js's fixed message and shows it in the app's language (`src/lib/app-error.ts`); database refusals carry their Arabic in the error's detail (118 customer- and seller-facing ones were missing); the functions answer in both languages. | `review_text`: M8 (4, including a scan that every customer- or seller-facing refusal has Arabic); `edge_functions`: M8 | FIXED |
| M9 | Credit notes used today's VAT setting and exchange rate; the counter was taken in a separate transaction. | Invoices keep their VAT rate and exchange rate; a credit note uses its invoice's; the counter is taken with the document (H3). | `edge_functions`: M9 (VAT rate changed, exchange rate changed) and the gap-free counter checks | FIXED |
| M10 | Two webhook deliveries at once could issue two invoices. | The order row is locked; one invoice per order (unique index); the existing invoice is returned. | `edge_functions`: M10 | FIXED |
| M11 | `create-shipment` bought a label before checking for an active one. | It checks first (and that the carrier is active); a carrier failure buys and records nothing. | `edge_functions`: create-shipment (2) | FIXED |
| M12 | Bank details were open to too many staff; payouts were not held after a bank change. | Only the seller, owner, manager and finance read bank details; a change needs KYC approval again and waits 7 days before any payout. | `review_medium`: M12 (2) | FIXED |
| M13 | Return approvals were not attributed to a person. | The approver is recorded on the return, and server functions act as the person so the audit log names them. | `edge_functions`: M13 | FIXED |
| M14 | Seller text was not marked as untrusted, and a clean fast-model pass was final. | Listings go to the model as data, with an instruction never to follow instructions inside; new sellers always get the stronger model; answers neither model can read go to a person. | `review_text`: M14 (3) | FIXED |
| M15 | Approval was not conditional on the listing being unchanged. | `mp_approve_listing` approves only the version that was read; an edit meanwhile sends nothing live. | `edge_functions`: M15 | FIXED |

## Low

| | Finding | Fix | Test | Status |
|---|---|---|---|---|
| L1 | Staff could insert an already-approved seller. | The guard runs on insert too. | `review_medium`: L1 | FIXED |
| L2 | Side-effect functions in `private` were executable by the API roles. | Revoked. | `review_medium`: L2 | FIXED |
| L3 | A request with no role claim was treated as the server. | Only a real server session counts. | `review_medium`: L3 | FIXED |
| L4 | Sellers were paid before the 30-day problem window closed; a return left "accepted" held money with no end. | Payable after the longer of the return window and the problem window, plus the hold. Automatic closing of returns left "accepted": not built. | `review_medium`: L4; `e2e_journey` step 5 | FIXED; auto-close NEEDS-AFZAL (L) |
| L5 | Any account could trigger 30 AI image checks an hour. | A customer needs an order that can have a review or return photo; sellers only once applications are open. | `edge_functions`: L5 | FIXED |
| L6 | Stock was checked per line, with no reservation at checkout. | Lines of the same product or option are checked together. | `review_medium`: L6 | FIXED; reservation LEFT (a reservation table and expiry is a larger change; stock never goes below 0 at payment, and an oversold order is cancelled and refunded by our team) |
| L7 | `delivered_at` was the time we heard, not the carrier's. | The carrier's event time is used. | `review_medium`: M4 | FIXED |
| L8 | Category commission rates are public. | Unchanged; for Afzal to decide. | none | NEEDS-AFZAL (K) |
| L9 | The sandbox webhook key defaulted to `CRON_SECRET`. | Its own secret is required. | `review_text`: L9 | FIXED |
| L10 | A payout dated up to 31 days back changed a closed month. | Booked on the day it is recorded; the bank's date is kept. | `review_medium`: L10 | FIXED |
| L11 | RTL. | No defect found; every new string is in English and Arabic (1,236 keys each). | key count check | nothing to fix |
| X1 | (Found during the fixes.) A return request stopped a customer deleting their account. | The return is kept for the accounts, unlinked from the person. | `review_medium`: X1 | FIXED |

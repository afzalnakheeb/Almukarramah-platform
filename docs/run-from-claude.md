# Running Al Mukarramah from Claude

Claude reaches the platform through the Supabase connector in `.mcp.json` (Claude Code) — connect it once with
`claude mcp add` or by opening this folder in Claude Code and approving the connector. Marketing apps connect through
Windsor.ai and the other connectors in the Claude app.

## Everyday requests (just ask in plain words)
- "Add a new product: Sukkari dates 1 kg, SAR 95, 40 in stock, for Ramadan and corporate gifts. Write the Arabic and English description and SEO fields."
- "Show me today's orders and anything late."
- "Which products are low on stock? Draft purchase orders for Musab."
- "Mark order AM-104912 as shipped with SMSA tracking 123."
- "Refund AM-104913 because the box arrived damaged." (Claude shows the refund and credit note first and waits for approval.)
- "Close the store tonight from 11 pm for stock-taking." (needs approval)
- "How many invoices have not been reported to ZATCA?"

## Scheduled tasks to set up in Claude
| When | Task |
| --- | --- |
| Daily, 7 am Riyadh | Sales, orders to pack, low stock, late deliveries, unreported invoices, ad spend; send the brief |
| Sunday | SEO/AEO/GEO check: Search Console data, pages to improve, new FAQ and guide drafts for approval |
| Sunday | Update fx_rates from a reliable source; review prices in GBP, USD, EUR |
| 1st of month | Sales and VAT summary for the accountant; subscriptions and churn |

## The marketplace (once it is switched on: see `docs/marketplace/SWITCH-ON.md`)
- "What needs doing on the marketplace today?" Claude reads `admin_marketplace_overview()`: sellers, shop page
  changes and listings to review, returns waiting, disputes, refunds to make, credit notes still to issue, refunds
  waiting for Moyasar's answer, half-done work (`pending_work`), reviews to publish, flagged conversations, parcels
  late to ship or not collected, the switches, and the last 30 days' sales and commission.
- Half-done work (an order without its tax invoice, a credit note not issued, a refund waiting for Moyasar) is
  finished by the `finish-pending` job every 15 minutes. If the count stays above zero, Claude reports the reason the
  job gives; it never re-runs a refund. A refund still "processing" is settled only by reading the payment back from
  Moyasar ("Check with Moyasar" on `/admin/returns`, or finance's "Settle by hand" after checking Moyasar's dashboard).
  Orders paid more than 7 days ago without an invoice (`orders_without_invoice_old`) are never invoiced by the job:
  Claude lists them for the accountant.
- "Payments to resolve" (`payment_issues`): a payment Moyasar took for an order that was cancelled, already paid or of
  another amount. Claude reports each one with its order and amount; refunding it, attaching it to its order or
  closing it is finance's decision on `/admin/returns`, never Claude's without approval.
- "Show me the dispute on R-104902-1 and suggest a decision." Claude reads the return, the conversation and the photos'
  screening; the decision and any refund wait for approval.
- "Which sellers can be paid this week?" Claude lists what is payable (`admin_payouts()`); finance makes the bank
  transfers and records them. Claude never records a payout or makes a refund without approval. Payouts stay switched
  off until Afzal switches them on (`docs/marketplace/DECISIONS.md`, "Needs Afzal").
- The marketplace switches (`mp_settings`: `marketplace_open`, `sellers_open`, `payouts_enabled`, support's refund
  limit) are Afzal's decisions: Claude shows the statement and waits for his yes, like any change to store settings.
- Daily brief: add the marketplace queues. Weekly: `select mp_performance_review();` warns sellers below the standard
  (it never suspends while `perf_auto_suspend` is off).

## Approval rule
Claude prepares; Afzal approves anything that spends money, changes live prices, publishes publicly, refunds, or changes store settings.
Everything Claude changes is recorded in `audit_log`, visible in the admin panel.

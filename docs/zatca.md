# ZATCA e-invoicing in the platform

## What happens on every sale
1. Moyasar confirms the payment (`moyasar-webhook`).
2. `issueInvoice()` creates a **simplified tax invoice** (B2C):
   - gap-free number `INV-YYYY-000001` and invoice counter value (ICV), plus a UUID;
   - VAT at 15% included in the price (exports can be zero-rated only after the accountant confirms, using `store_settings.zero_rate_exports`);
   - totals in the order currency and in SAR (VAT is always reported in SAR);
   - the **QR code** (TLV tags 1–5: seller name, VAT number, timestamp, total with VAT, VAT) required in Phase 1;
   - a UBL 2.1 XML copy of the invoice.
3. A refund creates a **credit note** `CN-YYYY-…` that references the original invoice and the reason.
Invoices are never edited or deleted; corrections are made with credit notes.

## Phase 2 (integration with ZATCA's Fatoora platform)
Phase 2 applies when ZATCA notifies the business of its wave. Then `zatca-report` runs every 15 minutes and:
- adds the **previous invoice hash (PIH)** and the invoice hash to each invoice, strictly in ICV order (the hash chain);
- sends each invoice for **reporting** (simplified invoices, within 24 hours). Standard B2B invoices need **clearance** before they are given to the buyer — add this before issuing B2B invoices.

Two ways to connect, set with the `ZATCA_MODE` secret:
- `provider` — a ZATCA-certified e-invoicing provider signs and reports for us. Fastest; adapt `toProvider()` to the provider's API (for example an accounting system with a ZATCA e-invoicing API).
- `direct` — our own connection: generate a CSR, onboard on the Fatoora portal, pass the compliance checks, get a production CSID, then sign each invoice (ECDSA) and add QR tags 6–9. Validate the XML and hashing with ZATCA's SDK before going live.

Until then `ZATCA_MODE=off`, and the Phase 1 invoice with QR is issued and stored for every sale.

## What the accountant must confirm
- The VAT number, CR number and address in `store_settings`.
- Treatment of exports outside Saudi Arabia (zero-rating evidence) and of digital memberships sold to customers abroad.
- Which provider to use for Phase 2, or whether to onboard directly.
- That app-store subscription revenue is invoiced by Apple and Google as sellers to the customer, and how it is recorded.

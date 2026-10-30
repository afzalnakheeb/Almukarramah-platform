# Marketplace: decisions for Afzal

Each item below is a default chosen to be conservative so the build could carry on. All of them are settings or
policy rows that staff can change (owner or manager, audited), unless marked otherwise. Please reply yes, or tell us
what to change.

## Platform and process

1. **Migration numbers.** The marketplace migrations are `0012` onwards, because the apps workstream already uses
   `0010_account_deletion.sql` and `0011_assistant_reports.sql`. The live database records its migrations with
   timestamp versions, so the switch-on applies these files one by one (see SWITCH-ON.md), not `supabase db push`.
2. **Corridors need an adviser on record.** A corridor can only be opened (pilot or open) after the tax adviser's
   name and sign-off date are recorded, and its VAT/duty terms cannot change while open without a new sign-off.
   The phase 1 corridors are seeded open because the business already trades on them: please record the adviser's
   sign-off for them from the admin panel.
3. **Commission.** Each category has a commission rate (25% to 50%). A seller can have a negotiated rate set by
   owner/manager, which then applies to all their lines. Recorded per order line.
4. **Who moves a listing.** A seller can only save drafts and withdraw. Submission goes through the AI screening on
   the server; only the server puts a listing in the staff queue, and only the approval function (staff) puts it live.
5. **Price changes on live listings.** A seller can change stock freely. A price change of more than 30% on a live
   listing sends it back to our team (setting `price_change_review_bps`).

## Categories and policies (M2)

All of these are per-category settings in the category tree (owner/manager edit; marketing can rename and
re-photograph categories but not change their policy).

6. **Commission.** Every category starts at 25%, the bottom of the agreed 25%–50% range. Please set the rate per
   category (or per seller) before launch.
7. **Returns (please check against the Saudi e-commerce law with the legal adviser).**
   - Fragrance and natural care: unopened and sealed, within 7 days.
   - Dates and food: only if faulty or not as ordered, within 3 days.
   - Made-to-measure garments: only if faulty or not as ordered (category policy `mtm_return_policy`).
   - Everything else: within 14 days.
8. **Food and care shelf life.** At listing, the best-before date must be at least 90 days away for food and
   180 days for natural care and miswak.
9. **Photos.** At least 3 photos (5 for fashion), each at least 1600 px on the long side; minimum quality score 70
   out of 100 to submit.
10. **No human models.** Product photos show no people (flat-lay, mannequin, ghost mannequin; a hand holding a small
    piece is fine). The setting "modestly dressed models for modest fashion" exists and is OFF.
11. **Always reviewed by our team:** Islamic books, printed mushafs, calligraphy, children's books (our team checks
    the content before anything goes live; the AI cannot pass these on its own).
12. **Documents required:** printed mushaf → licensed-printer certificate; Islamic books → content approval;
    sweets and halal cosmetics → halal certificate; any brand the seller does not own → authorised-distributor letter.
    SFDA eCosma (perfume, oud, cosmetics) and SFDA food registration are required to sell into or within Saudi Arabia.
13. **Made-to-measure seam.** Six regional styles are active (Saudi thobe, Emirati kandura, Kuwaiti and Omani
    dishdasha, Qatari and Bahraini thobe); abaya and ghutra are added but inactive. Each listing declares the
    measurements that brand needs; the default measurement lists per style are left for the tailoring workstream.

## The Al Mukarramah Islamic standard (M2)

The standard is store policy reviewed by a qualified scholar, not a fatwa. Every rule is a row Afzal's team can edit.

14. **Prohibited (auto-reject, counts as a strike):** alcoholic drinks; pork and non-halal food; gambling; drugs;
    weapons; adult or immodest products and imagery; idols and items for the worship of other faiths; sorcery and
    fortune-telling; counterfeits; Zamzam water; sacred text where it is disrespected (floor, feet, bathroom,
    disposable); gold jewellery and pure-silk garments for men; tobacco, shisha and vapes.
    Added from the earlier seller guidelines: depictions of prophets, the Prophet's family or Companions; extremist,
    sectarian or offensive material.
15. **Severe (the listing is suspended at once and the seller flagged):** drugs, weapons, adult or immodest content,
    sacred text where it is disrespected, depictions of prophets. The other prohibited items count as strikes.
16. **Restricted, our team decides; please have the scholar confirm each default:**
    - musical instruments (the guidance notes the daff is widely accepted for weddings and Eid);
    - figurines, dolls and toys with faces, and decorative images of people or animals;
    - amulets, ta'weez and "evil eye" items (claims of protection or healing are never allowed);
    - antiques (provenance and export papers);
    - claimed Kiswah or Haramain pieces (official documents);
    - books (content review);
    - ceremonial swords and khanjars.
17. **Gold-plated jewellery or silk blends for men** go to staff review rather than auto-reject.
18. **Keywords never reject on their own.** The keyword lists in each rule only send a listing to staff review; the
    AI's judgement (and our team) decides. This avoids false rejections such as "oud" (the fragrance, not the lute),
    "wine red" (a colour) or "Islamic rosary" (a tasbih).

## AI screening (M3)

19. **What the automatic check decides.** It can only send a listing back to the seller (with the reasons in English
    and Arabic) or pass it to our team with notes. It never puts anything live: every listing is approved by a person.
    Listings it sends back never appear in the approval queue; staff can still see them under "Rejected by the check"
    and override with a written reason (recorded, and any strike is cancelled).
20. **When unsure, people decide.** Low confidence, a restricted item, sacred text, a possible counterfeit logo or a
    "block" the strong model is not sure about all go to our team rather than being rejected. Problems the seller can
    fix (contact details in the text, photo quality, a photo that shows a person) are sent back straight away.
21. **People in photos.** Any person in a product photo sends the photo back (hands holding a small item are fine).
    With the setting "modestly dressed models for modest fashion" switched on, modest-fashion photos with a modestly
    dressed model go to our team instead. The setting is off.
22. **Strikes.** A prohibited item or image is a strike. Three strikes within 90 days suspend the seller until our
    team reviews the account. Severe cases (drugs, weapons, adult or immodest content, disrespected sacred text,
    depictions of prophets) suspend the listing at once and flag the seller. All three numbers are settings.
23. **Quarantine.** Prohibited images are moved to a private bucket only owner, manager and marketing staff can open,
    and deleted after 30 days (setting). Their fingerprint (SHA-256) is blocked so the same file cannot be uploaded
    again by anyone.
24. **Limits.** 120 photo uploads an hour and 60 listing checks a day per seller; 100 AI translation drafts a day.
25. **Models.** A fast model checks everything; a stronger model looks again when the fast one is unsure or wants to
    reject. Defaults are the models the site already uses (`claude-haiku-5-5` and `claude-sonnet-5-5`); they can be
    changed with `SCREENING_FAST_MODEL` and `SCREENING_STRONG_MODEL` without a code change. No new secret is needed:
    the existing `ANTHROPIC_API_KEY` is used.
26. **AI drafts of the second language.** Sellers can ask for a draft of the Arabic (or English) text to check and
    edit. Quranic text is never sent for translation or rewriting: the draft leaves it out and tells the seller to
    add it exactly as printed.
27. **Staff pages stay in English.** The admin panel is internal and English-only, as it is today; everything sellers
    and customers see is in English and Arabic.

## Onboarding (M4)

28. **What approval needs.** The KYC approved, the product sample passed (or marked "not needed" by our team), an
    open marketplace corridor from the seller's country (or a pilot that includes them) and at least one approved
    category. The database refuses an approval without them; staff cannot approve directly through the API.
    The sample requirement is a setting (`require_sample`, on); so is the KYC one (`require_kyc_before_approval`, on).
29. **What the file needs before it can be sent.** A story of at least 100 characters with the relationship to the
    brands and years trading; at least 3 portfolio photos that passed the photo check; the legal entity (name, type,
    registration number); a tax number where the country requires one; a bank account in the legal entity's name
    (IBAN in the Gulf); the documents the country requires; a pickup address; the guidelines accepted. The numbers are
    settings (`min_story_chars`, `min_portfolio_photos`).
30. **Categories per seller.** Sellers list only in categories approved for them; approving a department or group
    covers everything under it. Our own partners list wherever our team puts them.
31. **Asking for more.** Our team's message appears on the seller's dashboard; the seller updates the file and sends
    it again. Every step is kept in the review history (never edited); staff notes are not shown to the seller.
32. **Logo and banner.** Screened at upload like every photo, and published by our team: at approval, or later with
    "Publish logo and banner". Until then the shop page shows none.
33. **Brand papers.** An authorised-distributor letter names the brand it covers and counts for that brand's
    listings only. Marketing (who review listings) see brand papers; KYC files stay with owner, manager and finance.
34. **Where sellers come from.** Applications are taken only from countries with a marketplace corridor: Saudi
    Arabia (open), the UAE, Kuwait and Qatar (phase 2, closed) and India (phase 3, closed, low priority, data only).

## Focus markets (Afzal, 31 October)

35. **Customers we focus on:** the GCC, the UK, Europe, the US, Canada and Australia. India is not a focus market:
    customers there are welcome, but nothing India-specific is built; its corridor stays closed and its rows are data.
36. **Import VAT/GST abroad.** Each destination records its regime for low-value parcels (`border`, `uk_low_value`,
    `eu_ioss`, `au_low_value`, `nz_low_value`, `ca_low_value`) and whether we are registered to collect it (with our
    number); each corridor records whether that route charges it at checkout. A route that collects it cannot open
    until our registration is recorded on the country, as well as the adviser's sign-off.
37. **Seeded, closed:** Saudi sellers' goods to the UK, the US, Canada, Australia, New Zealand and ten EU states
    (Germany, France, Italy, Spain, the Netherlands, Belgium, Ireland, Austria, Sweden, Denmark), phase 2. Every tax
    value is a placeholder **to confirm with the adviser** in the legal phase; thresholds are left empty. Our own
    products keep shipping worldwide as today.
38. **Delivery prices abroad** must be set for each of those routes before it opens (the catch-all price today is
    the Gulf price).

## Listings and search (M5)

39. **Options.** A listing can have options (sizes, volumes, colours), each with its own stock and, if different, its
    own price. Adding an option to a live listing, or renaming one, sends it back to draft for checking; stock changes
    never do.
40. **Price changes.** Up to 30% at once on a live listing (setting `price_change_review_bps`); a bigger change takes it
    off sale until our team approves it, with a note of the old and new price.
41. **What the public can read.** Listing text, photos, prices, stock and details; never the automatic check's notes,
    our team's notes or who reviewed it.
42. **Search.** English and Arabic together; diacritics, tatweel and letter variants (أ/إ/آ/ا, ى/ي, ة/ه) do not matter;
    each word matches the start of a word; attribute values are searched, attribute names are not. Our own products
    and every approved seller's live listings appear together; sellers' shops can be searched on their own.

## Checkout, shipping and the seller's orders (M6)

43. **Prices stay as shown.** Prices are VAT-inclusive; the VAT inside a price is the rate the corridor applies
    (Saudi 15% today). Delivery is VAT-inclusive at the same rate. Customs duties, when paid at checkout (DDP), are
    added on top. Our own exports stay as today (zero-rated only once `store_settings.zero_rate_exports` is on).
44. **Who accepts.** Our own products are accepted as soon as payment is confirmed; each seller accepts their part.
    The ship-by date is acceptance + production days (made to measure) + the seller's handling days.
45. **A seller who cannot fulfil** cancels with a reason the customer sees; stock goes back and the part is flagged
    for our team to refund (refunds stay staff-only, M7). A label must be cancelled before the order can be.
46. **Labels.** Bought by the seller (or our operations team) through the approved carrier for the route, with an
    idempotency key (pressing twice never buys two); kept private (the seller of the order and operations staff).
    Pickup is offered the next working day (Friday skipped) within the address's hours.
47. **Tracking.** Carriers push events (signed webhooks) or we ask every 15 minutes; events are never edited, never
    counted twice and never move a parcel backwards (a failure, return or cancellation always shows).
48. **Invoices.** The ZATCA invoice covers what we sell: our own products and the sub-orders where we are the
    supplier. Parts a seller invoices (corridors not open yet) are left out, and so are duties collected for customs
    (to confirm with the adviser). An order whose lines need different VAT rates is never invoiced at one rate: it is
    flagged for our team (it cannot happen on the corridors open today).
49. **Sandbox until the accounts exist.** All marketplace shipping runs on the sandbox provider (no real parcels);
    OTO, Shiprocket and DHL Express are listed but not connected. The sandbox signs its webhooks with `CRON_SECRET`
    unless `SANDBOX_WEBHOOK_SECRET` is set; no new secret is needed.


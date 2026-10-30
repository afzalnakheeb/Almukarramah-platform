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

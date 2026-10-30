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

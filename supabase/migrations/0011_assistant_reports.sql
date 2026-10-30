-- Reports of the assistant's replies. Google Play's AI-generated content policy asks that people can flag offensive
-- AI output without leaving the app: "Report this reply" under each answer in the apps writes a row here.
-- Anyone may add a report (guests too); only owner, manager and support staff can read them or mark them reviewed.
-- The reporter's account is linked when signed in and unlinked if the account is deleted.
-- Not applied yet: apply with `npx supabase db push` (or the Supabase connector) once Afzal approves.

create table if not exists public.assistant_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reply text not null check (char_length(reply) between 1 and 4000),
  question text check (char_length(question) <= 1200),
  page text check (char_length(page) <= 200),
  lang text check (lang in ('ar', 'en')),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  reviewed_at timestamptz
);

alter table public.assistant_reports enable row level security;

create policy "anyone can report a reply" on public.assistant_reports
  for insert to anon, authenticated
  with check ((user_id is null or user_id = auth.uid()) and reviewed_at is null);

create policy "staff read reports" on public.assistant_reports
  for select using (private.is_staff(array['owner', 'manager', 'support']::staff_role[]));

create policy "staff mark reports reviewed" on public.assistant_reports
  for update using (private.is_staff(array['owner', 'manager', 'support']::staff_role[]));

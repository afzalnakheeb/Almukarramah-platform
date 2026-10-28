-- Daily usage counter for the AI shopping assistant (cost and abuse control).
-- Keys are hashed visitor identifiers or 'all' (store-wide); no personal data is stored.
create table if not exists public.assistant_usage (
  key text not null,
  day date not null default (now() at time zone 'Asia/Riyadh')::date,
  count integer not null default 0,
  primary key (key, day)
);

alter table public.assistant_usage enable row level security;
-- No policies: only the server (service role) reads or writes this table.

-- Atomically counts one request and returns the new total for today.
create or replace function public.assistant_hit(p_key text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.assistant_usage as u (key, day, count)
  values (p_key, (now() at time zone 'Asia/Riyadh')::date, 1)
  on conflict (key, day) do update set count = u.count + 1
  returning u.count;
$$;

revoke all on function public.assistant_hit(text) from public, anon, authenticated;
grant execute on function public.assistant_hit(text) to service_role;

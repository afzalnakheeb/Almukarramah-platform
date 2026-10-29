-- Orders placed as a guest are linked to the account when the shopper later signs in with the same (verified) email.
create or replace function public.claim_my_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  n integer;
begin
  if uid is null then return 0; end if;
  select email into mail from auth.users where id = uid and (email_confirmed_at is not null or confirmed_at is not null);
  if mail is null then return 0; end if;
  update orders set user_id = uid, updated_at = now() where user_id is null and lower(email) = lower(mail);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.claim_my_orders() from public, anon;
grant execute on function public.claim_my_orders() to authenticated;

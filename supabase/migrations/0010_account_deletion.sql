-- Account deletion (App Store Guideline 5.1.1(v); Google Play's account deletion rule).
-- Called only by the delete-account server function (service role), after the customer confirms in the app or on
-- /delete-account. The function then deletes the auth user, and everything still tied to it cascades (identities,
-- sessions, saved measurements once the marketplace is live).
--
-- What the law makes us keep stays: tax invoices are never edited or deleted, and the orders they (or a payment)
-- belong to are kept for the accounts, unlinked from the person and stripped of the email address, phone number,
-- hotel stay dates and gift message. The name and delivery address stay on those orders because they are printed on
-- the invoice itself (which cannot change) and a credit note for a later refund must match it.
-- Unpaid orders that never got an invoice are removed.
-- Every change goes through the normal audit triggers; one ACCOUNT_DELETED row records the deletion itself.
--
-- Not applied yet: apply with `npx supabase db push` (or the Supabase connector) once Afzal approves.

create or replace function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_seller boolean := false;
  v_ids uuid[];
  v_kept integer := 0;
  v_removed integer := 0;
begin
  if p_user is null then
    raise exception 'no user';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;

  -- Staff accounts are removed by the owner, never from the shop (it would silently drop the staff role).
  if exists (select 1 from staff_members where user_id = p_user) then
    raise exception 'staff_account';
  end if;

  -- Marketplace sellers close their shop with us first (orders to ship, payouts). The table exists once the
  -- marketplace migration is applied.
  if to_regclass('public.seller_members') is not null then
    execute 'select exists (select 1 from public.seller_members where user_id = $1)' into v_seller using p_user;
    if v_seller then
      raise exception 'seller_account';
    end if;
  end if;

  -- The person's orders: those on the account, and guest orders placed with the same email address.
  -- Locked, so a payment confirmation arriving now waits for this to finish.
  perform 1 from orders o
  where o.user_id = p_user or (o.user_id is null and v_email is not null and lower(o.email) = v_email)
  for update;
  select coalesce(array_agg(o.id), '{}') into v_ids
  from orders o
  where o.user_id = p_user or (o.user_id is null and v_email is not null and lower(o.email) = v_email);

  -- An order on its way keeps its delivery details until it arrives.
  if exists (select 1 from orders where id = any(v_ids) and status in ('paid', 'packing', 'shipped')) then
    raise exception 'orders_in_progress';
  end if;
  -- A payment started in the last 30 minutes may still be confirmed by Moyasar.
  if exists (select 1 from orders where id = any(v_ids) and status = 'pending_payment' and created_at > now() - interval '30 minutes') then
    raise exception 'payment_in_progress';
  end if;

  -- Never paid and never invoiced: nothing to keep (their items go with them).
  delete from orders o
  where o.id = any(v_ids)
    and o.status in ('pending_payment', 'cancelled') and o.payment_id is null and o.paid_at is null
    and not exists (select 1 from invoices i where i.order_id = o.id);
  get diagnostics v_removed = row_count;

  -- Everything else is a record the law makes us keep: unlinked and stripped of contact details.
  update orders o
  set user_id = null,
      email = null,
      gift_message = null,
      ship_to = o.ship_to - array['phone', 'check_in', 'check_out'],
      updated_at = now()
  where o.id = any(v_ids);
  get diagnostics v_kept = row_count;

  -- Personal data that is not a record: removed now (it would also cascade with the auth user). Website box-club
  -- subscriptions end here, so they are never charged again; the saved Moyasar card token goes with the row.
  delete from addresses where user_id = p_user;
  delete from lesson_progress where user_id = p_user;
  delete from subscriptions where user_id = p_user;
  delete from profiles where id = p_user;

  insert into audit_log (actor, actor_label, table_name, row_id, action, new_data)
  values (p_user, 'customer: account deleted by its owner', 'auth.users', p_user::text, 'ACCOUNT_DELETED',
          jsonb_build_object('orders_kept_unlinked', v_kept, 'unpaid_orders_removed', v_removed));

  return jsonb_build_object('orders_kept_unlinked', v_kept, 'unpaid_orders_removed', v_removed);
end;
$$;

-- Only the server may call it: it takes any user id.
revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

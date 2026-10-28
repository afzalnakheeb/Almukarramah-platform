-- Trigger functions are never called directly.
revoke execute on function audit_trigger() from public, anon, authenticated;
revoke execute on function audit_settings() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;

-- Role checks used by row-level security move out of the public API schema (not callable over /rpc),
-- but stay executable so the policies keep working.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;
alter function is_staff(staff_role[]) set schema private;
alter function private.is_staff(staff_role[]) set search_path = public;
alter function is_member() set schema private;
alter function private.is_member() set search_path = public;

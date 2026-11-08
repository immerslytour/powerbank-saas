-- =====================================================================
-- Tighten EXECUTE privileges flagged by the Supabase security advisor.
-- Trigger functions never need EXECUTE for the caller (checked only at
-- CREATE TRIGGER time). Helper functions used inside RLS policies stay
-- executable by `authenticated`; internal-only helpers are service-only.
-- (rate_limits intentionally has RLS with no policies: service role only.)
-- =====================================================================
revoke execute on function public.enforce_machine_limit() from public, anon, authenticated;
revoke execute on function public.enforce_location_limit() from public, anon, authenticated;
revoke execute on function public.guard_last_owner() from public, anon, authenticated;
revoke execute on function public.guard_membership_rank() from public, anon, authenticated;
revoke execute on function public.guard_invitation_rank() from public, anon, authenticated;
revoke execute on function public.machines_enforce_simulated() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

revoke execute on function public.tenant_machine_limit(uuid) from public, anon, authenticated;
revoke execute on function public.tenant_subscription_ok(uuid) from public, anon, authenticated;
grant execute on function public.tenant_machine_limit(uuid) to service_role;
grant execute on function public.tenant_subscription_ok(uuid) to service_role;

revoke execute on function public.my_tenant_ids(text) from public, anon;
revoke execute on function public.my_writable_tenant_ids(text) from public, anon;
revoke execute on function public.member_role(uuid) from public, anon;
grant execute on function public.my_tenant_ids(text) to authenticated, service_role;
grant execute on function public.my_writable_tenant_ids(text) to authenticated, service_role;
grant execute on function public.member_role(uuid) to authenticated, service_role;
-- is_super_admin() is referenced by the anon-readable plans policy; it only reveals the caller's own flag.

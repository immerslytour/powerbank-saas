-- =====================================================================
-- Security: helper functions, Row Level Security, column privileges,
-- guard triggers. Frontend filtering is never relied upon.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can read memberships
-- without recursive RLS evaluation). search_path pinned to ''.
-- ---------------------------------------------------------------------
create or replace function public.role_rank(r text)
returns integer language sql immutable set search_path = '' as $$
  select case r when 'owner' then 3 when 'manager' then 2 when 'employee' then 1 else 0 end
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- Tenants where the current user has at least `min_role` (read access).
create or replace function public.my_tenant_ids(min_role text default 'employee')
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from public.memberships m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and public.role_rank(m.role) >= public.role_rank(min_role)
$$;

-- Tenants where the current user may WRITE with at least `min_role`.
-- Suspended tenants are read-only for their members.
create or replace function public.my_writable_tenant_ids(min_role text default 'employee')
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.tenant_id), '{}')
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and t.status = 'active'
    and public.role_rank(m.role) >= public.role_rank(min_role)
$$;

create or replace function public.member_role(tid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.tenant_id = tid and m.user_id = auth.uid() and m.status = 'active'
$$;

-- ---------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'locale' = 'es' then 'es' else 'en' end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- Subscription / plan enforcement
-- ---------------------------------------------------------------------
create or replace function public.tenant_subscription_ok(tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.tenants t on t.id = s.tenant_id
    where s.tenant_id = tid
      and t.status = 'active'
      and (
        s.status in ('active', 'past_due')
        or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
      )
  )
$$;

create or replace function public.tenant_machine_limit(tid uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(p.machine_limit, 0)
  from public.tenants t
  left join public.plans p on p.id = t.plan_id
  where t.id = tid
$$;

create or replace function public.enforce_machine_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  if new.state = 'retired' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.state <> 'retired' then
    return new;
  end if;
  if not public.tenant_subscription_ok(new.tenant_id) then
    raise exception 'SUBSCRIPTION_INACTIVE: the tenant subscription is not active'
      using errcode = 'P0001';
  end if;
  lim := public.tenant_machine_limit(new.tenant_id);
  select count(*) into cnt from public.machines
    where tenant_id = new.tenant_id and state <> 'retired' and id <> new.id;
  if cnt >= lim then
    raise exception 'MACHINE_LIMIT_REACHED: plan allows % machines', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger machines_enforce_limit
  before insert or update of state on public.machines
  for each row execute function public.enforce_machine_limit();

create or replace function public.enforce_location_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  select p.location_limit into lim from public.tenants t
    left join public.plans p on p.id = t.plan_id where t.id = new.tenant_id;
  if lim is null then return new; end if;
  select count(*) into cnt from public.locations where tenant_id = new.tenant_id;
  if cnt >= lim then
    raise exception 'LOCATION_LIMIT_REACHED: plan allows % locations', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger locations_enforce_limit
  before insert on public.locations
  for each row execute function public.enforce_location_limit();

-- Never leave a tenant without an active owner.
create or replace function public.guard_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  remaining integer;
begin
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active')
     or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
         and (new.role <> 'owner' or new.status <> 'active')) then
    select count(*) into remaining from public.memberships
      where tenant_id = old.tenant_id and role = 'owner' and status = 'active' and id <> old.id;
    if remaining = 0 then
      raise exception 'LAST_OWNER: a tenant must keep at least one active owner' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_guard_last_owner
  before update or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- Managers may not promote anyone above their own rank (owners can).
create or replace function public.guard_membership_rank()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_role text;
begin
  if auth.uid() is null or public.is_super_admin() then
    return new; -- service role / super admin
  end if;
  -- Tenant bootstrap: the creator becomes the first owner of a brand-new tenant.
  if tg_op = 'INSERT' and new.role = 'owner' and new.user_id = auth.uid()
     and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.created_by = auth.uid())
     and not exists (select 1 from public.memberships m where m.tenant_id = new.tenant_id) then
    return new;
  end if;
  -- Invitation acceptance: the invitee joins with exactly the invited role.
  if new.user_id = auth.uid() and exists (
       select 1 from public.invitations i join auth.users u on u.id = auth.uid()
       where i.tenant_id = new.tenant_id and i.email = lower(u.email) and i.role = new.role
         and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    return new;
  end if;
  actor_role := public.member_role(new.tenant_id);
  if public.role_rank(new.role) > public.role_rank(actor_role) then
    raise exception 'FORBIDDEN_ROLE: cannot grant a role above your own' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and public.role_rank(old.role) > public.role_rank(actor_role) then
    raise exception 'FORBIDDEN_ROLE: cannot modify a member above your rank' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.role <> old.role then
    raise exception 'FORBIDDEN_ROLE: cannot change your own role' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger memberships_guard_rank
  before insert or update on public.memberships
  for each row execute function public.guard_membership_rank();

create or replace function public.guard_invitation_rank()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  if public.role_rank(new.role) > public.role_rank(public.member_role(new.tenant_id)) then
    raise exception 'FORBIDDEN_ROLE: cannot invite above your own role' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger invitations_guard_rank
  before insert or update on public.invitations
  for each row execute function public.guard_invitation_rank();

-- ---------------------------------------------------------------------
-- Tenant provisioning
-- ---------------------------------------------------------------------
create or replace function public.provision_tenant(
  p_name text, p_slug text, p_plan_code text, p_owner uuid, p_locale text default 'en'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plans%rowtype;
  v_tenant uuid;
begin
  select * into v_plan from public.plans where code = coalesce(p_plan_code, 'starter') and is_active;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.tenants (name, slug, plan_id, created_by, locale, default_currency)
  values (trim(p_name), lower(trim(p_slug)), v_plan.id, p_owner,
          case when p_locale = 'es' then 'es' else 'en' end, v_plan.currency)
  returning id into v_tenant;

  if p_owner is not null then
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant, p_owner, 'owner');
  end if;

  insert into public.brands (tenant_id, display_name) values (v_tenant, trim(p_name));
  insert into public.rental_pricing (tenant_id, currency) values (v_tenant, v_plan.currency);
  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (v_tenant, v_plan.id,
          case when v_plan.trial_days > 0 then 'trialing'::public.subscription_status
               else 'incomplete'::public.subscription_status end,
          case when v_plan.trial_days > 0 then now() + make_interval(days => v_plan.trial_days) end);
  insert into public.integrations (tenant_id, kind, provider, status)
  values (v_tenant, 'stripe_connect', 'stripe', 'not_connected');

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_tenant, coalesce(auth.uid(), p_owner), 'tenant.created', 'tenant', v_tenant::text,
          jsonb_build_object('plan', v_plan.code, 'slug', lower(trim(p_slug))));
  return v_tenant;
end $$;

-- Self-service: authenticated user creates their own business.
create or replace function public.create_my_tenant(p_name text, p_slug text, p_plan_code text default 'starter')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owned integer;
  v_locale text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select count(*) into owned from public.memberships where user_id = auth.uid() and role = 'owner';
  if owned >= 3 and not public.is_super_admin() then
    raise exception 'TENANT_LIMIT: contact support to create more businesses' using errcode = 'P0001';
  end if;
  select locale into v_locale from public.profiles where id = auth.uid();
  return public.provision_tenant(p_name, p_slug, p_plan_code, auth.uid(), coalesce(v_locale, 'en'));
end $$;

-- Accept an invitation. Token is compared by SHA-256 hash; email must match.
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.invitations
    where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    for update;
  if not found or v_inv.revoked_at is not null then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'INVITE_USED' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'INVITE_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_inv.tenant_id, auth.uid(), v_inv.role, 'active')
  on conflict (tenant_id, user_id) do update
    set role = case when public.role_rank(excluded.role) > public.role_rank(public.memberships.role)
                    then excluded.role else public.memberships.role end,
        status = 'active';

  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  insert into public.audit_logs (tenant_id, actor_id, actor_email, action, entity_type, entity_id, metadata)
  values (v_inv.tenant_id, auth.uid(), v_email, 'invitation.accepted', 'invitation', v_inv.id::text,
          jsonb_build_object('role', v_inv.role));
  return v_inv.tenant_id;
end $$;

-- ---------------------------------------------------------------------
-- Rate limiting (fixed window). Service role only.
-- ---------------------------------------------------------------------
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.brands enable row level security;
alter table public.rental_pricing enable row level security;
alter table public.locations enable row level security;
alter table public.machines enable row level security;
alter table public.batteries enable row level security;
alter table public.customers enable row level security;
alter table public.rentals enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.commissions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.integrations enable row level security;
alter table public.device_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.support_tickets enable row level security;
alter table public.platform_settings enable row level security;
alter table public.rate_limits enable row level security;

-- Shorthand used below:
--   SA      = (select public.is_super_admin())
--   READ(r) = tenant_id in (select unnest(public.my_tenant_ids(r)))
--   WRITE(r)= tenant_id in (select unnest(public.my_writable_tenant_ids(r)))

-- plans: public catalog is readable; only super admins manage it
create policy plans_read on public.plans for select to anon, authenticated
  using (is_active and is_public or (select public.is_super_admin()));
create policy plans_admin_write on public.plans for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- tenants
create policy tenants_read on public.tenants for select to authenticated
  using ((select public.is_super_admin()) or id in (select unnest(public.my_tenant_ids('employee'))));
create policy tenants_owner_update on public.tenants for update to authenticated
  using ((select public.is_super_admin()) or id in (select unnest(public.my_writable_tenant_ids('owner'))))
  with check ((select public.is_super_admin()) or id in (select unnest(public.my_writable_tenant_ids('owner'))));
create policy tenants_admin_insert on public.tenants for insert to authenticated
  with check ((select public.is_super_admin()));
create policy tenants_admin_delete on public.tenants for delete to authenticated
  using ((select public.is_super_admin()));

-- tenant_domains: members read; only super admin / server writes
create policy tenant_domains_read on public.tenant_domains for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy tenant_domains_admin on public.tenant_domains for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- profiles: self, teammates, super admin
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_super_admin())
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and m.tenant_id in (select unnest(public.my_tenant_ids('employee')))
    )
  );
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()))
  with check (id = (select auth.uid()) or (select public.is_super_admin()));

-- roles: readable reference data
create policy roles_read on public.roles for select to authenticated using (true);

-- memberships
create policy memberships_read on public.memberships for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy memberships_manage on public.memberships for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('owner'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('owner'))));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('owner'))));
create policy memberships_admin_insert on public.memberships for insert to authenticated
  with check ((select public.is_super_admin()));

-- invitations: managers+ (rank guard trigger prevents escalation)
create policy invitations_read on public.invitations for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));
create policy invitations_insert on public.invitations for insert to authenticated
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));
create policy invitations_update on public.invitations for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));

-- brands / pricing: all members read; managers+ write
create policy brands_read on public.brands for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy brands_write on public.brands for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));

create policy pricing_read on public.rental_pricing for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy pricing_write on public.rental_pricing for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));

-- locations & machines & batteries: members read; managers+ write
create policy locations_read on public.locations for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy locations_insert on public.locations for insert to authenticated
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));
create policy locations_update on public.locations for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));
create policy locations_delete on public.locations for delete to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('owner'))));

create policy machines_read on public.machines for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy machines_insert on public.machines for insert to authenticated
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));
create policy machines_update on public.machines for update to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));

create policy batteries_read on public.batteries for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));

-- customers & rentals: members read; managers+ may update rentals (cancel/notes)
create policy customers_read on public.customers for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy rentals_read on public.rentals for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));

-- payments & refunds: managers+ read; writes only via server (service role)
create policy payments_read on public.payments for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));
create policy refunds_read on public.refunds for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));

-- commissions: managers+
create policy commissions_read on public.commissions for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));
create policy commissions_write on public.commissions for all to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))))
  with check ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_writable_tenant_ids('manager'))));

-- subscriptions & integrations: managers+ read; server-only writes
create policy subscriptions_read on public.subscriptions for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));
create policy integrations_read on public.integrations for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('manager'))));

-- device events: members read
create policy device_events_read on public.device_events for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));

-- webhook events & platform settings & rate limits: super admin only (no policy for others)
create policy webhook_events_admin_read on public.webhook_events for select to authenticated
  using ((select public.is_super_admin()));
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- audit logs: super admin all; owners their own tenant. Insert server-side only.
create policy audit_logs_read on public.audit_logs for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('owner'))));

-- support tickets
create policy support_read on public.support_tickets for select to authenticated
  using ((select public.is_super_admin()) or tenant_id in (select unnest(public.my_tenant_ids('employee'))));
create policy support_insert on public.support_tickets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and tenant_id in (select unnest(public.my_tenant_ids('employee')))
  );
create policy support_admin_update on public.support_tickets for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- Column-level privileges: restrict what browser roles can change even
-- where a row policy allows the UPDATE.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.plans to anon;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, locale) on public.profiles to authenticated;

revoke update on public.tenants from authenticated;
grant update (name, timezone, locale, default_currency, country) on public.tenants to authenticated;

revoke update on public.memberships from authenticated;
grant update (role, status) on public.memberships to authenticated;

revoke update on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

revoke update on public.machines from authenticated;
grant update (name, location_id, model, state, notes, sim_config) on public.machines to authenticated;

revoke update on public.support_tickets from authenticated;
grant update (status, admin_reply, replied_at, priority) on public.support_tickets to authenticated;

-- Encrypted provider credentials are never selectable by browser roles.
revoke select on public.integrations from authenticated;
grant select (id, tenant_id, kind, provider, status, stripe_account_id, livemode, details,
              last_synced_at, created_at, updated_at) on public.integrations to authenticated;

-- invitation token hashes are not exposed to the browser
revoke select on public.invitations from authenticated;
grant select (id, tenant_id, email, role, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.invitations to authenticated;

-- Function execution privileges
revoke execute on function public.provision_tenant(text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.create_my_tenant(text, text, text) from public, anon;
grant execute on function public.create_my_tenant(text, text, text) to authenticated;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

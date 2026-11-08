-- =====================================================================
-- Private community mode: free access for invited collaborators.
--  * New free "community" plan becomes the default; paid plans are hidden
--    and deactivated (kept for the future, not deleted).
--  * Free plans are provisioned as 'active' (no trial, no billing).
--  * Self-service business creation requires an access code stored in
--    platform_settings (readable only by super admins). Checked in SQL so
--    it cannot be bypassed by calling the API directly.
-- =====================================================================

insert into public.plans (code, name, description, price_cents, currency, billing_interval, trial_days,
                          machine_limit, location_limit, team_limit, features, is_active, is_public, sort_order)
values ('community', 'Community', 'Free private access for community collaborators.', 0, 'usd', 'month', 0,
        25, null, 5,
        '{"basic_dashboard": true, "basic_reports": true, "advanced_reports": true, "advanced_analytics": true,
          "team_access": true, "multiple_locations": true, "advanced_branding": true, "priority_support": false,
          "custom_domain": false, "csv_export": true}', true, true, 0)
on conflict (code) do update set price_cents = 0, trial_days = 0, is_active = true;

update public.plans set is_active = false, is_public = false where code in ('starter', 'growth', 'pro');

insert into public.platform_settings (key, value) values
  ('signups', jsonb_build_object('self_serve_enabled', true, 'default_plan', 'community',
     'access_code', upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10))))
on conflict (key) do update set value = public.platform_settings.value
  || jsonb_build_object('default_plan', 'community',
       'access_code', coalesce(public.platform_settings.value ->> 'access_code',
                               upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10))));

insert into public.platform_settings (key, value) values ('mode', '{"community": true}')
on conflict (key) do update set value = '{"community": true}';

-- Free plans are active immediately; paid plans keep the trial behaviour.
create or replace function public.provision_tenant(
  p_name text, p_slug text, p_plan_code text, p_owner uuid, p_locale text default 'en'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plans%rowtype;
  v_tenant uuid;
  v_status public.subscription_status;
begin
  select * into v_plan from public.plans
    where code = coalesce(p_plan_code, (select value ->> 'default_plan' from public.platform_settings where key = 'signups'), 'community')
      and is_active;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_status := case when v_plan.price_cents = 0 then 'active'::public.subscription_status
                   when v_plan.trial_days > 0 then 'trialing'::public.subscription_status
                   else 'incomplete'::public.subscription_status end;

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
  values (v_tenant, v_plan.id, v_status,
          case when v_status = 'trialing' then now() + make_interval(days => v_plan.trial_days) end);
  insert into public.integrations (tenant_id, kind, provider, status)
  values (v_tenant, 'stripe_connect', 'stripe', 'not_connected');

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_tenant, coalesce(auth.uid(), p_owner), 'tenant.created', 'tenant', v_tenant::text,
          jsonb_build_object('plan', v_plan.code, 'slug', lower(trim(p_slug))));
  return v_tenant;
end $$;

-- Self-service creation now requires the community access code and always uses the default plan.
drop function if exists public.create_my_tenant(text, text, text);
create or replace function public.create_my_tenant(p_name text, p_slug text, p_access_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owned integer;
  v_locale text;
  v_settings jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select value into v_settings from public.platform_settings where key = 'signups';
  if not public.is_super_admin() then
    if coalesce((v_settings ->> 'self_serve_enabled')::boolean, false) is not true then
      raise exception 'SIGNUPS_CLOSED' using errcode = 'P0001';
    end if;
    if v_settings ->> 'access_code' is null
       or upper(trim(coalesce(p_access_code, ''))) <> upper(v_settings ->> 'access_code') then
      raise exception 'INVALID_ACCESS_CODE' using errcode = 'P0001';
    end if;
  end if;
  select count(*) into owned from public.memberships where user_id = auth.uid() and role = 'owner';
  if owned >= 3 and not public.is_super_admin() then
    raise exception 'TENANT_LIMIT: contact the admin to create more businesses' using errcode = 'P0001';
  end if;
  select locale into v_locale from public.profiles where id = auth.uid();
  return public.provision_tenant(p_name, p_slug, v_settings ->> 'default_plan', auth.uid(), coalesce(v_locale, 'en'));
end $$;

revoke execute on function public.create_my_tenant(text, text, text) from public, anon;
grant execute on function public.create_my_tenant(text, text, text) to authenticated;

-- Existing tenants move to the free community plan.
update public.tenants set plan_id = (select id from public.plans where code = 'community');
update public.subscriptions
  set plan_id = (select id from public.plans where code = 'community'), status = 'active', trial_ends_at = null
  where stripe_subscription_id is null;

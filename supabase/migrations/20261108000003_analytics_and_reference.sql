-- =====================================================================
-- Analytics functions (SECURITY INVOKER -> RLS still applies) and
-- reference data (roles, initial plans, platform settings).
-- =====================================================================

alter table public.rentals
  add column revenue_at timestamptz generated always as (coalesce(returned_at, closed_at, created_at)) stored;
create index rentals_tenant_revenue_at_idx on public.rentals(tenant_id, revenue_at);

-- Helper predicate for real / simulated / all data filters
create or replace function public.data_filter_match(p_data text, p_is_simulated boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case coalesce(p_data, 'all')
    when 'real' then not p_is_simulated
    when 'simulated' then p_is_simulated
    else true end
$$;

create or replace function public.analytics_summary(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_data text default 'all'
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with r as (
    select * from public.rentals
    where tenant_id = p_tenant and public.data_filter_match(p_data, is_simulated)
  ),
  in_range as (
    select * from r where revenue_at >= p_from and revenue_at < p_to
  ),
  paid as (
    select * from in_range where payment_status in ('succeeded', 'partially_refunded', 'refunded')
  )
  select jsonb_build_object(
    'gross_cents', coalesce((select sum(amount_cents) from paid), 0),
    'refunds_cents', coalesce((select sum(refunded_cents) from paid), 0),
    'revenue_cents', coalesce((select sum(amount_cents - refunded_cents) from paid), 0),
    'rentals', (select count(*) from in_range where status <> 'pending'),
    'completed', (select count(*) from in_range where status = 'returned'),
    'failed', (select count(*) from in_range where status = 'failed'),
    'cancelled', (select count(*) from in_range where status = 'cancelled'),
    'overdue', (select count(*) from in_range where status = 'overdue'),
    'refund_count', (select count(*) from paid where refunded_cents > 0),
    'avg_revenue_cents', coalesce((select round(avg(amount_cents - refunded_cents)) from paid), 0),
    'return_rate', (
      select case when count(*) filter (where status in ('returned', 'overdue')) = 0 then null
        else round(100.0 * count(*) filter (where status = 'returned')
                   / count(*) filter (where status in ('returned', 'overdue')), 1) end
      from in_range
    ),
    'active_now', (select count(*) from r where status = 'active'),
    'overdue_now', (select count(*) from r where status = 'overdue'),
    'has_simulated', exists (select 1 from in_range where is_simulated),
    'currency', coalesce((select currency from public.rental_pricing where tenant_id = p_tenant), 'usd')
  )
$$;

create or replace function public.analytics_revenue_series(
  p_tenant uuid, p_from timestamptz, p_to timestamptz,
  p_bucket text default 'day', p_tz text default 'UTC', p_data text default 'all'
) returns table (bucket_start timestamptz, revenue_cents bigint, rentals bigint, refunds_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone p_tz),
      date_trunc(p_bucket, (p_to - interval '1 second') at time zone p_tz),
      ('1 ' || p_bucket)::interval
    ) as b
  ),
  agg as (
    select date_trunc(p_bucket, revenue_at at time zone p_tz) as b,
      sum(case when payment_status in ('succeeded', 'partially_refunded', 'refunded')
               then amount_cents - refunded_cents else 0 end)::bigint as revenue_cents,
      count(*) filter (where status <> 'pending')::bigint as rentals,
      sum(refunded_cents)::bigint as refunds_cents
    from public.rentals
    where tenant_id = p_tenant and revenue_at >= p_from and revenue_at < p_to
      and public.data_filter_match(p_data, is_simulated)
      and p_bucket in ('day', 'week', 'month')
    group by 1
  )
  select (buckets.b at time zone p_tz) as bucket_start,
    coalesce(agg.revenue_cents, 0), coalesce(agg.rentals, 0), coalesce(agg.refunds_cents, 0)
  from buckets left join agg using (b)
  order by 1
$$;

create or replace function public.analytics_location_performance(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_data text default 'all'
) returns table (
  location_id uuid, location_name text, machines bigint, rentals bigint,
  revenue_cents bigint, avg_revenue_cents bigint, commission_type text, commission_value integer,
  commission_due_cents bigint
)
language sql stable security invoker set search_path = '' as $$
  with stats as (
    select r.location_id,
      count(*) filter (where r.status <> 'pending') as rentals,
      coalesce(sum(r.amount_cents - r.refunded_cents) filter (
        where r.payment_status in ('succeeded', 'partially_refunded', 'refunded')), 0) as revenue_cents
    from public.rentals r
    where r.tenant_id = p_tenant and r.revenue_at >= p_from and r.revenue_at < p_to
      and public.data_filter_match(p_data, r.is_simulated)
    group by r.location_id
  )
  select l.id, l.name,
    (select count(*) from public.machines m where m.location_id = l.id and m.state <> 'retired'),
    coalesce(s.rentals, 0)::bigint,
    coalesce(s.revenue_cents, 0)::bigint,
    case when coalesce(s.rentals, 0) = 0 then 0 else (s.revenue_cents / s.rentals) end::bigint,
    l.commission_type, l.commission_value,
    (case l.commission_type
       when 'percent' then round(coalesce(s.revenue_cents, 0) * l.commission_value / 10000.0)
       when 'flat_monthly' then round(l.commission_value *
         greatest(1, ceil(extract(epoch from (p_to - p_from)) / 2629800.0)))
       else 0 end)::bigint
  from public.locations l
  left join stats s on s.location_id = l.id
  where l.tenant_id = p_tenant
  order by 5 desc, 2
$$;

create or replace function public.analytics_machine_performance(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_data text default 'all'
) returns table (
  machine_id uuid, machine_name text, device_id text, location_name text, is_simulated boolean,
  rentals bigint, revenue_cents bigint, rental_minutes bigint, utilization_pct numeric, offline_minutes bigint
)
language sql stable security invoker set search_path = '' as $$
  with range_minutes as (
    select greatest(1, extract(epoch from (least(p_to, now()) - p_from)) / 60.0) as mins
  ),
  rs as (
    select r.machine_id,
      count(*) filter (where r.status <> 'pending') as rentals,
      coalesce(sum(r.amount_cents - r.refunded_cents) filter (
        where r.payment_status in ('succeeded', 'partially_refunded', 'refunded')), 0) as revenue_cents
    from public.rentals r
    where r.tenant_id = p_tenant and r.revenue_at >= p_from and r.revenue_at < p_to
      and public.data_filter_match(p_data, r.is_simulated)
    group by r.machine_id
  ),
  usage as (
    select r.machine_id,
      sum(greatest(0, extract(epoch from (
        least(coalesce(r.returned_at, now()), p_to) - greatest(r.started_at, p_from))) / 60.0)) as minutes
    from public.rentals r
    where r.tenant_id = p_tenant and r.started_at is not null
      and r.started_at < p_to and coalesce(r.returned_at, now()) > p_from
      and public.data_filter_match(p_data, r.is_simulated)
    group by r.machine_id
  ),
  ev as (
    select e.machine_id, e.occurred_at, e.payload ->> 'status' as st,
      lead(e.occurred_at) over (partition by e.machine_id order by e.occurred_at) as next_at
    from public.device_events e
    where e.tenant_id = p_tenant and e.event_type = 'connection_changed' and e.occurred_at < p_to
  ),
  offline as (
    select ev.machine_id,
      sum(greatest(0, extract(epoch from (
        least(coalesce(ev.next_at, least(now(), p_to)), p_to) - greatest(ev.occurred_at, p_from))) / 60.0)) as minutes
    from ev
    where ev.st <> 'online' and coalesce(ev.next_at, now()) > p_from
    group by ev.machine_id
  )
  select m.id, coalesce(m.name, m.device_id), m.device_id, l.name, m.is_simulated,
    coalesce(rs.rentals, 0)::bigint,
    coalesce(rs.revenue_cents, 0)::bigint,
    coalesce(round(u.minutes), 0)::bigint,
    round(100.0 * coalesce(u.minutes, 0) / (m.total_slots * (select mins from range_minutes)), 2),
    coalesce(round(o.minutes), 0)::bigint
  from public.machines m
  left join public.locations l on l.id = m.location_id
  left join rs on rs.machine_id = m.id
  left join usage u on u.machine_id = m.id
  left join offline o on o.machine_id = m.id
  where m.tenant_id = p_tenant and m.state <> 'retired'
  order by 7 desc, 2
$$;

-- Super admin platform statistics (definer, explicitly gated)
create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'tenants', (select count(*) from public.tenants),
    'tenants_active', (select count(*) from public.tenants where status = 'active'),
    'tenants_suspended', (select count(*) from public.tenants where status = 'suspended'),
    'machines', (select count(*) from public.machines where state <> 'retired'),
    'machines_simulated', (select count(*) from public.machines where state <> 'retired' and is_simulated),
    'machines_online', (select count(*) from public.machines where state <> 'retired' and connection_status = 'online'),
    'locations', (select count(*) from public.locations),
    'rentals', (select count(*) from public.rentals where status <> 'pending'),
    'rentals_real', (select count(*) from public.rentals where status <> 'pending' and not is_simulated),
    'rentals_30d', (select count(*) from public.rentals where status <> 'pending' and created_at > now() - interval '30 days'),
    'mrr_cents', (
      select coalesce(sum(case when p.billing_interval = 'year' then p.price_cents / 12 else p.price_cents end), 0)
      from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.status in ('active', 'past_due') and s.stripe_subscription_id is not null
    ),
    'subscriptions', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status::text, count(*) n from public.subscriptions group by status) x
    ),
    'webhooks_failed', (select count(*) from public.webhook_events where status = 'failed'),
    'open_tickets', (select count(*) from public.support_tickets where status <> 'closed')
  );
end $$;

revoke execute on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to authenticated;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
insert into public.roles (key, name, rank, description, permissions) values
  ('super_admin', 'Super Admin', 100, 'Platform owner with global access', array['*']),
  ('owner', 'Business Owner', 3, 'Full control of the business, billing, team and Stripe',
    array['tenant.manage', 'billing.manage', 'team.manage', 'stripe.manage', 'machines.manage',
          'locations.manage', 'rentals.manage', 'payments.read', 'refunds.create', 'branding.manage',
          'pricing.manage', 'analytics.read', 'audit.read']),
  ('manager', 'Business Manager', 2, 'Operations: machines, locations, rentals, refunds, branding',
    array['machines.manage', 'locations.manage', 'rentals.manage', 'payments.read', 'refunds.create',
          'branding.manage', 'pricing.manage', 'analytics.read', 'team.invite_employees']),
  ('employee', 'Employee', 1, 'Field staff: view machines, locations and rentals',
    array['machines.read', 'locations.read', 'rentals.read'])
on conflict (key) do nothing;

insert into public.plans (code, name, description, price_cents, currency, billing_interval, trial_days,
                          machine_limit, location_limit, team_limit, features, sort_order) values
  ('starter', 'Starter', 'For new operators getting their first stations running.', 4900, 'usd', 'month', 14,
    5, 3, 1,
    '{"basic_dashboard": true, "basic_reports": true, "advanced_reports": false, "advanced_analytics": false,
      "team_access": false, "multiple_locations": true, "advanced_branding": false, "priority_support": false,
      "custom_domain": false, "csv_export": true}', 1),
  ('growth', 'Growth', 'For operators scaling across multiple venues.', 12900, 'usd', 'month', 14,
    20, null, 5,
    '{"basic_dashboard": true, "basic_reports": true, "advanced_reports": true, "advanced_analytics": false,
      "team_access": true, "multiple_locations": true, "advanced_branding": false, "priority_support": false,
      "custom_domain": false, "csv_export": true}', 2),
  ('pro', 'Pro', 'For established networks that need full analytics and branding.', 29900, 'usd', 'month', 14,
    50, null, 25,
    '{"basic_dashboard": true, "basic_reports": true, "advanced_reports": true, "advanced_analytics": true,
      "team_access": true, "multiple_locations": true, "advanced_branding": true, "priority_support": true,
      "custom_domain": true, "csv_export": true}', 3)
on conflict (code) do nothing;

insert into public.platform_settings (key, value) values
  ('platform', '{"name": "Voltaje", "support_email": null, "default_locale": "en"}'),
  ('payments', '{"application_fee_bps": 0, "allow_simulated_payments": true}'),
  ('signups', '{"self_serve_enabled": true, "default_plan": "starter"}')
on conflict (key) do nothing;

-- =====================================================================
-- Webhook idempotency + Stripe Connect / Billing synchronization.
-- Service-role only.
-- =====================================================================

-- Atomically claim a webhook for processing. Returns 'process' or 'skip'.
-- Retries from Stripe of a failed event are re-processed; processed events are skipped.
create or replace function public.webhook_claim(
  p_source text, p_external_id text, p_type text, p_account text, p_livemode boolean, p_payload jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  insert into public.webhook_events (source, external_id, event_type, account_id, livemode, payload, status, attempts)
  values (p_source, p_external_id, p_type, p_account, p_livemode, p_payload, 'processing', 1)
  on conflict (source, external_id) do nothing;
  if found then return 'process'; end if;

  update public.webhook_events
    set status = 'processing', attempts = attempts + 1, last_error = null
    where source = p_source and external_id = p_external_id
      and (status in ('received', 'failed')
           or (status = 'processing' and coalesce(processed_at, received_at) < now() - interval '5 minutes'))
    returning status into v_status;
  if found then return 'process'; end if;
  return 'skip';
end $$;

create or replace function public.webhook_finish(
  p_source text, p_external_id text, p_status text, p_error text default null, p_tenant uuid default null
) returns void language sql security definer set search_path = '' as $$
  update public.webhook_events
    set status = p_status, last_error = left(p_error, 2000), processed_at = now(),
        tenant_id = coalesce(p_tenant, tenant_id)
    where source = p_source and external_id = p_external_id
$$;

-- Connected account status sync (account.updated / manual refresh).
create or replace function public.integration_sync_stripe(
  p_account text, p_status text, p_details jsonb, p_livemode boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  update public.integrations
    set status = case when status = 'disconnected' then status else p_status end,
        details = p_details, livemode = p_livemode, last_synced_at = now()
    where stripe_account_id = p_account and kind = 'stripe_connect'
    returning tenant_id into v_tenant;
  return v_tenant;
end $$;

create or replace function public.integration_link_stripe(p_tenant uuid, p_account text, p_livemode boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.integrations (tenant_id, kind, provider, status, stripe_account_id, livemode)
  values (p_tenant, 'stripe_connect', 'stripe', 'onboarding_incomplete', p_account, p_livemode)
  on conflict (tenant_id, kind, provider) do update
    set stripe_account_id = excluded.stripe_account_id, livemode = excluded.livemode,
        status = case when public.integrations.stripe_account_id is distinct from excluded.stripe_account_id
                        or public.integrations.status in ('not_connected', 'disconnected')
                      then 'onboarding_incomplete' else public.integrations.status end;
end $$;

create or replace function public.integration_stripe_deauthorized(p_account text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  update public.integrations
    set status = 'disconnected',
        details = details || jsonb_build_object('charges_enabled', false, 'deauthorized_at', now())
    where stripe_account_id = p_account and kind = 'stripe_connect'
    returning tenant_id into v_tenant;
  return v_tenant;
end $$;

-- SaaS subscription sync from Stripe Billing.
create or replace function public.subscription_sync(
  p_tenant uuid, p_customer text, p_subscription text, p_status text, p_price text,
  p_trial_end timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean, p_canceled_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := p_tenant;
  v_plan uuid;
begin
  if v_tenant is null then
    select tenant_id into v_tenant from public.subscriptions
      where stripe_subscription_id = p_subscription or stripe_customer_id = p_customer
      limit 1;
  end if;
  if v_tenant is null then return null; end if;
  select id into v_plan from public.plans where stripe_price_id = p_price;

  update public.subscriptions
    set status = p_status::public.subscription_status,
        stripe_customer_id = coalesce(p_customer, stripe_customer_id),
        stripe_subscription_id = p_subscription,
        stripe_price_id = p_price,
        plan_id = coalesce(v_plan, plan_id),
        trial_ends_at = coalesce(p_trial_end, case when p_status = 'trialing' then trial_ends_at end),
        current_period_end = p_period_end,
        cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
        canceled_at = p_canceled_at,
        last_payment_error = case when p_status in ('active', 'trialing') then null else last_payment_error end
    where tenant_id = v_tenant;
  if v_plan is not null then
    update public.tenants set plan_id = v_plan where id = v_tenant;
  end if;
  return v_tenant;
end $$;

create or replace function public.subscription_payment_event(p_customer text, p_failed boolean, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  update public.subscriptions
    set last_payment_error = case when p_failed then left(coalesce(p_message, 'payment_failed'), 500) else null end
    where stripe_customer_id = p_customer
    returning tenant_id into v_tenant;
  return v_tenant;
end $$;

create or replace function public.subscription_set_customer(p_tenant uuid, p_customer text)
returns void language sql security definer set search_path = '' as $$
  update public.subscriptions set stripe_customer_id = p_customer where tenant_id = p_tenant
$$;

-- Rental checkout session expired without payment.
create or replace function public.rental_checkout_expired(p_rental uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.rentals set status = 'cancelled', failure_reason = 'checkout_expired', closed_at = now()
    where id = p_rental and status = 'pending' and payment_status = 'requires_payment';
  return found;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'webhook_claim(text, text, text, text, boolean, jsonb)',
    'webhook_finish(text, text, text, text, uuid)',
    'integration_sync_stripe(text, text, jsonb, boolean)',
    'integration_link_stripe(uuid, text, boolean)',
    'integration_stripe_deauthorized(text)',
    'subscription_sync(uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz)',
    'subscription_payment_event(text, boolean, text)',
    'subscription_set_customer(uuid, text)',
    'rental_checkout_expired(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Hardening: a machine is simulated IFF its provider is the simulator.
-- (Prevents marking real hardware as "simulated" to bypass payment.)
-- Browser roles may only insert descriptive columns; status/telemetry
-- columns are written exclusively by the server/hardware pipeline.
-- ---------------------------------------------------------------------
create or replace function public.machines_enforce_simulated()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.is_simulated := (new.provider = 'simulator');
  if new.is_simulated and (new.manufacturer is null or new.manufacturer = '') then
    new.manufacturer := 'Simulator';
  end if;
  return new;
end $$;

create trigger machines_enforce_simulated
  before insert or update of provider, is_simulated on public.machines
  for each row execute function public.machines_enforce_simulated();

revoke insert on public.machines from authenticated;
grant insert (tenant_id, location_id, name, device_id, provider, manufacturer, model, total_slots, notes, state)
  on public.machines to authenticated;

-- =====================================================================
-- Rental engine: atomic, idempotent state transitions.
-- All functions are SECURITY DEFINER and executable ONLY by service_role
-- (server code after it has verified Stripe / hardware confirmations).
--
-- Lifecycle:
--   rental_start            -> rentals.status = pending, payment requires_payment
--   rental_payment_authorized (verified with Stripe) -> payment authorized
--   rental_claim_unlock     -> claims the unlock attempt (no double unlocks)
--   rental_unlock_confirmed (hardware confirmation) -> status active
--   rental_unlock_failed    -> retry or failed (hold released by server)
--   rental_battery_returned (hardware confirmation) -> status returned
--   rental_payment_captured -> payment succeeded, rental closed
-- =====================================================================

create or replace function public.machine_recount(p_machine uuid)
returns void language sql security definer set search_path = '' as $$
  update public.machines m
  set available_batteries = least(m.total_slots, (
    select count(*) from public.batteries b
    where b.machine_id = m.id and b.status = 'in_slot' and b.charge_level >= 20))
  where m.id = p_machine
$$;

create or replace function public.log_device_event(
  p_tenant uuid, p_machine uuid, p_rental uuid, p_type text, p_source text,
  p_payload jsonb default '{}'::jsonb, p_severity text default 'info',
  p_simulated boolean default false, p_external_id text default null, p_occurred_at timestamptz default now()
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.device_events (tenant_id, machine_id, rental_id, event_type, source, payload, severity,
                                    is_simulated, external_id, occurred_at)
  values (p_tenant, p_machine, p_rental, p_type, p_source, coalesce(p_payload, '{}'::jsonb), p_severity,
          p_simulated, p_external_id, coalesce(p_occurred_at, now()))
  on conflict (tenant_id, source, external_id) where external_id is not null do nothing
  returning id into v_id;
  return v_id; -- null => duplicate event (idempotent)
end $$;

-- Public, customer-safe view of a machine for the QR landing page.
create or replace function public.public_machine_info(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'machine', jsonb_build_object(
      'id', m.id, 'code', m.public_code, 'name', coalesce(m.name, m.device_id),
      'available_batteries', m.available_batteries, 'total_slots', m.total_slots,
      'connection_status', m.connection_status, 'state', m.state, 'is_simulated', m.is_simulated,
      'provider', m.provider),
    'location', case when l.id is null then null else jsonb_build_object(
      'name', l.name, 'address', concat_ws(', ', l.address_line1, l.city, l.region)) end,
    'tenant', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'status', t.status,
      'subscription_ok', public.tenant_subscription_ok(t.id)),
    'brand', jsonb_build_object(
      'display_name', b.display_name, 'logo_path', b.logo_path, 'primary_color', b.primary_color,
      'secondary_color', b.secondary_color, 'accent_color', b.accent_color,
      'support_email', b.support_email, 'support_phone', b.support_phone, 'website', b.website,
      'checkout_headline', b.checkout_headline, 'portal_message', b.portal_message,
      'return_instructions', b.return_instructions),
    'pricing', jsonb_build_object(
      'currency', p.currency, 'initial_fee_cents', p.initial_fee_cents, 'free_minutes', p.free_minutes,
      'hourly_rate_cents', p.hourly_rate_cents, 'daily_rate_cents', p.daily_rate_cents,
      'max_charge_cents', p.max_charge_cents, 'late_fee_cents', p.late_fee_cents,
      'late_after_hours', p.late_after_hours, 'overdue_after_hours', p.overdue_after_hours,
      'refund_policy', p.refund_policy, 'terms_text', p.terms_text),
    'stripe', jsonb_build_object(
      'account_id', i.stripe_account_id,
      'charges_enabled', coalesce((i.details ->> 'charges_enabled')::boolean, false),
      'status', i.status)
  )
  from public.machines m
  join public.tenants t on t.id = m.tenant_id
  join public.brands b on b.tenant_id = t.id
  join public.rental_pricing p on p.tenant_id = t.id
  left join public.locations l on l.id = m.location_id
  left join public.integrations i on i.tenant_id = t.id and i.kind = 'stripe_connect' and i.provider = 'stripe'
  where m.public_code = upper(p_code)
$$;

-- 1) Create a pending rental with an immutable pricing snapshot.
create or replace function public.rental_start(
  p_machine_code text, p_locale text default 'en', p_customer_email text default null,
  p_payment_provider text default 'stripe'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.machines%rowtype;
  t public.tenants%rowtype;
  p public.rental_pricing%rowtype;
  v_acct text;
  v_charges boolean;
  r public.rentals%rowtype;
  v_customer uuid;
begin
  select * into m from public.machines where public_code = upper(p_machine_code) for update;
  if not found then raise exception 'MACHINE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into t from public.tenants where id = m.tenant_id;
  if t.status <> 'active' or not public.tenant_subscription_ok(t.id) then
    raise exception 'OPERATOR_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if m.state <> 'active' then raise exception 'MACHINE_UNAVAILABLE' using errcode = 'P0001'; end if;
  if m.connection_status <> 'online' then raise exception 'MACHINE_OFFLINE' using errcode = 'P0001'; end if;
  if m.available_batteries < 1 then raise exception 'NO_BATTERIES' using errcode = 'P0001'; end if;
  if p_payment_provider not in ('stripe', 'simulated') then
    raise exception 'INVALID_PROVIDER' using errcode = 'P0001';
  end if;
  if p_payment_provider = 'simulated' and not m.is_simulated then
    raise exception 'SIMULATED_PAYMENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into p from public.rental_pricing where tenant_id = t.id;
  select i.stripe_account_id, coalesce((i.details ->> 'charges_enabled')::boolean, false)
    into v_acct, v_charges
    from public.integrations i where i.tenant_id = t.id and i.kind = 'stripe_connect' and i.provider = 'stripe'
      and i.status in ('active', 'restricted', 'onboarding_incomplete');
  if p_payment_provider = 'stripe' and (v_acct is null or not coalesce(v_charges, false)) then
    raise exception 'PAYMENTS_NOT_ENABLED' using errcode = 'P0001';
  end if;

  if p_customer_email is not null and position('@' in p_customer_email) > 1 then
    insert into public.customers (tenant_id, email) values (t.id, lower(trim(p_customer_email)))
    on conflict (tenant_id, email) where email is not null do update set updated_at = now()
    returning id into v_customer;
  end if;

  insert into public.rentals (tenant_id, customer_id, machine_id, location_id, status, payment_status, currency,
                              authorized_cents, pricing_snapshot, terms_accepted_at, stripe_account_id,
                              is_simulated, customer_locale)
  values (t.id, v_customer, m.id, m.location_id, 'pending', 'requires_payment', p.currency, p.max_charge_cents,
          to_jsonb(p) - 'tenant_id' - 'updated_at', now(),
          case when p_payment_provider = 'stripe' then v_acct end,
          m.is_simulated, case when p_locale = 'es' then 'es' else 'en' end)
  returning * into r;

  perform public.log_device_event(t.id, m.id, r.id, 'rental_created', 'system',
    jsonb_build_object('payment_provider', p_payment_provider), 'info', m.is_simulated);

  return jsonb_build_object(
    'rental_id', r.id, 'public_token', r.public_token, 'tenant_id', t.id, 'tenant_slug', t.slug,
    'amount_to_authorize', r.authorized_cents, 'currency', r.currency,
    'stripe_account_id', v_acct, 'is_simulated', r.is_simulated, 'customer_id', v_customer);
end $$;

create or replace function public.rental_attach_checkout(p_rental uuid, p_session_id text)
returns void language sql security definer set search_path = '' as $$
  update public.rentals set stripe_checkout_session_id = p_session_id
  where id = p_rental and status = 'pending'
$$;

-- Context used by server orchestration (never exposed to browsers).
create or replace function public.rental_context(p_rental uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rental', to_jsonb(r),
    'machine', jsonb_build_object('id', m.id, 'device_id', m.device_id, 'provider', m.provider,
       'is_simulated', m.is_simulated, 'sim_config', m.sim_config, 'name', coalesce(m.name, m.device_id),
       'public_code', m.public_code),
    'tenant', jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name),
    'payment', (select to_jsonb(pay) from public.payments pay where pay.rental_id = r.id
                order by pay.created_at desc limit 1)
  )
  from public.rentals r
  join public.machines m on m.id = r.machine_id
  join public.tenants t on t.id = r.tenant_id
  where r.id = p_rental
$$;

-- 2) Payment authorized (server verified it with Stripe or simulated gateway).
create or replace function public.rental_payment_authorized(
  p_rental uuid, p_provider text, p_payment_intent text, p_amount integer, p_currency text,
  p_livemode boolean, p_customer_email text default null, p_stripe_customer text default null,
  p_charge text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
  v_customer uuid;
  v_transitioned boolean := false;
begin
  select * into r from public.rentals where id = p_rental for update;
  if not found then raise exception 'RENTAL_NOT_FOUND' using errcode = 'P0001'; end if;

  if r.stripe_payment_intent_id is not null and p_payment_intent is not null
     and r.stripe_payment_intent_id <> p_payment_intent then
    raise exception 'PAYMENT_INTENT_MISMATCH' using errcode = 'P0001';
  end if;

  if p_customer_email is not null and position('@' in p_customer_email) > 1 then
    insert into public.customers (tenant_id, email, stripe_customer_id)
    values (r.tenant_id, lower(trim(p_customer_email)), p_stripe_customer)
    on conflict (tenant_id, email) where email is not null
      do update set stripe_customer_id = coalesce(public.customers.stripe_customer_id, excluded.stripe_customer_id),
                    updated_at = now()
    returning id into v_customer;
  end if;

  if p_provider = 'stripe' then
    if p_payment_intent is null then raise exception 'PAYMENT_INTENT_REQUIRED' using errcode = 'P0001'; end if;
    insert into public.payments (tenant_id, rental_id, customer_id, provider, stripe_account_id,
                                 stripe_payment_intent_id, stripe_charge_id, amount_authorized_cents, currency,
                                 status, livemode, is_simulated)
    values (r.tenant_id, r.id, coalesce(v_customer, r.customer_id), 'stripe', r.stripe_account_id,
            p_payment_intent, p_charge, p_amount, lower(p_currency), 'authorized', coalesce(p_livemode, false), false)
    on conflict (stripe_payment_intent_id) do nothing;
  elsif p_provider = 'simulated' then
    if not r.is_simulated then raise exception 'SIMULATED_PAYMENT_NOT_ALLOWED' using errcode = 'P0001'; end if;
    -- serialized by the row lock on the rental above
    if not exists (select 1 from public.payments where rental_id = r.id) then
      insert into public.payments (tenant_id, rental_id, customer_id, provider, amount_authorized_cents, currency,
                                   status, livemode, is_simulated)
      values (r.tenant_id, r.id, coalesce(v_customer, r.customer_id), 'simulated', p_amount, lower(p_currency),
              'authorized', false, true);
    end if;
  else
    raise exception 'INVALID_PROVIDER' using errcode = 'P0001';
  end if;

  if r.status = 'pending' and r.payment_status = 'requires_payment' then
    update public.rentals
      set payment_status = 'authorized', stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
          authorized_cents = p_amount, customer_id = coalesce(v_customer, customer_id)
      where id = r.id;
    v_transitioned := true;
  end if;

  return jsonb_build_object(
    'transitioned', v_transitioned,
    'status', (select status from public.rentals where id = r.id),
    -- the rental was cancelled/expired before payment completed: caller must release the hold
    'needs_release', r.status in ('cancelled', 'failed'));
end $$;

-- 3) Claim the right to send an unlock command (prevents duplicate releases).
create or replace function public.rental_claim_unlock(p_rental uuid, p_max_attempts integer default 3)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
begin
  update public.rentals
    set unlock_requested_at = now(), unlock_attempts = unlock_attempts + 1
    where id = p_rental and status = 'pending' and payment_status = 'authorized'
      and unlock_attempts < p_max_attempts
      and (unlock_requested_at is null or unlock_requested_at < now() - interval '90 seconds')
    returning * into r;
  if not found then return null; end if;
  perform public.log_device_event(r.tenant_id, r.machine_id, r.id, 'unlock_requested', 'system',
    jsonb_build_object('attempt', r.unlock_attempts), 'info', r.is_simulated);
  return public.rental_context(r.id);
end $$;

-- 4) Hardware confirmed the battery left the slot.
create or replace function public.rental_unlock_confirmed(
  p_rental uuid, p_battery_serial text, p_slot integer, p_provider_ref text, p_source text default 'provider'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
  v_battery uuid;
begin
  select * into r from public.rentals where id = p_rental for update;
  if not found then raise exception 'RENTAL_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status = 'active' then
    return jsonb_build_object('transitioned', false, 'status', r.status);
  end if;
  if r.status <> 'pending' or r.payment_status <> 'authorized' then
    raise exception 'INVALID_RENTAL_STATE: %/%', r.status, r.payment_status using errcode = 'P0001';
  end if;

  insert into public.batteries (tenant_id, machine_id, serial, slot_number, status, is_simulated, last_seen_at)
  values (r.tenant_id, null, p_battery_serial, null, 'rented', r.is_simulated, now())
  on conflict (tenant_id, serial) do update
    set status = 'rented', machine_id = null, slot_number = null, last_seen_at = now()
  returning id into v_battery;

  update public.rentals
    set status = 'active', started_at = now(), unlock_confirmed_at = now(), battery_id = v_battery,
        battery_serial = p_battery_serial, slot_number = p_slot, provider_rental_ref = p_provider_ref
    where id = r.id;
  update public.customers set rental_count = rental_count + 1 where id = r.customer_id;
  perform public.machine_recount(r.machine_id);
  update public.machines set last_seen_at = now() where id = r.machine_id;
  perform public.log_device_event(r.tenant_id, r.machine_id, r.id, 'battery_released', p_source,
    jsonb_build_object('battery_serial', p_battery_serial, 'slot', p_slot, 'provider_ref', p_provider_ref),
    'info', r.is_simulated);
  return jsonb_build_object('transitioned', true, 'status', 'active');
end $$;

-- 5) Unlock failed. p_final => the rental fails and the server releases the hold.
create or replace function public.rental_unlock_failed(p_rental uuid, p_reason text, p_final boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
begin
  select * into r from public.rentals where id = p_rental for update;
  if not found or r.status <> 'pending' then
    return jsonb_build_object('transitioned', false, 'status', r.status);
  end if;
  perform public.log_device_event(r.tenant_id, r.machine_id, r.id, 'unlock_failed', 'system',
    jsonb_build_object('reason', p_reason, 'attempt', r.unlock_attempts, 'final', p_final), 'error', r.is_simulated);
  if p_final then
    update public.rentals set status = 'failed', failure_reason = p_reason, closed_at = now() where id = r.id;
    return jsonb_build_object('transitioned', true, 'status', 'failed');
  end if;
  update public.rentals set unlock_requested_at = null, failure_reason = p_reason where id = r.id;
  return jsonb_build_object('transitioned', false, 'status', 'pending');
end $$;

-- 6) Hardware confirmed a battery was returned into a machine.
create or replace function public.rental_battery_returned(
  p_tenant uuid, p_battery_serial text, p_return_machine uuid, p_slot integer,
  p_returned_at timestamptz, p_source text, p_external_id text default null, p_charge_level integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
  v_machine public.machines%rowtype;
  v_event bigint;
begin
  select * into v_machine from public.machines where id = p_return_machine and tenant_id = p_tenant;
  if not found then raise exception 'MACHINE_NOT_FOUND' using errcode = 'P0001'; end if;

  v_event := public.log_device_event(p_tenant, p_return_machine, null, 'battery_returned', p_source,
    jsonb_build_object('battery_serial', p_battery_serial, 'slot', p_slot), 'info', v_machine.is_simulated,
    p_external_id, p_returned_at);
  if v_event is null then
    return jsonb_build_object('duplicate', true);
  end if;

  insert into public.batteries (tenant_id, machine_id, serial, slot_number, status, charge_level, is_simulated, last_seen_at)
  values (p_tenant, p_return_machine, p_battery_serial, p_slot, 'in_slot', coalesce(p_charge_level, 50),
          v_machine.is_simulated, now())
  on conflict (tenant_id, serial) do update
    set machine_id = p_return_machine, slot_number = p_slot, status = 'in_slot',
        charge_level = coalesce(p_charge_level, public.batteries.charge_level), last_seen_at = now();
  perform public.machine_recount(p_return_machine);

  select * into r from public.rentals
    where tenant_id = p_tenant and battery_serial = p_battery_serial and status in ('active', 'overdue')
    order by started_at desc limit 1 for update;
  if not found then
    perform public.log_device_event(p_tenant, p_return_machine, null, 'return_unmatched', 'system',
      jsonb_build_object('battery_serial', p_battery_serial), 'warning', v_machine.is_simulated);
    return jsonb_build_object('matched', false);
  end if;

  update public.rentals
    set status = 'returned', returned_at = greatest(coalesce(p_returned_at, now()), started_at),
        return_machine_id = p_return_machine
    where id = r.id;
  update public.device_events set rental_id = r.id where id = v_event;
  return jsonb_build_object('matched', true, 'rental_id', r.id, 'was_overdue', r.status = 'overdue');
end $$;

-- 7) Final charge captured (or authorization released when amount is 0).
create or replace function public.rental_payment_captured(
  p_rental uuid, p_amount integer, p_charge text default null, p_application_fee integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
begin
  select * into r from public.rentals where id = p_rental for update;
  if not found then raise exception 'RENTAL_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.payment_status in ('succeeded', 'partially_refunded', 'refunded') then
    return jsonb_build_object('transitioned', false);
  end if;
  update public.rentals
    set amount_cents = p_amount,
        payment_status = case when p_amount = 0 then 'canceled'::public.payment_status else 'succeeded' end,
        closed_at = case when status = 'returned' then now() else closed_at end
    where id = r.id;
  update public.payments
    set amount_captured_cents = p_amount, stripe_charge_id = coalesce(p_charge, stripe_charge_id),
        application_fee_cents = coalesce(p_application_fee, 0),
        status = case when p_amount = 0 then 'canceled'::public.payment_status else 'succeeded' end
    where rental_id = r.id and status in ('authorized', 'requires_payment');
  return jsonb_build_object('transitioned', true);
end $$;

create or replace function public.rental_payment_failed(p_rental uuid, p_code text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set status = 'failed', failure_code = p_code, failure_message = left(p_message, 500)
    where rental_id = p_rental and status in ('authorized', 'requires_payment');
  update public.rentals set payment_status = 'failed', failure_reason = coalesce(failure_reason, p_message)
    where id = p_rental and payment_status in ('authorized', 'requires_payment');
end $$;

-- Hold released without capture (failed unlock / cancelled rental)
create or replace function public.rental_payment_released(p_rental uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payments set status = 'canceled' where rental_id = p_rental and status = 'authorized';
  update public.rentals set payment_status = 'canceled'
    where id = p_rental and payment_status in ('authorized', 'requires_payment');
end $$;

create or replace function public.rental_cancel(p_rental uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rentals%rowtype;
begin
  select * into r from public.rentals where id = p_rental for update;
  if not found then raise exception 'RENTAL_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then
    raise exception 'INVALID_RENTAL_STATE: only pending rentals can be cancelled' using errcode = 'P0001';
  end if;
  update public.rentals set status = 'cancelled', failure_reason = p_reason, closed_at = now() where id = r.id;
  return jsonb_build_object('payment_status', r.payment_status, 'payment_intent', r.stripe_payment_intent_id,
                            'stripe_account_id', r.stripe_account_id);
end $$;

-- Rentals whose battery was not returned within overdue_after_hours.
create or replace function public.rental_mark_overdue()
returns setof uuid language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.rentals r set status = 'overdue'
  where r.status = 'active'
    and r.started_at < now() - make_interval(hours => coalesce((r.pricing_snapshot ->> 'overdue_after_hours')::int, 72))
  returning r.id;
end $$;

-- Refund bookkeeping
create or replace function public.refund_apply(
  p_payment uuid, p_amount integer, p_status text, p_stripe_refund text, p_reason text,
  p_actor uuid, p_idempotency text, p_simulated boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  v_refund uuid;
  v_total integer;
begin
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.refunds (tenant_id, payment_id, rental_id, stripe_refund_id, amount_cents, currency, reason,
                              status, is_simulated, created_by, idempotency_key)
  values (pay.tenant_id, pay.id, pay.rental_id, p_stripe_refund, p_amount, pay.currency, p_reason, p_status,
          p_simulated, p_actor, p_idempotency)
  on conflict (idempotency_key) do update set status = excluded.status,
    stripe_refund_id = coalesce(public.refunds.stripe_refund_id, excluded.stripe_refund_id)
  returning id into v_refund;

  perform public.refund_recalculate(pay.id);
  return jsonb_build_object('refund_id', v_refund);
end $$;

create or replace function public.refund_recalculate(p_payment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  v_total integer;
  v_pending integer;
begin
  select * into pay from public.payments where id = p_payment for update;
  select coalesce(sum(amount_cents) filter (where status = 'succeeded'), 0),
         count(*) filter (where status = 'pending')
    into v_total, v_pending
    from public.refunds where payment_id = p_payment;
  update public.payments
    set amount_refunded_cents = least(v_total, amount_captured_cents),
        status = case when v_total = 0 then status
                      when v_total >= amount_captured_cents then 'refunded'::public.payment_status
                      else 'partially_refunded'::public.payment_status end
    where id = p_payment;
  update public.rentals
    set refunded_cents = least(v_total, amount_cents),
        refund_status = case when v_pending > 0 then 'pending'::public.refund_state
                             when v_total = 0 then 'none'::public.refund_state
                             when v_total >= amount_cents then 'full'::public.refund_state
                             else 'partial'::public.refund_state end,
        payment_status = case when v_total = 0 then payment_status
                              when v_total >= amount_cents then 'refunded'::public.payment_status
                              else 'partially_refunded'::public.payment_status end
    where id = pay.rental_id;
end $$;

create or replace function public.refund_update_by_stripe_id(p_stripe_refund text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_payment uuid;
begin
  update public.refunds set status = p_status where stripe_refund_id = p_stripe_refund
    returning payment_id into v_payment;
  if v_payment is not null then perform public.refund_recalculate(v_payment); end if;
end $$;

-- Machine connectivity updates (provider polling / webhooks / simulator)
create or replace function public.machine_set_connection(
  p_machine uuid, p_status public.machine_connection, p_source text, p_external_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.machines%rowtype;
begin
  select * into m from public.machines where id = p_machine for update;
  if not found then return; end if;
  update public.machines set connection_status = p_status,
    last_seen_at = case when p_status = 'online' then now() else last_seen_at end
    where id = p_machine;
  if m.connection_status is distinct from p_status then
    perform public.log_device_event(m.tenant_id, m.id, null, 'connection_changed', p_source,
      jsonb_build_object('status', p_status, 'previous', m.connection_status),
      case when p_status = 'online' then 'info' when p_status = 'offline' then 'warning' else 'error' end,
      m.is_simulated, p_external_id);
  end if;
end $$;

-- Simulator helpers (only touch is_simulated machines)
create or replace function public.sim_pick_battery(p_machine uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('serial', b.serial, 'slot', b.slot_number, 'charge_level', b.charge_level)
  from public.batteries b
  join public.machines m on m.id = b.machine_id
  where b.machine_id = p_machine and m.is_simulated and b.status = 'in_slot' and b.charge_level >= 20
  order by b.charge_level desc, b.slot_number
  limit 1
$$;

create or replace function public.sim_free_slot(p_machine uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select s from public.machines m, generate_series(1, m.total_slots) s
  where m.id = p_machine and m.is_simulated
    and not exists (select 1 from public.batteries b where b.machine_id = m.id and b.slot_number = s
                    and b.status in ('in_slot', 'charging', 'faulty'))
  order by s limit 1
$$;

create or replace function public.sim_provision_machine(p_machine uuid, p_batteries integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.machines%rowtype;
  i integer;
begin
  select * into m from public.machines where id = p_machine and is_simulated;
  if not found then raise exception 'NOT_SIMULATED' using errcode = 'P0001'; end if;
  for i in 1..least(p_batteries, m.total_slots) loop
    insert into public.batteries (tenant_id, machine_id, serial, slot_number, status, charge_level, is_simulated, last_seen_at)
    values (m.tenant_id, m.id, 'SIM-' || upper(substr(m.id::text, 1, 4)) || '-' || lpad(i::text, 2, '0'), i, 'in_slot',
            80 + (i * 7) % 21, true, now())
    on conflict (tenant_id, serial) do nothing;
  end loop;
  perform public.machine_recount(m.id);
  perform public.machine_set_connection(m.id, 'online', 'simulator');
end $$;

create or replace function public.sim_machine_state(p_machine uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connection_status', m.connection_status, 'last_seen_at', m.last_seen_at,
    'total_slots', m.total_slots, 'available_batteries', m.available_batteries,
    'batteries', coalesce((select jsonb_agg(jsonb_build_object('serial', b.serial, 'slot', b.slot_number,
                      'charge_level', b.charge_level, 'status', b.status) order by b.slot_number)
                    from public.batteries b where b.machine_id = m.id), '[]'::jsonb))
  from public.machines m where m.id = p_machine and m.is_simulated
$$;

-- Resolve a manufacturer device id to our machine (for webhooks / polling).
create or replace function public.machine_by_device(p_provider text, p_device_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'tenant_id', m.tenant_id, 'is_simulated', m.is_simulated,
                            'device_id', m.device_id, 'provider', m.provider, 'sim_config', m.sim_config)
  from public.machines m where m.provider = p_provider and m.device_id = p_device_id
$$;

-- Active rental currently holding a battery (used for provider release confirmations).
create or replace function public.rental_by_provider_ref(p_tenant uuid, p_ref text)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.rentals r
  where r.tenant_id = p_tenant and (r.id::text = p_ref or r.provider_rental_ref = p_ref)
  order by r.created_at desc limit 1
$$;

-- Expire unpaid pending rentals (customer abandoned checkout).
create or replace function public.rental_expire_pending(p_minutes integer default 45)
returns setof uuid language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.rentals r set status = 'cancelled', failure_reason = 'checkout_expired', closed_at = now()
  where r.status = 'pending' and r.payment_status = 'requires_payment'
    and r.created_at < now() - make_interval(mins => p_minutes)
  returning r.id;
end $$;

-- Authorized rentals whose unlock is stuck (no confirmation) -> for reconciliation.
create or replace function public.rental_stuck_unlocks(p_minutes integer default 5)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.rentals r
  where r.status = 'pending' and r.payment_status = 'authorized'
    and coalesce(r.unlock_requested_at, r.updated_at) < now() - make_interval(mins => p_minutes)
$$;

create or replace function public.rental_set_provider_ref(p_rental uuid, p_ref text)
returns void language sql security definer set search_path = '' as $$
  update public.rentals set provider_rental_ref = p_ref where id = p_rental and status = 'pending'
$$;

-- Lock everything down to service_role.
do $$
declare
  f text;
begin
  foreach f in array array[
    'machine_recount(uuid)',
    'log_device_event(uuid, uuid, uuid, text, text, jsonb, text, boolean, text, timestamptz)',
    'public_machine_info(text)',
    'rental_start(text, text, text, text)',
    'rental_attach_checkout(uuid, text)',
    'rental_context(uuid)',
    'rental_payment_authorized(uuid, text, text, integer, text, boolean, text, text, text)',
    'rental_claim_unlock(uuid, integer)',
    'rental_unlock_confirmed(uuid, text, integer, text, text)',
    'rental_unlock_failed(uuid, text, boolean)',
    'rental_battery_returned(uuid, text, uuid, integer, timestamptz, text, text, integer)',
    'rental_payment_captured(uuid, integer, text, integer)',
    'rental_payment_failed(uuid, text, text)',
    'rental_payment_released(uuid)',
    'rental_cancel(uuid, text)',
    'rental_mark_overdue()',
    'refund_apply(uuid, integer, text, text, text, uuid, text, boolean)',
    'refund_recalculate(uuid)',
    'refund_update_by_stripe_id(text, text)',
    'machine_set_connection(uuid, public.machine_connection, text, text)',
    'sim_pick_battery(uuid)',
    'sim_free_slot(uuid)',
    'sim_provision_machine(uuid, integer)',
    'sim_machine_state(uuid)',
    'machine_by_device(text, text)',
    'rental_by_provider_ref(uuid, text)',
    'rental_expire_pending(integer)',
    'rental_stuck_unlocks(integer)',
    'rental_set_provider_ref(uuid, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

grant execute on function public.provision_tenant(text, text, text, uuid, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- =====================================================================
-- DEMO TENANT SEED (idempotent). All hardware and payments are SIMULATED
-- (is_simulated = true) and are labeled as such everywhere in the UI.
--
-- Prerequisites: these auth users must exist (create them in Supabase Auth
-- or with supabase/seed/demo_users.sql):
--   demo.owner@voltaje.app, demo.manager@voltaje.app, demo.employee@voltaje.app
-- =====================================================================
do $seed$
declare
  v_owner uuid;
  v_manager uuid;
  v_employee uuid;
  v_tenant uuid;
  v_loc uuid[];
  v_mach uuid[];
  v_names text[] := array['Tower Café', 'Fig Garden Fitness', 'Riverside Taproom', 'Campus Commons'];
  v_cities text[] := array['Fresno', 'Fresno', 'Fresno', 'Clovis'];
  v_addr text[] := array['812 Olive Ave', '5120 N Palm Ave', '7900 N Blackstone Ave', '2600 E Nees Ave'];
  i integer;
  d integer;
  n integer;
  v_start timestamptz;
  v_minutes integer;
  v_amount integer;
  v_billable integer;
  v_rental uuid;
  v_payment uuid;
  v_customer uuid;
  v_status public.rental_status;
  v_m integer;
  v_serial text;
  v_tmp uuid;
  v_weight numeric[] := array[1.4, 0.8, 1.15, 0.65];
begin
  select id into v_owner from auth.users where email = 'demo.owner@voltaje.app';
  select id into v_manager from auth.users where email = 'demo.manager@voltaje.app';
  select id into v_employee from auth.users where email = 'demo.employee@voltaje.app';
  if v_owner is null then
    raise exception 'Create demo users first (demo.owner@voltaje.app ...)';
  end if;

  select id into v_tenant from public.tenants where slug = 'demo';
  if v_tenant is not null then
    raise notice 'demo tenant already exists (%), skipping', v_tenant;
    return;
  end if;

  v_tenant := public.provision_tenant('Voltaje Demo (Fresno)', 'demo', 'pro', v_owner, 'en');
  if v_manager is not null then
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant, v_manager, 'manager') on conflict do nothing;
  end if;
  if v_employee is not null then
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant, v_employee, 'employee') on conflict do nothing;
  end if;
  -- complimentary demo subscription (no Stripe)
  update public.subscriptions set status = 'active', trial_ends_at = null where tenant_id = v_tenant;

  update public.brands set
    display_name = 'Voltaje Demo',
    primary_color = '#0B1B3A', secondary_color = '#F5F7FB', accent_color = '#2F7BFF',
    support_email = 'support@voltaje.app', support_phone = '+1 559 555 0142', website = 'https://voltaje.app',
    checkout_headline = 'Low battery? Grab a charge.',
    portal_message = 'Rent a power bank here, return it at any Voltaje station.',
    return_instructions = 'Push the power bank into any empty slot until it clicks. The screen confirms the return and your rental ends automatically.'
  where tenant_id = v_tenant;

  update public.rental_pricing set
    currency = 'usd', initial_fee_cents = 100, free_minutes = 5, hourly_rate_cents = 150, daily_rate_cents = 800,
    max_charge_cents = 3000, late_fee_cents = 0, late_after_hours = null, overdue_after_hours = 72, refund_window_days = 30,
    refund_policy = 'Rentals returned within 5 minutes are free. If a power bank was faulty, contact support within 30 days for a full refund.',
    terms_text = 'A temporary hold for the maximum charge is placed on your card when the rental starts. You are charged only for the time used when the station confirms the return. If the power bank is not returned within 72 hours, the maximum charge applies and you keep the power bank.'
  where tenant_id = v_tenant;

  for i in 1..4 loop
    insert into public.locations (tenant_id, name, address_line1, city, region, postal_code, country, contact_name, contact_email, commission_type, commission_value)
    values (v_tenant, v_names[i], v_addr[i], v_cities[i], 'CA', '937' || (10 + i), 'US', 'Venue manager', 'venue' || i || '@example.com',
            case i when 1 then 'percent' when 2 then 'percent' when 3 then 'flat_monthly' else 'none' end,
            case i when 1 then 1500 when 2 then 1000 when 3 then 5000 else 0 end)
    returning id into v_tmp;
    v_loc[i] := v_tmp;
    insert into public.machines (tenant_id, location_id, name, device_id, provider, model, total_slots, created_at)
    values (v_tenant, v_loc[i], v_names[i] || ' station', 'SIM-DEMO-0' || i, 'simulator', 'SIM-8 (8 slots, screen + POS)', 8, now() - interval '62 days')
    returning id into v_tmp;
    v_mach[i] := v_tmp;
    perform public.sim_provision_machine(v_mach[i], 8);
  end loop;

  -- connectivity history (offline windows feed the offline-time analytics)
  for i in 1..4 loop
    insert into public.device_events (tenant_id, machine_id, event_type, severity, source, is_simulated, payload, occurred_at)
    values (v_tenant, v_mach[i], 'connection_changed', 'info', 'simulator', true, '{"status":"online"}', now() - interval '61 days');
  end loop;
  insert into public.device_events (tenant_id, machine_id, event_type, severity, source, is_simulated, payload, occurred_at) values
    (v_tenant, v_mach[3], 'connection_changed', 'warning', 'simulator', true, '{"status":"offline"}', now() - interval '9 days 4 hours'),
    (v_tenant, v_mach[3], 'connection_changed', 'info', 'simulator', true, '{"status":"online"}', now() - interval '9 days 1 hour'),
    (v_tenant, v_mach[4], 'connection_changed', 'warning', 'simulator', true, '{"status":"offline"}', now() - interval '3 days 6 hours'),
    (v_tenant, v_mach[4], 'connection_changed', 'info', 'simulator', true, '{"status":"online"}', now() - interval '3 days 2 hours'),
    (v_tenant, v_mach[2], 'device_error', 'error', 'simulator', true, '{"code":"SLOT_JAM","message":"Slot 6 latch did not open"}', now() - interval '2 days 3 hours');

  for i in 1..42 loop
    insert into public.customers (tenant_id, email, created_at)
    values (v_tenant, 'customer' || lpad(i::text, 2, '0') || '@example.com', now() - make_interval(days => 60 - i))
    on conflict do nothing;
  end loop;

  -- ~60 days of simulated rental history
  for d in reverse 60..1 loop
    n := 2 + floor(random() * 5)::int + case when extract(dow from now() - make_interval(days => d)) in (5, 6) then 3 else 0 end;
    for i in 1..n loop
      v_m := 1 + floor(random() * 4)::int;
      if random() > v_weight[v_m] / 1.4 then v_m := 1 + floor(random() * 4)::int; end if;
      v_start := date_trunc('day', now() - make_interval(days => d)) + make_interval(mins => 480 + floor(random() * 840)::int);
      v_minutes := case when random() < 0.08 then 2 + floor(random() * 3)::int
                        when random() < 0.75 then 20 + floor(random() * 180)::int
                        else 200 + floor(random() * 1300)::int end;
      -- same rules as src/lib/pricing.ts computeCharge (100 initial, 5 free, 150/h, 800/day cap, 3000 max)
      if v_minutes <= 5 then
        v_amount := 0;
      else
        v_billable := v_minutes - 5;
        v_amount := 100 + (v_billable / 1440) * 800 + least(ceil((v_billable % 1440) / 60.0)::int * 150, 800);
        v_amount := least(v_amount, 3000);
      end if;
      v_status := case when random() < 0.035 then 'failed'::public.rental_status else 'returned'::public.rental_status end;
      select id into v_customer from public.customers where tenant_id = v_tenant order by random() limit 1;
      v_serial := 'SIM-' || upper(substr(v_mach[v_m]::text, 1, 4)) || '-' || lpad((1 + floor(random() * 8))::int::text, 2, '0');

      insert into public.rentals (tenant_id, customer_id, machine_id, location_id, battery_serial, slot_number, return_machine_id,
        status, payment_status, amount_cents, authorized_cents, currency, pricing_snapshot, terms_accepted_at,
        unlock_requested_at, unlock_confirmed_at, unlock_attempts, started_at, returned_at, closed_at, failure_reason,
        is_simulated, created_at, customer_locale)
      values (v_tenant, v_customer, v_mach[v_m], v_loc[v_m],
        case when v_status = 'returned' then v_serial end,
        case when v_status = 'returned' then 1 + floor(random() * 8)::int end,
        case when v_status = 'returned' then v_mach[1 + floor(random() * 4)::int] end,
        v_status,
        case when v_status = 'failed' then 'canceled'::public.payment_status when v_amount = 0 then 'canceled'::public.payment_status else 'succeeded'::public.payment_status end,
        case when v_status = 'failed' then 0 else v_amount end, 3000, 'usd',
        (select to_jsonb(p) - 'tenant_id' - 'updated_at' from public.rental_pricing p where p.tenant_id = v_tenant),
        v_start - interval '1 minute', v_start - interval '40 seconds', case when v_status = 'returned' then v_start end,
        case when v_status = 'failed' then 3 else 1 end,
        case when v_status = 'returned' then v_start end,
        case when v_status = 'returned' then v_start + make_interval(mins => v_minutes) end,
        case when v_status = 'returned' then v_start + make_interval(mins => v_minutes) else v_start end,
        case when v_status = 'failed' then 'simulated_unlock_failure' end,
        true, v_start - interval '2 minutes', case when random() < 0.45 then 'es' else 'en' end)
      returning id into v_rental;

      insert into public.payments (tenant_id, rental_id, customer_id, provider, amount_authorized_cents, amount_captured_cents,
        currency, status, livemode, is_simulated, created_at)
      values (v_tenant, v_rental, v_customer, 'simulated', 3000, case when v_status = 'failed' then 0 else v_amount end, 'usd',
        case when v_status = 'failed' or v_amount = 0 then 'canceled'::public.payment_status else 'succeeded'::public.payment_status end,
        false, true, v_start - interval '90 seconds')
      returning id into v_payment;

      insert into public.device_events (tenant_id, machine_id, rental_id, event_type, severity, source, is_simulated, payload, occurred_at)
      values (v_tenant, v_mach[v_m], v_rental, case when v_status = 'failed' then 'unlock_failed' else 'battery_released' end,
              case when v_status = 'failed' then 'error' else 'info' end, 'simulator', true,
              jsonb_build_object('battery_serial', v_serial), v_start);

      -- occasional goodwill refunds
      if v_status = 'returned' and v_amount > 300 and random() < 0.05 then
        perform public.refund_apply(v_payment, least(v_amount, 300), 'succeeded', null, 'Goodwill (demo)', v_owner, 'demo-' || v_payment::text, true);
      end if;
      update public.customers set rental_count = rental_count + 1 where id = v_customer and v_status = 'returned';
    end loop;
  end loop;

  -- two rentals currently out (active) so the simulator "return" flow can be tried immediately
  for i in 1..2 loop
    v_serial := 'SIM-' || upper(substr(v_mach[i]::text, 1, 4)) || '-0' || (6 + i);
    update public.batteries set status = 'rented', machine_id = null, slot_number = null where tenant_id = v_tenant and serial = v_serial;
    select id into v_customer from public.customers where tenant_id = v_tenant order by random() limit 1;
    insert into public.rentals (tenant_id, customer_id, machine_id, location_id, battery_serial, slot_number, status, payment_status,
      amount_cents, authorized_cents, currency, pricing_snapshot, terms_accepted_at, unlock_confirmed_at, unlock_attempts, started_at,
      is_simulated, created_at)
    values (v_tenant, v_customer, v_mach[i], v_loc[i], v_serial, 6 + i, 'active', 'authorized', 0, 3000, 'usd',
      (select to_jsonb(p) - 'tenant_id' - 'updated_at' from public.rental_pricing p where p.tenant_id = v_tenant),
      now() - make_interval(mins => 40 * i), now() - make_interval(mins => 40 * i), 1, now() - make_interval(mins => 40 * i), true,
      now() - make_interval(mins => 40 * i + 1))
    returning id into v_rental;
    insert into public.payments (tenant_id, rental_id, customer_id, provider, amount_authorized_cents, currency, status, livemode, is_simulated)
    values (v_tenant, v_rental, v_customer, 'simulated', 3000, 'usd', 'authorized', false, true);
    perform public.machine_recount(v_mach[i]);
  end loop;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_tenant, v_owner, 'demo.seeded', 'tenant', v_tenant::text, '{"simulated": true}');
  raise notice 'demo tenant seeded: %', v_tenant;
end
$seed$;

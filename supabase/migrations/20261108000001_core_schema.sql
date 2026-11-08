-- =====================================================================
-- Power Bank Rental SaaS — core schema
-- Multi-tenant: every tenant-owned row carries tenant_id and is protected
-- by Row Level Security (see 20261108000002_rls.sql).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.tenant_status as enum ('active', 'suspended', 'pending');
create type public.membership_status as enum ('active', 'disabled');
create type public.machine_connection as enum ('online', 'offline', 'error', 'unknown');
create type public.machine_state as enum ('active', 'maintenance', 'retired');
create type public.battery_status as enum ('in_slot', 'rented', 'charging', 'faulty', 'lost');
create type public.rental_status as enum ('pending', 'active', 'returned', 'overdue', 'failed', 'cancelled');
create type public.payment_status as enum (
  'requires_payment', 'authorized', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded'
);
create type public.refund_state as enum ('none', 'pending', 'partial', 'full', 'failed');
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'none'
);
create type public.ticket_status as enum ('open', 'pending', 'closed');

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Plans (SaaS plans controlled by super admin; no prices in frontend code)
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  machine_limit integer not null check (machine_limit >= 0),
  location_limit integer check (location_limit is null or location_limit >= 0),
  team_limit integer check (team_limit is null or team_limit >= 1),
  features jsonb not null default '{}'::jsonb,
  stripe_product_id text,
  stripe_price_id text,
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  status public.tenant_status not null default 'active',
  plan_id uuid references public.plans(id) on delete set null,
  country text not null default 'US',
  timezone text not null default 'America/Los_Angeles',
  default_currency text not null default 'usd' check (default_currency ~ '^[a-z]{3}$'),
  locale text not null default 'en' check (locale in ('en', 'es')),
  suspended_at timestamptz,
  suspended_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenants_status_idx on public.tenants(status);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'),
  kind text not null check (kind in ('subdomain', 'custom')),
  verified boolean not null default false,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index tenant_domains_tenant_idx on public.tenant_domains(tenant_id);

-- ---------------------------------------------------------------------
-- Profiles / roles / memberships / invitations
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  locale text not null default 'en' check (locale in ('en', 'es')),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles(lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.roles (
  key text primary key check (key in ('super_admin', 'owner', 'manager', 'employee')),
  name text not null,
  rank integer not null unique,
  description text,
  permissions text[] not null default '{}'
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null references public.roles(key) check (role in ('owner', 'manager', 'employee')),
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null references public.roles(key) check (role in ('owner', 'manager', 'employee')),
  token_hash text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_tenant_idx on public.invitations(tenant_id);
create index invitations_email_idx on public.invitations(email);

-- ---------------------------------------------------------------------
-- Branding + pricing + settings
-- ---------------------------------------------------------------------
create table public.brands (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text not null,
  logo_path text,
  primary_color text not null default '#0B1B3A' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#FFFFFF' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#2F7BFF' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  support_email text,
  support_phone text,
  website text,
  checkout_headline text,
  portal_message text,
  return_instructions text,
  updated_at timestamptz not null default now()
);
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

create table public.rental_pricing (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  initial_fee_cents integer not null default 200 check (initial_fee_cents >= 0),
  free_minutes integer not null default 0 check (free_minutes between 0 and 1440),
  hourly_rate_cents integer not null default 100 check (hourly_rate_cents >= 0),
  daily_rate_cents integer not null default 500 check (daily_rate_cents >= 0),
  max_charge_cents integer not null default 3000 check (max_charge_cents >= 50),
  late_fee_cents integer not null default 0 check (late_fee_cents >= 0),
  late_after_hours integer check (late_after_hours is null or late_after_hours between 1 and 720),
  overdue_after_hours integer not null default 72 check (overdue_after_hours between 1 and 160),
  refund_window_days integer not null default 30 check (refund_window_days between 0 and 180),
  refund_policy text,
  terms_text text,
  updated_at timestamptz not null default now(),
  check (initial_fee_cents <= max_charge_cents),
  check (daily_rate_cents <= max_charge_cents)
);
create trigger rental_pricing_updated_at before update on public.rental_pricing
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Locations, machines, batteries
-- ---------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text default 'US',
  latitude double precision,
  longitude double precision,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  commission_type text not null default 'none' check (commission_type in ('none', 'percent', 'flat_monthly')),
  commission_value integer not null default 0 check (commission_value >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- percent commissions are stored in basis points (1000 = 10%)
  check (commission_type <> 'percent' or commission_value <= 10000),
  unique (id, tenant_id)
);
create index locations_tenant_idx on public.locations(tenant_id);
create trigger locations_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid,
  name text,
  device_id text not null check (char_length(device_id) between 1 and 120),
  provider text not null default 'simulator' check (provider ~ '^[a-z0-9_-]{2,40}$'),
  manufacturer text not null default 'Simulator',
  model text,
  public_code text not null unique default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  connection_status public.machine_connection not null default 'unknown',
  state public.machine_state not null default 'active',
  last_seen_at timestamptz,
  total_slots integer not null default 8 check (total_slots between 1 and 96),
  available_batteries integer not null default 0 check (available_batteries >= 0),
  is_simulated boolean not null default false,
  sim_config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, device_id),
  unique (id, tenant_id),
  -- a machine can only be assigned to a location of the same tenant
  foreign key (location_id, tenant_id) references public.locations(id, tenant_id) on delete set null (location_id),
  check (available_batteries <= total_slots)
);
create index machines_tenant_idx on public.machines(tenant_id);
create index machines_location_idx on public.machines(location_id);
create trigger machines_updated_at before update on public.machines
  for each row execute function public.set_updated_at();

create table public.batteries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  machine_id uuid,
  serial text not null,
  slot_number integer check (slot_number is null or slot_number between 1 and 96),
  charge_level integer not null default 100 check (charge_level between 0 and 100),
  status public.battery_status not null default 'in_slot',
  capacity_mah integer default 5000,
  is_simulated boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, serial),
  unique (id, tenant_id),
  foreign key (machine_id, tenant_id) references public.machines(id, tenant_id) on delete set null (machine_id)
);
create index batteries_machine_idx on public.batteries(machine_id);
create unique index batteries_slot_unique on public.batteries(machine_id, slot_number)
  where machine_id is not null and slot_number is not null and status in ('in_slot', 'charging', 'faulty');
create trigger batteries_updated_at before update on public.batteries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Customers, rentals, payments, refunds
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text check (email is null or email = lower(email)),
  phone text,
  name text,
  stripe_customer_id text,
  rental_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index customers_tenant_email_idx on public.customers(tenant_id, email) where email is not null;
create unique index customers_tenant_stripe_idx on public.customers(tenant_id, stripe_customer_id) where stripe_customer_id is not null;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid,
  machine_id uuid not null,
  location_id uuid,
  battery_id uuid,
  battery_serial text,
  slot_number integer,
  return_machine_id uuid,
  status public.rental_status not null default 'pending',
  payment_status public.payment_status not null default 'requires_payment',
  refund_status public.refund_state not null default 'none',
  amount_cents integer not null default 0 check (amount_cents >= 0),
  authorized_cents integer not null default 0 check (authorized_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  currency text not null default 'usd',
  pricing_snapshot jsonb not null,
  terms_accepted_at timestamptz,
  stripe_account_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  provider_rental_ref text,
  unlock_requested_at timestamptz,
  unlock_confirmed_at timestamptz,
  unlock_attempts integer not null default 0,
  started_at timestamptz,
  returned_at timestamptz,
  closed_at timestamptz,
  failure_reason text,
  is_simulated boolean not null default false,
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  customer_locale text default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete set null (customer_id),
  foreign key (machine_id, tenant_id) references public.machines(id, tenant_id) on delete restrict,
  foreign key (location_id, tenant_id) references public.locations(id, tenant_id) on delete set null (location_id),
  foreign key (battery_id, tenant_id) references public.batteries(id, tenant_id) on delete set null (battery_id),
  check (refunded_cents <= amount_cents),
  check (returned_at is null or started_at is null or returned_at >= started_at)
);
create index rentals_tenant_created_idx on public.rentals(tenant_id, created_at desc);
create index rentals_tenant_status_idx on public.rentals(tenant_id, status);
create index rentals_machine_idx on public.rentals(machine_id);
create index rentals_location_idx on public.rentals(location_id);
create index rentals_customer_idx on public.rentals(customer_id);
create index rentals_active_battery_idx on public.rentals(tenant_id, battery_serial) where status in ('active', 'overdue');
create trigger rentals_updated_at before update on public.rentals
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rental_id uuid,
  customer_id uuid,
  provider text not null default 'stripe' check (provider in ('stripe', 'simulated')),
  stripe_account_id text,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  amount_authorized_cents integer not null default 0 check (amount_authorized_cents >= 0),
  amount_captured_cents integer not null default 0 check (amount_captured_cents >= 0),
  amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
  currency text not null default 'usd',
  status public.payment_status not null default 'requires_payment',
  livemode boolean not null default false,
  is_simulated boolean not null default false,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (rental_id, tenant_id) references public.rentals(id, tenant_id) on delete set null (rental_id),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete set null (customer_id),
  check (amount_refunded_cents <= amount_captured_cents)
);
create index payments_tenant_created_idx on public.payments(tenant_id, created_at desc);
create index payments_rental_idx on public.payments(rental_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null,
  rental_id uuid,
  stripe_refund_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  reason text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled', 'requires_action')),
  is_simulated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (payment_id, tenant_id) references public.payments(id, tenant_id) on delete cascade,
  foreign key (rental_id, tenant_id) references public.rentals(id, tenant_id) on delete set null (rental_id)
);
create index refunds_tenant_idx on public.refunds(tenant_id, created_at desc);
create trigger refunds_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null,
  period_start date not null,
  period_end date not null,
  revenue_cents integer not null default 0,
  commission_type text not null check (commission_type in ('none', 'percent', 'flat_monthly')),
  commission_value integer not null default 0,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'void')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, tenant_id) references public.locations(id, tenant_id) on delete cascade,
  unique (location_id, period_start, period_end),
  check (period_end >= period_start)
);
create index commissions_tenant_idx on public.commissions(tenant_id);
create trigger commissions_updated_at before update on public.commissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- SaaS subscriptions (operator -> platform), integrations
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status public.subscription_status not null default 'trialing',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  last_payment_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('stripe_connect', 'hardware')),
  provider text not null,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'pending', 'onboarding_incomplete', 'restricted', 'active', 'disconnected', 'error')),
  stripe_account_id text unique,
  livemode boolean,
  details jsonb not null default '{}'::jsonb,
  -- AES-256-GCM encrypted JSON (server-side key). Never readable by browser roles.
  credentials_encrypted text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind, provider)
);
create trigger integrations_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Device events, webhooks, audit, support
-- ---------------------------------------------------------------------
create table public.device_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  machine_id uuid,
  rental_id uuid,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  source text not null check (source in ('simulator', 'provider', 'system', 'operator')),
  is_simulated boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  external_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (machine_id, tenant_id) references public.machines(id, tenant_id) on delete cascade
);
create index device_events_machine_idx on public.device_events(machine_id, occurred_at desc);
create index device_events_tenant_idx on public.device_events(tenant_id, occurred_at desc);
create unique index device_events_external_idx on public.device_events(tenant_id, source, external_id) where external_id is not null;

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe_platform', 'stripe_connect', 'hardware')),
  external_id text not null,
  event_type text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  account_id text,
  livemode boolean,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, external_id)
);
create index webhook_events_status_idx on public.webhook_events(status, received_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs(tenant_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  status public.ticket_status not null default 'open',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_tenant_idx on public.support_tickets(tenant_id, created_at desc);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits integer not null
);

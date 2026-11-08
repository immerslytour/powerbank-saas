# Voltaje — White-label Power Bank Rental SaaS

Multi-tenant platform for running branded power bank rental networks: stations, locations,
rentals, customer payments (Stripe Connect, direct charges), SaaS billing (Stripe Billing),
analytics, team roles and a hardware adapter layer with a built-in simulator.

> **Estado / Status (Nov 2026):** listo para operar con estaciones **simuladas** hoy. Las estaciones
> reales HeyCharge (Shenzhen EMCC) se conectan implementando un solo adaptador cuando el fabricante
> entregue su API — ver [`docs/HARDWARE_INTEGRATION.md`](docs/HARDWARE_INTEGRATION.md).

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind CSS v4 · Radix primitives ·
Supabase (Postgres, Auth, Storage, RLS) · Stripe Connect + Stripe Billing · Vercel (hosting + cron) · Vitest.

## Architecture in one picture

```
Customer phone ──QR──► /r/[code] ──► rental_start (SQL, service role)
                                        │
                     Stripe Checkout on OPERATOR's connected account (manual capture = hold)
                                        │
             webhook /api/webhooks/stripe-connect  ──► verify PI with Stripe ──► rental_payment_authorized
                                        │
                     HardwareProvider.unlockBattery()  (simulator | heycharge | …)
                                        │  confirmed only by the device/provider
                               rental_unlock_confirmed  → status ACTIVE
                                        │
        provider webhook / simulator ──► rental_battery_returned → finalizeRental → capture exact amount
```

* **Tenant isolation** is enforced in Postgres with RLS on every tenant table (`tenant_id`), column-level
  grants and guard triggers. The browser never filters for security. See `supabase/migrations/…02_security_rls.sql`.
* **Every money/hardware state transition** is an atomic, idempotent SQL function executable only by the
  service role (`…05_rental_engine.sql`). Double webhooks / double clicks cannot double-unlock or double-charge.
* **Two separate payment systems:**
  * Customer → operator: Checkout **on the operator's connected account** (direct charge). The platform never holds rental revenue
    (optional platform fee via `application_fee_bps`, default 0).
  * Operator → platform: Stripe Billing subscription on the platform account.
* **Simulated vs real** is a first-class flag (`is_simulated`) derived from the provider in the DB, shown with a striped
  "Simulated" badge everywhere, filterable in analytics, and simulated payments are refused for real hardware.

## Repository layout

```
src/app/                Next.js routes
  (auth)/               login, signup, password reset
  o/[slug]/             operator dashboard (overview, machines, locations, rentals, customers, payments,
                        analytics, team, branding, integrations, subscription, settings)
  admin/                super admin (operators, plans, settings, audit, webhooks, support)
  r/[code]              customer QR rental page (mobile-first, operator-branded)
  rental/[token]        customer rental status (live)
  site/[host]           operator home on subdomain / custom domain
  api/webhooks/*        Stripe platform + Connect webhooks (signature verified, idempotent)
  api/hardware/[provider]/webhook   manufacturer callbacks (adapter verifies + normalizes)
  api/cron/reconcile    expire abandoned checkouts, resolve stuck unlocks, capture overdue
  api/export/…          CSV exports
src/lib/
  rentals/engine.ts     rental orchestration (payment ↔ hardware)
  hardware/             adapter contract, simulator, HeyCharge stub, registry
  stripe/               Connect, Billing, checkout, webhooks, pure mappers
  pricing.ts            single pricing engine used for display AND capture
  i18n/                 English + Spanish dictionaries (type-checked to have identical keys)
supabase/migrations/    schema, RLS, analytics, storage, rental engine, webhooks/billing, privileges
supabase/seed/          demo tenant (simulated) seed
tests/unit              pricing, CSV, domains, Stripe mapping & signatures, crypto, simulator
tests/db                RLS/tenant isolation, roles, rental lifecycle, webhooks — against real Postgres
docs/                   deployment, hardware integration, testing (E2E), operations & security
```

## Local development

```bash
npm install
cp .env.example .env.local        # fill Supabase + Stripe test keys
npm run dev
```

Tests:

```bash
npm test            # unit tests
npm run test:db     # spins up a throwaway Postgres (PG15+ binaries required) with all migrations, runs RLS/engine/webhook tests
npm run typecheck && npm run lint && npm run build
```

## Docs

* [Deployment guide](docs/DEPLOYMENT.md) — Supabase, Vercel, Stripe (test mode), webhooks, domains, cron.
* [Hardware integration](docs/HARDWARE_INTEGRATION.md) — what to ask HeyCharge/EMCC for and how to plug it in.
* [Testing & E2E procedure](docs/TESTING.md)
* [Operations, security & recovery](docs/OPERATIONS.md)

## Guía rápida (ES)

1. **Super admin:** entra con tu cuenta → `/admin`. Crea operadores, edita planes (precios sin tocar código), verifica dominios, responde soporte.
2. **Operador demo:** `/o/demo` (4 estaciones simuladas, 60 días de historial simulado).
3. **Probar una renta completa:** en `/o/demo/machines/<id>` → "Abrir página del cliente" → acepta términos → *Pago simulado y rentar* → vuelve a la máquina → "Simular devolución". El cobro se calcula con la tarifa vigente y queda marcado como simulado.
4. **Cuando lleguen las estaciones HeyCharge:** pedir al proveedor la documentación de API (lista exacta en `docs/HARDWARE_INTEGRATION.md`), implementar `src/lib/hardware/heycharge.ts`, registrar cada estación con su ID real.

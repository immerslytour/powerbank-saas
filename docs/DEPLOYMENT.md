# Deployment guide

Current infrastructure (created for this project):

| Piece | Value |
|---|---|
| Supabase project | **Power Bank SaaS** (`ngucyqgduxkxlzwlvpcg`, us-west-1), migrations 1–7 applied, demo seeded |
| Vercel project | **powerbank-saas** (team *serch*), Next.js, Node 22, Vercel Authentication only on previews |
| Stripe | Platform account *Guidepost Media* — start in **test mode** |

## 1. Supabase

1. Migrations live in `supabase/migrations/` and are already applied to the project. For a new project apply them
   in order (Supabase SQL editor, `supabase db push`, or the MCP `apply_migration`).
2. **Auth → URL configuration**: Site URL = your production URL; add `https://<prod-domain>/auth/callback` to
   Redirect URLs (plus `http://localhost:3000/auth/callback` for local dev).
3. **Auth → Email**: the built-in mailer is rate-limited (good for testing). For production configure custom SMTP
   (Resend, Postmark, SES…).
4. Copy **Project Settings → API Keys**: publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `service_role`/secret key →
   `SUPABASE_SERVICE_ROLE_KEY` (server only).
5. Storage bucket `brand-assets` (public read, tenant-scoped writes) is created by migration 4.
6. Demo data: `supabase/seed/demo_data.sql` (needs the three `demo.*@voltaje.app` users).

## 2. Vercel

1. Connect the GitHub repo to the Vercel project (Project → Settings → Git) or create it from the repo.
2. Environment variables (Production + Preview) — see `.env.example`:

| Variable | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PLATFORM_NAME`, `ALLOW_SIMULATED_PAYMENTS`, `CRON_SECRET`, `APP_ENCRYPTION_KEY` | set |
| `SUPABASE_SERVICE_ROLE_KEY` | **you must add** |
| `STRIPE_SECRET_KEY` (sk_test_…) | **you must add** |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | add after creating the endpoints (step 3) |
| `NEXT_PUBLIC_APP_URL` | optional (defaults to the Vercel production URL); set when you add a custom domain |
| `NEXT_PUBLIC_ROOT_DOMAIN` | optional; enables `operator.yourdomain.com` subdomains |

3. Redeploy after changing env vars (NEXT_PUBLIC_* are inlined at build time).
4. `vercel.json` schedules `/api/cron/reconcile` daily (Hobby limit). On Pro, change to every 5–10 minutes
   (`*/5 * * * *`) so stuck unlocks and abandoned checkouts are resolved quickly.

## 3. Stripe (test mode first)

1. Dashboard → toggle **Test mode**.
2. **Connect**: Settings → Connect → enable Connect for the platform, set branding (icon, color) and the
   platform name. Accounts are created with controller properties equivalent to Standard (full dashboard,
   operator pays Stripe fees, Stripe covers losses) — operators receive rental revenue directly.
3. **Webhooks** (Developers → Webhooks → Add endpoint):
   * `https://<domain>/api/webhooks/stripe` — *Events on your account*:
     `checkout.session.completed, customer.subscription.created, customer.subscription.updated,
     customer.subscription.deleted, customer.subscription.paused, customer.subscription.resumed,
     customer.subscription.trial_will_end, invoice.paid, invoice.payment_failed` → secret → `STRIPE_WEBHOOK_SECRET`
   * `https://<domain>/api/webhooks/stripe-connect` — *Events on Connected accounts*:
     `checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired,
     payment_intent.amount_capturable_updated, payment_intent.payment_failed, charge.refunded, refund.created,
     refund.updated, refund.failed, account.updated, account.application.deauthorized` → secret →
     `STRIPE_CONNECT_WEBHOOK_SECRET`
4. **Plans**: Super admin → Plans → tick *Sync → Stripe* and save each plan; this creates the Product + Price and stores
   the Price ID (prices can be changed later without code; a new Price is created automatically).
5. **Billing portal**: Settings → Billing → Customer portal → enable plan switching/cancellation.
6. Going live: repeat 2–5 in live mode with `sk_live_…` and live webhook secrets.

## 4. Custom domains / subdomains

* **Subdomains**: buy a root domain (e.g. `voltaje.app`), add `voltaje.app` and `*.voltaje.app` to the Vercel project
  (wildcards require Vercel nameservers), set `NEXT_PUBLIC_ROOT_DOMAIN=voltaje.app`. Operators click *Your subdomain* in
  Branding → `slug.voltaje.app` is auto-verified.
* **Operator custom domains**: operator adds `rent.theirbrand.com` in Branding → add the same domain to the Vercel
  project → operator creates `CNAME rent → cname.vercel-dns.com` → Super admin → Operators → *Mark verified*.
  Unverified domains never resolve. A tenant domain only serves that tenant's QR/rental pages.

## 5. Verify a deployment

`/` landing · `/login` · `/admin/settings` (shows which env vars are configured) · `/o/demo` · a machine's
"Open customer page" · simulated rental end-to-end (see `docs/TESTING.md`).

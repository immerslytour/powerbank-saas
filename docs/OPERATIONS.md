# Operations, security & recovery

## Security model

* **RLS everywhere**: all 25 tables have RLS. Tenant data is readable only by active members (role-ranked) or super
  admins. Writes that move money or hardware state are not possible from the browser at all — only through
  SECURITY DEFINER functions granted to `service_role`, called by server code after authorization.
* **Column privileges**: browser roles cannot change `is_super_admin`, tenant `status/plan`, machine telemetry or
  simulation flags, or read encrypted provider credentials / invitation token hashes.
* **Guards**: last-owner protection, no role escalation (managers cannot invite/promote above themselves), plan machine
  & location limits, inactive subscriptions cannot add machines or accept rentals, suspended tenants are read-only.
* **Secrets**: only in Vercel env vars; never `NEXT_PUBLIC_`. `server-only` imports prevent bundling server modules.
  Provider credentials are AES-256-GCM encrypted (`APP_ENCRYPTION_KEY`).
* **Webhooks**: Stripe signatures verified (`constructEventAsync`); events claimed atomically
  (`webhook_claim`) → processed at most once; connected-account events must match the rental's account.
  Payments are only marked authorized after retrieving the PaymentIntent from Stripe (`requires_capture`).
* **Rate limiting** (Postgres-backed, works across serverless instances): sign-in, sign-up, password reset,
  rentals (8 / 10 min / IP), rental status polling, invitations, exports, support tickets, hardware webhooks.
* **Input validation**: zod on every server action; SVG logos scanned for scripts; CSV formula-injection neutralized;
  security headers (HSTS, X-Frame-Options DENY, nosniff, referrer policy).
* **Audit log**: tenant/admin actions (machines, pricing, branding, team, Stripe, refunds, simulator, plan changes…).

## Reconciliation

`/api/cron/reconcile` (Vercel Cron, `CRON_SECRET`):
1. Cancels checkouts unpaid after 45 min.
2. Stuck unlocks (authorized, not confirmed after 5 min): asks the provider for status → confirm, fail (and release
   the hold) or retry.
3. Rentals past `overdue_after_hours` → status *overdue*, capture the maximum charge before the card hold expires
   (~7 days). If the battery comes back later the rental is closed as returned; refund manually if appropriate.

Manual tools: rental page → *Retry unlock*, *Cancel rental*, *Issue refund*; admin → Webhooks → *Retry* failed events.

## Backups & recovery

* Supabase Free: daily backups are not guaranteed — upgrade to **Pro** before going live (daily backups, 7 days)
  and consider **PITR** add-on once real money flows.
* Stripe is the source of truth for money. To reconcile after an incident: compare `payments` (status,
  `stripe_payment_intent_id`) against Stripe's PaymentIntents for each connected account; re-send missed webhook
  events from the Stripe dashboard (they are idempotent here).
* Hardware is the source of truth for batteries: when the HeyCharge adapter is live, use `getBatteryInventory` to
  re-sync slots after outages.
* Migrations are forward-only and versioned in `supabase/migrations/`.

## Going live checklist

- [ ] Supabase Pro + custom SMTP + Auth redirect URLs
- [ ] Stripe live keys, live webhooks, Connect branding, billing portal
- [ ] Custom domain on Vercel, `NEXT_PUBLIC_APP_URL`
- [ ] Cron every 5–10 min (Vercel Pro)
- [ ] HeyCharge adapter implemented and tested on one station
- [ ] Rental terms / refund policy reviewed by counsel for your state (late fees, holds)
- [ ] Change all initial passwords

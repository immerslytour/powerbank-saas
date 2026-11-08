# Testing

## Automated (83 tests)

| Suite | What it proves |
|---|---|
| `tests/db/rls.test.ts` (25) | Tenant isolation (read/update/delete/insert across tenants), role permissions (owner/manager/employee/super admin), anonymous access, column-level privileges (no self-promotion to super admin, no status/plan tampering, encrypted credentials unreadable), plan machine limit, subscription enforcement, last-owner guard, invitation security (hash, email match, single use), suspended tenants read-only, analytics respect RLS, rate limiting, simulation flag cannot be forged |
| `tests/db/rental-engine.test.ts` (15) | Full lifecycle with simulator; idempotent authorization; pricing snapshot immutability; free period; Stripe capture with connected account, exact amount, application fee and idempotency key; unlock failures with 3 retries + hold release; async unlock confirmed by webhook; non-ready hardware refuses; simulated payment refused on real hardware; offline/empty/unknown station; Stripe onboarding gate; late authorization after expiry is released; operator cancellation; overdue capture; unmatched returns; connection events; refunds |
| `tests/db/webhooks.test.ts` (7) | Verified checkout → unlock; duplicate delivery skipped; unauthorized PaymentIntent ignored; foreign connected account rejected; checkout expiry; Connect `account.updated` / deauthorization / reconnection; Billing lifecycle (active → payment failed → past_due grace → canceled blocks rentals); failed events reprocessed on retry |
| `tests/unit/*` (36) | Pricing engine + validation, money parsing, CSV escaping & formula-injection, domain routing, subscription mirror, i18n key parity EN/ES, Stripe account & subscription mapping, webhook signature verification (valid/tampered/wrong secret), AES-GCM encryption, simulator & HeyCharge stub |

```bash
npm test && npm run test:db
```

The DB suites run the **exact production migrations** on a real Postgres with a small Supabase shim
(`tests/db/supabase-shim.sql`: roles, `auth.users`, `auth.uid()`).

## Manual end-to-end procedure

Accounts (created in Supabase): super admin (your email), `demo.owner@`, `demo.manager@`, `demo.employee@voltaje.app`.

1. **Roles** — sign in as employee: no Payments/Analytics/Team/Branding in the menu, cannot add machines. Manager: can
   add machines/locations, refund, edit branding/pricing; cannot change Stripe or plans. Owner: everything.
2. **Isolation** — as super admin create a second operator in `/admin/tenants/new`; sign in as its owner: `/o/demo` is 404.
3. **Simulated rental** — `/o/demo/machines` → open a station → *Open customer page* → accept terms → *Simulated
   payment & rent* → status page shows *Take your power bank* (slot). Back on the machine page: inventory dropped by 1,
   events show `unlock_requested → battery_released`. Click *Simulate return* → rental becomes *Returned*, amount
   computed from pricing, payment *Paid* with the Simulated badge.
4. **Failure handling** — toggle *Fail unlocks* → rent again → status *We couldn't release a power bank*, rental
   *Failed*, 3 `unlock_failed` events, hold released. Toggle *Slow unlocks* → rental stays pending until *Confirm release*.
5. **Offline** — *Set offline* → customer page says the station is offline and blocks payment.
6. **Stripe Connect (test mode)** — Integrations → *Connect Stripe* → complete hosted onboarding with test data
   (`000-000-0000`, SSN `000-00-0000`, routing `110000000` / account `000123456789`) → status becomes Active.
   Customer page now offers *Pay & rent* → Checkout (card `4242 4242 4242 4242`) → returns to status page; the
   hold (max charge) is visible as *uncaptured* in the operator's Stripe dashboard. Simulate return → the payment
   is captured for the exact amount. Refund from the rental page → refund appears in Stripe.
   Decline test: card `4000 0000 0000 0002` → rental stays unpaid; abandoned checkout expires after 30 min.
7. **Billing** — Subscription → *Subscribe* on a plan with a Stripe Price → Checkout → status Active; *Manage
   billing* opens the portal; card `4000 0000 0000 0341` simulates a failed renewal → *payment failed* banner.
8. **CSV** — Rentals / Payments / Customers / Analytics → *Export CSV*.
9. **Language** — EN/ES switcher on every screen, including the customer page.

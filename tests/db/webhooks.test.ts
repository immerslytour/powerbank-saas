/**
 * Stripe webhook processing against real Postgres: idempotency, tenant/account
 * safety, payment verification with Stripe (mocked API), Connect account sync,
 * Billing subscription sync and payment failures.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { pgRpc } from "../helpers/pg-rpc";
import { SimulatorProvider } from "@/lib/hardware/simulator";
import { processEvent } from "@/lib/stripe/webhooks";
import { startRental, type EngineDeps } from "@/lib/rentals/engine";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
let db: Client;
let rpc: ReturnType<typeof pgRpc>;
let tenantId: string;
let machineCode: string;
const ACCT = `acct_${randomBytes(5).toString("hex")}`;

function fakeStripe(pi: Partial<Stripe.PaymentIntent>, session?: Partial<Stripe.Checkout.Session>, sub?: Partial<Stripe.Subscription>) {
  return {
    checkout: { sessions: { retrieve: vi.fn(async () => session) } },
    paymentIntents: { retrieve: vi.fn(async () => pi) },
    subscriptions: { retrieve: vi.fn(async () => sub) },
  } as unknown as Stripe;
}
function engine(): EngineDeps {
  return {
    db: rpc,
    provider: () => new SimulatorProvider(rpc),
    stripe: { capture: vi.fn(async () => ({ chargeId: "ch_1" })), cancel: vi.fn(async () => {}), refund: vi.fn(async () => ({ refundId: "re", status: "succeeded" })) },
  };
}
const ev = (type: string, object: unknown, account: string | undefined = ACCT) =>
  ({ id: `evt_${randomBytes(6).toString("hex")}`, type, account, livemode: false, data: { object } }) as unknown as Stripe.Event;

d("stripe webhooks", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    rpc = pgRpc(db);
    await db.query("update public.plans set is_active = true where code in ('starter', 'growth', 'pro')");
    const owner = randomUUID();
    await db.query("insert into auth.users (id, email) values ($1, $2)", [owner, `wh-${owner.slice(0, 5)}@t.local`]);
    tenantId = (await db.query("select public.provision_tenant('Hook Co', $1, 'growth', $2) id", [`hook-${randomBytes(3).toString("hex")}`, owner])).rows[0].id;
    await db.query("update public.integrations set stripe_account_id = $2, status = 'active', details = '{\"charges_enabled\": true}' where tenant_id = $1", [tenantId, ACCT]);
    const m = await db.query("insert into public.machines (tenant_id, device_id, provider, total_slots) values ($1, $2, 'simulator', 8) returning id, public_code", [tenantId, `WH-${randomBytes(3).toString("hex")}`]);
    await db.query("select public.sim_provision_machine($1, 8)", [m.rows[0].id]);
    machineCode = m.rows[0].public_code;
    await db.query("update public.plans set stripe_price_id = 'price_pro_test' where code = 'pro'");
  });
  afterAll(async () => db?.end());

  it("checkout.session.completed → verifies with Stripe, authorizes, unlocks; duplicate delivery is skipped", async () => {
    const r = await startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" });
    const pi = { id: `pi_${randomBytes(4).toString("hex")}`, status: "requires_capture", amount_capturable: 3000, currency: "usd", livemode: false, metadata: { rental_id: r.rental_id }, latest_charge: "ch_x", customer: null } as Partial<Stripe.PaymentIntent>;
    const session = { id: "cs_1", mode: "payment", metadata: { rental_id: r.rental_id }, payment_intent: pi.id, customer_details: { email: "buyer@x.com" }, customer: "cus_c" } as unknown as Stripe.Checkout.Session;
    const stripe = fakeStripe(pi, session);
    const event = ev("checkout.session.completed", session);
    const first = await processEvent("stripe_connect", event, { db: rpc, stripe, engine: engine() });
    expect(first.status).toBe("processed");
    const row = (await db.query("select status, payment_status, stripe_payment_intent_id from public.rentals where id = $1", [r.rental_id])).rows[0];
    expect(row).toMatchObject({ status: "active", payment_status: "authorized", stripe_payment_intent_id: pi.id });
    const again = await processEvent("stripe_connect", event, { db: rpc, stripe, engine: engine() });
    expect(again.status).toBe("skipped");
    const wh = (await db.query("select status, attempts, tenant_id from public.webhook_events where external_id = $1", [event.id])).rows[0];
    expect(wh).toMatchObject({ status: "processed", attempts: 1, tenant_id: tenantId });
  });

  it("does NOT authorize when Stripe says the payment is not actually authorized", async () => {
    const r = await startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" });
    const pi = { id: `pi_${randomBytes(4).toString("hex")}`, status: "requires_payment_method", amount_capturable: 0, currency: "usd", metadata: { rental_id: r.rental_id } };
    const session = { id: "cs_2", mode: "payment", metadata: { rental_id: r.rental_id }, payment_intent: pi.id } as unknown as Stripe.Checkout.Session;
    const out = await processEvent("stripe_connect", ev("checkout.session.completed", session), { db: rpc, stripe: fakeStripe(pi as never, session), engine: engine() });
    expect(out.status).toBe("ignored");
    expect((await db.query("select status, payment_status from public.rentals where id = $1", [r.rental_id])).rows[0]).toMatchObject({ status: "pending", payment_status: "requires_payment" });
  });

  it("rejects events from a different connected account (tenant isolation) and records the failure", async () => {
    const r = await startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" });
    const session = { id: "cs_3", mode: "payment", metadata: { rental_id: r.rental_id }, payment_intent: "pi_x" } as unknown as Stripe.Checkout.Session;
    const event = ev("checkout.session.completed", session, "acct_attacker");
    await expect(processEvent("stripe_connect", event, { db: rpc, stripe: fakeStripe({}, session), engine: engine() })).rejects.toThrow(/ACCOUNT_MISMATCH/);
    const wh = (await db.query("select status, last_error from public.webhook_events where external_id = $1", [event.id])).rows[0];
    expect(wh.status).toBe("failed");
    expect((await db.query("select payment_status from public.rentals where id = $1", [r.rental_id])).rows[0].payment_status).toBe("requires_payment");
  });

  it("checkout.session.expired cancels the unpaid rental", async () => {
    const r = await startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" });
    await processEvent("stripe_connect", ev("checkout.session.expired", { id: "cs_4", metadata: { rental_id: r.rental_id } }), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    expect((await db.query("select status, failure_reason from public.rentals where id = $1", [r.rental_id])).rows[0]).toMatchObject({ status: "cancelled", failure_reason: "checkout_expired" });
  });

  it("account.updated syncs Connect onboarding state; deauthorization disconnects", async () => {
    const account = { id: ACCT, charges_enabled: false, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: "requirements.past_due" }, business_profile: { name: "Hook" }, country: "US", default_currency: "usd", controller: {} };
    await processEvent("stripe_connect", ev("account.updated", account), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    let integ = (await db.query("select status, details from public.integrations where stripe_account_id = $1", [ACCT])).rows[0];
    expect(integ.status).toBe("restricted");
    expect(integ.details.charges_enabled).toBe(false);
    // payments are refused while charges are disabled
    await expect(startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" })).rejects.toThrow(/PAYMENTS_NOT_ENABLED/);
    await processEvent("stripe_connect", ev("account.updated", { ...account, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], past_due: [], disabled_reason: null } }), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    integ = (await db.query("select status from public.integrations where stripe_account_id = $1", [ACCT])).rows[0];
    expect(integ.status).toBe("active");
    await processEvent("stripe_connect", ev("account.application.deauthorized", { id: "ca_1" }), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    integ = (await db.query("select status, details from public.integrations where stripe_account_id = $1", [ACCT])).rows[0];
    expect(integ.status).toBe("disconnected");
    await expect(startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" })).rejects.toThrow(/PAYMENTS_NOT_ENABLED/);
    // reconnect
    await db.query("select public.integration_link_stripe($1, $2, false)", [tenantId, ACCT]);
    await db.query("update public.integrations set details = '{\"charges_enabled\": true}', status = 'active' where tenant_id = $1", [tenantId]);
  });

  it("billing: subscription lifecycle, plan change and payment failure", async () => {
    await db.query("select public.subscription_set_customer($1, 'cus_billing_1')", [tenantId]);
    const sub = (status: string, price = "price_pro_test") => ({
      id: "sub_test_1", status, customer: "cus_billing_1", cancel_at_period_end: false, canceled_at: null, trial_end: null,
      metadata: { tenant_id: tenantId }, items: { data: [{ price: { id: price }, current_period_end: 1900000000 }] },
    });
    await processEvent("stripe_platform", ev("customer.subscription.created", sub("active"), undefined), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    let row = (await db.query("select s.status, s.stripe_subscription_id, p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = $1", [tenantId])).rows[0];
    expect(row).toMatchObject({ status: "active", stripe_subscription_id: "sub_test_1", code: "pro" });
    const tplan = (await db.query("select p.code from public.tenants t join public.plans p on p.id = t.plan_id where t.id = $1", [tenantId])).rows[0];
    expect(tplan.code).toBe("pro");

    await processEvent("stripe_platform", ev("invoice.payment_failed", { customer: "cus_billing_1" }, undefined), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    expect((await db.query("select last_payment_error from public.subscriptions where tenant_id = $1", [tenantId])).rows[0].last_payment_error).toBe("invoice_payment_failed");
    await processEvent("stripe_platform", ev("customer.subscription.updated", sub("past_due"), undefined), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    expect((await db.query("select public.tenant_subscription_ok($1) ok", [tenantId])).rows[0].ok).toBe(true); // grace while past_due

    await processEvent("stripe_platform", ev("customer.subscription.deleted", sub("canceled"), undefined), { db: rpc, stripe: fakeStripe({}), engine: engine() });
    row = (await db.query("select status from public.subscriptions where tenant_id = $1", [tenantId])).rows[0];
    expect(row.status).toBe("canceled");
    expect((await db.query("select public.tenant_subscription_ok($1) ok", [tenantId])).rows[0].ok).toBe(false);
    await expect(startRental(engine(), { machineCode, locale: "en", paymentProvider: "stripe" })).rejects.toThrow(/OPERATOR_UNAVAILABLE/);
    await db.query("update public.subscriptions set status = 'active' where tenant_id = $1", [tenantId]);
  });

  it("webhook events from Stripe retries are reprocessed after a failure", async () => {
    const event = ev("account.updated", { id: "acct_unknown_zzz", details_submitted: false, requirements: {}, controller: {} });
    const out = await processEvent("stripe_connect", event, { db: rpc, stripe: fakeStripe({}), engine: engine() });
    expect(out.status).toBe("ignored"); // unknown account: recorded, nothing changed
    await db.query("update public.webhook_events set status = 'failed' where external_id = $1", [event.id]);
    const retry = await processEvent("stripe_connect", event, { db: rpc, stripe: fakeStripe({}), engine: engine() });
    expect(retry.status).toBe("ignored");
    expect((await db.query("select attempts from public.webhook_events where external_id = $1", [event.id])).rows[0].attempts).toBe(2);
  });
});

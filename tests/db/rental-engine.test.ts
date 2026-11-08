/**
 * End-to-end rental lifecycle against real Postgres + the simulator adapter.
 * Covers: rental creation, payment authorization, unlock (success/failure/retry),
 * return flow, final capture, idempotency, overdue handling, refunds, Stripe calls.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { pgRpc } from "../helpers/pg-rpc";
import { SimulatorProvider } from "@/lib/hardware/simulator";
import { HeyChargeProvider } from "@/lib/hardware/heycharge";
import {
  startRental,
  onPaymentAuthorized,
  handleDeviceEvent,
  cancelRental,
  reconcile,
  type EngineDeps,
  type StripeOps,
} from "@/lib/rentals/engine";
import type { DeviceRef } from "@/lib/hardware/types";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

let db: Client;
let rpc: ReturnType<typeof pgRpc>;
let tenantId: string;
let stripeMock: StripeOps & { calls: Record<string, unknown[]> };

function deps(overrides: Partial<EngineDeps> = {}): EngineDeps {
  return {
    db: rpc,
    provider: (id) => (id === "simulator" ? new SimulatorProvider(rpc, () => 0.99) : new HeyChargeProvider()),
    stripe: stripeMock,
    applicationFeeBps: 0,
    ...overrides,
  };
}

async function createMachine(opts: { simulated?: boolean; provider?: string; batteries?: number; sim?: object } = {}) {
  const { simulated = true, provider = "simulator", batteries = 8, sim = {} } = opts;
  const loc = await db.query("insert into public.locations (tenant_id, name) values ($1, 'Cafe') returning id", [tenantId]);
  const m = await db.query(
    `insert into public.machines (tenant_id, location_id, device_id, provider, is_simulated, total_slots, sim_config)
     values ($1, $2, $3, $4, $5, 8, $6) returning id, public_code, device_id`,
    [tenantId, loc.rows[0].id, `DEV-${randomBytes(3).toString("hex")}`, provider, simulated, JSON.stringify(sim)],
  );
  if (simulated) await db.query("select public.sim_provision_machine($1, $2)", [m.rows[0].id, batteries]);
  else {
    await db.query("update public.machines set connection_status = 'online', available_batteries = 4 where id = $1", [m.rows[0].id]);
  }
  return m.rows[0] as { id: string; public_code: string; device_id: string };
}

async function rental(id: string) {
  return (await db.query("select * from public.rentals where id = $1", [id])).rows[0];
}
async function payment(rentalId: string) {
  return (await db.query("select * from public.payments where rental_id = $1", [rentalId])).rows[0];
}

d("rental engine (simulator + real Postgres)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    rpc = pgRpc(db);
    await db.query("update public.plans set is_active = true where code in ('starter', 'growth', 'pro')");
    const owner = randomUUID();
    await db.query("insert into auth.users (id, email) values ($1, $2)", [owner, `own-${owner.slice(0, 5)}@t.local`]);
    const t = await db.query("select public.provision_tenant('Engine Co', $1, 'pro', $2) id", [
      `engine-${randomBytes(3).toString("hex")}`, owner,
    ]);
    tenantId = t.rows[0].id;
    await db.query(
      `update public.rental_pricing set initial_fee_cents = 200, free_minutes = 5, hourly_rate_cents = 150,
         daily_rate_cents = 1000, max_charge_cents = 3500, overdue_after_hours = 72 where tenant_id = $1`, [tenantId]);
    await db.query(
      `update public.integrations set stripe_account_id = 'acct_test123', status = 'active',
         details = '{"charges_enabled": true}' where tenant_id = $1 and kind = 'stripe_connect'`, [tenantId]);
  });
  afterAll(async () => db?.end());

  beforeEach(() => {
    const calls: Record<string, unknown[]> = { capture: [], cancel: [], refund: [] };
    stripeMock = {
      calls,
      capture: vi.fn(async (a) => { calls.capture.push(a); return { chargeId: "ch_test_1" }; }),
      cancel: vi.fn(async (a) => { calls.cancel.push(a); }),
      refund: vi.fn(async (a) => { calls.refund.push(a); return { refundId: "re_1", status: "succeeded" }; }),
    };
  });

  it("full simulated lifecycle: pay → confirmed release → return → capture", async () => {
    const m = await createMachine();
    const before = (await db.query("select available_batteries from public.machines where id = $1", [m.id])).rows[0];
    expect(before.available_batteries).toBe(8);

    const start = await startRental(deps(), { machineCode: m.public_code.toLowerCase(), locale: "es", email: "Cliente@Mail.com", paymentProvider: "simulated" });
    expect(start.amount_to_authorize).toBe(3500);
    expect(start.is_simulated).toBe(true);
    let r = await rental(start.rental_id);
    expect(r.status).toBe("pending");
    expect(r.payment_status).toBe("requires_payment");
    expect(r.pricing_snapshot.hourly_rate_cents).toBe(150);

    const auth = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "simulated", paymentIntentId: null, amount: 3500, currency: "usd", livemode: false,
    });
    expect(auth.unlock).toBe("confirmed");
    r = await rental(start.rental_id);
    expect(r.status).toBe("active");
    expect(r.payment_status).toBe("authorized");
    expect(r.battery_serial).toMatch(/^SIM-/);
    expect(r.started_at).not.toBeNull();
    const after = (await db.query("select available_batteries from public.machines where id = $1", [m.id])).rows[0];
    expect(after.available_batteries).toBe(7);

    // Idempotent: replaying the authorization does not unlock a second battery.
    const again = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "simulated", paymentIntentId: null, amount: 3500, currency: "usd", livemode: false,
    });
    expect(again.transitioned).toBe(false);
    expect(again.unlock).toBeNull();
    const pays = await db.query("select count(*)::int n from public.payments where rental_id = $1", [start.rental_id]);
    expect(pays.rows[0].n).toBe(1);

    // Pricing changes after start must NOT affect this rental (snapshot).
    await db.query("update public.rental_pricing set hourly_rate_cents = 999 where tenant_id = $1", [tenantId]);

    // 2h05m rental: 200 + ceil(120/60)*150 = 500
    await db.query("update public.rentals set started_at = now() - interval '125 minutes' where id = $1", [start.rental_id]);
    const sim = new SimulatorProvider(rpc, () => 0.5);
    const device: DeviceRef = { machineId: m.id, tenantId, deviceId: m.device_id, isSimulated: true };
    const ret = await sim.simulateReturn(device, r.battery_serial);
    const res = await handleDeviceEvent(deps(), "simulator", ret);
    expect(res).toMatchObject({ handled: true, amount: 500 });
    r = await rental(start.rental_id);
    expect(r.status).toBe("returned");
    expect(r.payment_status).toBe("succeeded");
    expect(r.amount_cents).toBe(500);
    const pay = await payment(start.rental_id);
    expect(pay.amount_captured_cents).toBe(500);
    expect(pay.is_simulated).toBe(true);
    expect(stripeMock.capture).not.toHaveBeenCalled(); // simulated payments never hit Stripe

    // Duplicate return webhook is ignored.
    const dup = await handleDeviceEvent(deps(), "simulator", ret);
    expect(dup).toMatchObject({ duplicate: true });
    const avail = (await db.query("select available_batteries from public.machines where id = $1", [m.id])).rows[0];
    expect(avail.available_batteries).toBe(8);
    const cust = await db.query("select email, rental_count from public.customers where id = $1", [r.customer_id]);
    expect(cust.rows[0]).toMatchObject({ email: "cliente@mail.com", rental_count: 1 });
    await db.query("update public.rental_pricing set hourly_rate_cents = 150 where tenant_id = $1", [tenantId]);
  });

  it("free period: returning within free minutes charges nothing and releases the hold", async () => {
    const m = await createMachine();
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: `pi_${randomBytes(4).toString("hex")}`,
      amount: 3500, currency: "usd", livemode: false,
    });
    const r = await rental(start.rental_id);
    const sim = new SimulatorProvider(rpc);
    const ev = await sim.simulateReturn({ machineId: m.id, tenantId, deviceId: m.device_id, isSimulated: true }, r.battery_serial);
    await handleDeviceEvent(deps(), "simulator", ev);
    const done = await rental(start.rental_id);
    expect(done.amount_cents).toBe(0);
    expect(done.payment_status).toBe("canceled");
    expect(stripeMock.cancel).toHaveBeenCalledTimes(1);
    expect(stripeMock.capture).not.toHaveBeenCalled();
  });

  it("stripe capture uses the connected account, exact amount, and an idempotency key", async () => {
    const m = await createMachine();
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    await onPaymentAuthorized(deps({ applicationFeeBps: 1000 }), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
      email: "a@b.co", stripeCustomerId: "cus_1",
    });
    await db.query("update public.rentals set started_at = now() - interval '3 days 2 hours' where id = $1", [start.rental_id]);
    const r = await rental(start.rental_id);
    const sim = new SimulatorProvider(rpc);
    const ev = await sim.simulateReturn({ machineId: m.id, tenantId, deviceId: m.device_id, isSimulated: true }, r.battery_serial);
    await handleDeviceEvent(deps({ applicationFeeBps: 1000 }), "simulator", ev);
    // 3 days + 2h - 5 free min → 200 + 3*1000 + min(2h*150, 1000)=300 → 3500 (== cap)
    expect(stripeMock.capture).toHaveBeenCalledWith({
      paymentIntentId: pi, account: "acct_test123", amount: 3500, applicationFee: 350, idempotencyKey: `capture-${start.rental_id}`,
    });
    const pay = await payment(start.rental_id);
    expect(pay).toMatchObject({ status: "succeeded", stripe_charge_id: "ch_test_1", application_fee_cents: 350 });
  });

  it("unlock failure: retries up to 3 times, fails the rental and releases the card hold", async () => {
    const m = await createMachine({ sim: { unlock_failure: true } });
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    const res = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
    });
    expect(res.unlock).toBe("failed");
    const r = await rental(start.rental_id);
    expect(r.status).toBe("failed");
    expect(r.unlock_attempts).toBe(3);
    expect(r.payment_status).toBe("canceled");
    expect(r.started_at).toBeNull();
    expect(stripeMock.cancel).toHaveBeenCalledWith({ paymentIntentId: pi, account: "acct_test123", idempotencyKey: `release-${start.rental_id}` });
    const evs = await db.query("select count(*)::int n from public.device_events where rental_id = $1 and event_type = 'unlock_failed'", [start.rental_id]);
    expect(evs.rows[0].n).toBe(3);
    const avail = (await db.query("select available_batteries from public.machines where id = $1", [m.id])).rows[0];
    expect(avail.available_batteries).toBe(8); // no battery left the machine
  });

  it("asynchronous unlock: pending until the provider confirms; never active before confirmation", async () => {
    const m = await createMachine({ sim: { unlock_async: true } });
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "simulated" });
    const res = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "simulated", paymentIntentId: null, amount: 3500, currency: "usd", livemode: false,
    });
    expect(res.unlock).toBe("pending");
    expect((await rental(start.rental_id)).status).toBe("pending");
    // Provider webhook confirms the release
    const out = await handleDeviceEvent(deps(), "simulator", {
      type: "battery_released", deviceId: m.device_id, rentalRef: `sim-${start.rental_id}`, batterySerial: "SIM-ASYNC-01",
      slot: 3, occurredAt: new Date().toISOString(), externalId: `rel-${start.rental_id}`,
    });
    expect(out).toMatchObject({ handled: true, rentalId: start.rental_id });
    const r = await rental(start.rental_id);
    expect(r.status).toBe("active");
    expect(r.battery_serial).toBe("SIM-ASYNC-01");
  });

  it("machines whose hardware adapter is not ready refuse to release and refund the hold", async () => {
    const m = await createMachine({ simulated: false, provider: "heycharge" });
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    expect(start.is_simulated).toBe(false);
    const res = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
    });
    expect(res.unlock).toBe("failed");
    const r = await rental(start.rental_id);
    expect(r.status).toBe("failed");
    expect(r.failure_reason).toMatch(/HeyCharge API documentation/);
    expect(stripeMock.cancel).toHaveBeenCalledTimes(1);
  });

  it("simulated payments are rejected for real hardware", async () => {
    const m = await createMachine({ simulated: false, provider: "heycharge" });
    await expect(startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "simulated" })).rejects.toThrow(
      /SIMULATED_PAYMENT_NOT_ALLOWED/,
    );
  });

  it("refuses rentals for offline machines, empty machines, and unknown codes", async () => {
    const off = await createMachine();
    await db.query("update public.machines set connection_status = 'offline' where id = $1", [off.id]);
    await expect(startRental(deps(), { machineCode: off.public_code, locale: "en", paymentProvider: "simulated" })).rejects.toThrow(/MACHINE_OFFLINE/);
    const empty = await createMachine({ batteries: 0 });
    await expect(startRental(deps(), { machineCode: empty.public_code, locale: "en", paymentProvider: "simulated" })).rejects.toThrow(/NO_BATTERIES/);
    await expect(startRental(deps(), { machineCode: "NOPE0000", locale: "en", paymentProvider: "simulated" })).rejects.toThrow(/MACHINE_NOT_FOUND/);
  });

  it("refuses Stripe rentals when the operator has not finished Stripe onboarding", async () => {
    const m = await createMachine();
    await db.query("update public.integrations set details = '{\"charges_enabled\": false}' where tenant_id = $1", [tenantId]);
    await expect(startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" })).rejects.toThrow(/PAYMENTS_NOT_ENABLED/);
    await db.query("update public.integrations set details = '{\"charges_enabled\": true}' where tenant_id = $1", [tenantId]);
  });

  it("cancelled/expired rentals release a late authorization instead of unlocking", async () => {
    const m = await createMachine();
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    await db.query("update public.rentals set created_at = now() - interval '2 hours' where id = $1", [start.rental_id]);
    await reconcile(deps());
    expect((await rental(start.rental_id)).status).toBe("cancelled");
    const res = await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
    });
    expect(res.needs_release).toBe(true);
    expect(stripeMock.cancel).toHaveBeenCalledTimes(1);
    expect((await rental(start.rental_id)).started_at).toBeNull();
  });

  it("operator cancellation of an authorized-but-not-started rental releases the hold", async () => {
    const m = await createMachine({ sim: { unlock_async: true } });
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
    });
    await cancelRental(deps(), start.rental_id, "operator_cancelled");
    const r = await rental(start.rental_id);
    expect(r.status).toBe("cancelled");
    expect(r.payment_status).toBe("canceled");
    expect(stripeMock.cancel).toHaveBeenCalledTimes(1);
  });

  it("overdue rentals are captured at the maximum charge by reconciliation", async () => {
    const m = await createMachine();
    const pi = `pi_${randomBytes(4).toString("hex")}`;
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "stripe" });
    await onPaymentAuthorized(deps(), {
      rentalId: start.rental_id, provider: "stripe", paymentIntentId: pi, amount: 3500, currency: "usd", livemode: false,
    });
    await db.query("update public.rentals set started_at = now() - interval '80 hours' where id = $1", [start.rental_id]);
    const summary = await reconcile(deps());
    expect(summary.overdue).toBeGreaterThanOrEqual(1);
    const r = await rental(start.rental_id);
    expect(r.status).toBe("overdue");
    expect(r.amount_cents).toBe(3500);
    expect(r.payment_status).toBe("succeeded");
    expect(stripeMock.capture).toHaveBeenCalledWith(expect.objectContaining({ amount: 3500, paymentIntentId: pi }));
  });

  it("returns of unknown batteries are logged, not matched to a rental", async () => {
    const m = await createMachine({ batteries: 4 });
    const out = await handleDeviceEvent(deps(), "simulator", {
      type: "battery_returned", deviceId: m.device_id, batterySerial: "FOREIGN-1", slot: 6, chargeLevel: 40,
      occurredAt: new Date().toISOString(), externalId: `x-${randomUUID()}`,
    });
    expect(out).toMatchObject({ handled: true, matched: false });
    const ev = await db.query("select count(*)::int n from public.device_events where machine_id = $1 and event_type = 'return_unmatched'", [m.id]);
    expect(ev.rows[0].n).toBe(1);
  });

  it("connection events update machine status and are logged once", async () => {
    const m = await createMachine();
    const sim = new SimulatorProvider(rpc);
    const ev = sim.simulateConnection({ machineId: m.id, tenantId, deviceId: m.device_id, isSimulated: true }, "offline");
    await handleDeviceEvent(deps(), "simulator", ev);
    await handleDeviceEvent(deps(), "simulator", ev);
    const row = (await db.query("select connection_status from public.machines where id = $1", [m.id])).rows[0];
    expect(row.connection_status).toBe("offline");
    const n = await db.query("select count(*)::int n from public.device_events where machine_id = $1 and event_type = 'connection_changed' and payload->>'status' = 'offline'", [m.id]);
    expect(n.rows[0].n).toBe(1);
  });

  it("refund bookkeeping: partial then full", async () => {
    const m = await createMachine();
    const start = await startRental(deps(), { machineCode: m.public_code, locale: "en", paymentProvider: "simulated" });
    await onPaymentAuthorized(deps(), { rentalId: start.rental_id, provider: "simulated", paymentIntentId: null, amount: 3500, currency: "usd", livemode: false });
    await db.query("update public.rentals set started_at = now() - interval '61 minutes' where id = $1", [start.rental_id]);
    const r = await rental(start.rental_id);
    const sim = new SimulatorProvider(rpc);
    await handleDeviceEvent(deps(), "simulator", await sim.simulateReturn({ machineId: m.id, tenantId, deviceId: m.device_id, isSimulated: true }, r.battery_serial));
    // 61 min - 5 free = 56 → 200 + 150 = 350
    const pay = await payment(start.rental_id);
    expect(pay.amount_captured_cents).toBe(350);
    await db.query("select public.refund_apply($1, 100, 'succeeded', null, 'goodwill', null, $2, true)", [pay.id, `k-${randomUUID()}`]);
    let rr = await rental(start.rental_id);
    expect(rr).toMatchObject({ refunded_cents: 100, refund_status: "partial", payment_status: "partially_refunded" });
    await db.query("select public.refund_apply($1, 250, 'succeeded', null, 'rest', null, $2, true)", [pay.id, `k-${randomUUID()}`]);
    rr = await rental(start.rental_id);
    expect(rr).toMatchObject({ refunded_cents: 350, refund_status: "full", payment_status: "refunded" });
  });
});

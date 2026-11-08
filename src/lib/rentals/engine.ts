/**
 * Rental engine — orchestrates payment authorization, hardware unlock,
 * return confirmation and final capture.
 *
 * Invariants:
 *  - A rental becomes ACTIVE only after the hardware provider confirms release.
 *  - A rental is RETURNED only after the hardware provider confirms the return.
 *  - Payment state changes only from server-verified sources (Stripe API/webhooks).
 *  - Every transition is an atomic, idempotent SQL function (see migration 5),
 *    so webhook retries / double clicks can never double-unlock or double-charge.
 */
import type { RpcClient } from "../rpc";
import { rpcOrThrow } from "../rpc";
import type { DeviceRef, HardwareProvider, NormalizedDeviceEvent, SimConfig } from "../hardware/types";
import { computeCharge, rentalMinutes, type Pricing } from "../pricing";

export const MAX_UNLOCK_ATTEMPTS = 3;

/** Stripe operations on a connected account (direct charges). Injected for testability. */
export interface StripeOps {
  capture(a: { paymentIntentId: string; account: string; amount: number; applicationFee: number; idempotencyKey: string }): Promise<{ chargeId: string | null }>;
  cancel(a: { paymentIntentId: string; account: string; idempotencyKey: string }): Promise<void>;
  refund(a: { paymentIntentId: string; account: string; amount: number; idempotencyKey: string; reason?: string }): Promise<{ refundId: string; status: string }>;
}

export type EngineDeps = {
  db: RpcClient;
  provider: (id: string) => HardwareProvider;
  stripe: StripeOps | null;
  applicationFeeBps?: number;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
};

type RentalRow = {
  id: string;
  tenant_id: string;
  machine_id: string;
  status: string;
  payment_status: string;
  started_at: string | null;
  returned_at: string | null;
  amount_cents: number;
  authorized_cents: number;
  currency: string;
  pricing_snapshot: Pricing;
  stripe_payment_intent_id: string | null;
  stripe_account_id: string | null;
  unlock_attempts: number;
  is_simulated: boolean;
  battery_serial: string | null;
};

export type RentalContext = {
  rental: RentalRow;
  machine: { id: string; device_id: string; provider: string; is_simulated: boolean; sim_config: SimConfig; name: string; public_code: string };
  tenant: { id: string; slug: string; name: string };
  payment: { id: string; provider: "stripe" | "simulated"; status: string; stripe_payment_intent_id: string | null; stripe_account_id: string | null } | null;
};

const noop = () => {};

export async function getContext(db: RpcClient, rentalId: string): Promise<RentalContext> {
  const ctx = await rpcOrThrow<RentalContext | null>(db, "rental_context", { p_rental: rentalId });
  if (!ctx) throw new Error("RENTAL_NOT_FOUND");
  return ctx;
}

function deviceRef(ctx: RentalContext): DeviceRef {
  return {
    machineId: ctx.machine.id,
    tenantId: ctx.tenant.id,
    deviceId: ctx.machine.device_id,
    isSimulated: ctx.machine.is_simulated,
    simConfig: ctx.machine.sim_config ?? {},
  };
}

export type StartRentalInput = {
  machineCode: string;
  locale: "en" | "es";
  email?: string | null;
  paymentProvider: "stripe" | "simulated";
};

export type StartRentalResult = {
  rental_id: string;
  public_token: string;
  tenant_id: string;
  tenant_slug: string;
  amount_to_authorize: number;
  currency: string;
  stripe_account_id: string | null;
  is_simulated: boolean;
  customer_id: string | null;
};

export async function startRental(deps: EngineDeps, input: StartRentalInput): Promise<StartRentalResult> {
  return rpcOrThrow<StartRentalResult>(deps.db, "rental_start", {
    p_machine_code: input.machineCode,
    p_locale: input.locale,
    p_customer_email: input.email ?? null,
    p_payment_provider: input.paymentProvider,
  });
}

export type AuthorizedInput = {
  rentalId: string;
  provider: "stripe" | "simulated";
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  livemode: boolean;
  email?: string | null;
  stripeCustomerId?: string | null;
  chargeId?: string | null;
};

/**
 * Called ONLY after the server verified the authorization with Stripe
 * (webhook or API retrieval) — or by the simulated gateway for simulated machines.
 */
export async function onPaymentAuthorized(deps: EngineDeps, input: AuthorizedInput) {
  const res = await rpcOrThrow<{ transitioned: boolean; status: string; needs_release: boolean }>(
    deps.db,
    "rental_payment_authorized",
    {
      p_rental: input.rentalId,
      p_provider: input.provider,
      p_payment_intent: input.paymentIntentId,
      p_amount: input.amount,
      p_currency: input.currency,
      p_livemode: input.livemode,
      p_customer_email: input.email ?? null,
      p_stripe_customer: input.stripeCustomerId ?? null,
      p_charge: input.chargeId ?? null,
    },
  );
  if (res.needs_release) {
    await releaseHold(deps, input.rentalId);
    return { ...res, unlock: null };
  }
  if (res.status !== "pending") return { ...res, unlock: null };
  const unlock = await dispatchUnlock(deps, input.rentalId);
  return { ...res, unlock };
}

export type DispatchOutcome = "confirmed" | "pending" | "failed" | "skipped";

/** Send the unlock command with bounded retries. Safe to call concurrently. */
export async function dispatchUnlock(deps: EngineDeps, rentalId: string): Promise<DispatchOutcome> {
  const log = deps.log ?? noop;
  for (let i = 0; i < MAX_UNLOCK_ATTEMPTS; i++) {
    const ctx = await rpcOrThrow<RentalContext | null>(deps.db, "rental_claim_unlock", {
      p_rental: rentalId,
      p_max_attempts: MAX_UNLOCK_ATTEMPTS,
    });
    if (!ctx) return i === 0 ? "skipped" : "failed";

    const provider = deps.provider(ctx.machine.provider);
    if (!provider.isReady) {
      await failUnlock(deps, rentalId, provider.notReadyReason ?? "provider_not_ready", true);
      return "failed";
    }
    let result;
    try {
      result = await provider.unlockBattery({
        device: deviceRef(ctx),
        rentalId,
        idempotencyKey: `${rentalId}:${ctx.rental.unlock_attempts}`,
      });
    } catch (e) {
      result = { status: "failed" as const, reason: `provider_error: ${(e as Error).message}`, retryable: true };
    }

    if (result.status === "confirmed") {
      await rpcOrThrow(deps.db, "rental_unlock_confirmed", {
        p_rental: rentalId,
        p_battery_serial: result.batterySerial,
        p_slot: result.slot,
        p_provider_ref: result.providerRef,
        p_source: ctx.machine.is_simulated ? "simulator" : "provider",
      });
      log("info", "unlock confirmed", { rentalId, battery: result.batterySerial });
      return "confirmed";
    }
    if (result.status === "pending") {
      if (result.providerRef)
        await rpcOrThrow(deps.db, "rental_set_provider_ref", { p_rental: rentalId, p_ref: result.providerRef });
      await rpcOrThrow(deps.db, "log_device_event", {
        p_tenant: ctx.tenant.id,
        p_machine: ctx.machine.id,
        p_rental: rentalId,
        p_type: "unlock_pending",
        p_source: "system",
        p_payload: { provider_ref: result.providerRef },
        p_severity: "info",
        p_simulated: ctx.machine.is_simulated,
      });
      return "pending";
    }
    const lastAttempt = ctx.rental.unlock_attempts >= MAX_UNLOCK_ATTEMPTS || !result.retryable;
    log("warn", "unlock failed", { rentalId, reason: result.reason, attempt: ctx.rental.unlock_attempts });
    if (lastAttempt) {
      await failUnlock(deps, rentalId, result.reason, true);
      return "failed";
    }
    await rpcOrThrow(deps.db, "rental_unlock_failed", { p_rental: rentalId, p_reason: result.reason, p_final: false });
  }
  await failUnlock(deps, rentalId, "max_attempts_exceeded", true);
  return "failed";
}

async function failUnlock(deps: EngineDeps, rentalId: string, reason: string, final: boolean) {
  await rpcOrThrow(deps.db, "rental_unlock_failed", { p_rental: rentalId, p_reason: reason, p_final: final });
  if (final) await releaseHold(deps, rentalId);
}

/** Release an authorization hold without charging (failed unlock / cancellation). */
export async function releaseHold(deps: EngineDeps, rentalId: string) {
  const ctx = await getContext(deps.db, rentalId);
  const pay = ctx.payment;
  if (pay && pay.status === "authorized" && pay.provider === "stripe" && pay.stripe_payment_intent_id) {
    if (!deps.stripe) throw new Error("STRIPE_NOT_CONFIGURED");
    await deps.stripe.cancel({
      paymentIntentId: pay.stripe_payment_intent_id,
      account: pay.stripe_account_id ?? ctx.rental.stripe_account_id ?? "",
      idempotencyKey: `release-${rentalId}`,
    });
  }
  await rpcOrThrow(deps.db, "rental_payment_released", { p_rental: rentalId });
}

/** Compute and capture the final charge for a returned (or overdue) rental. */
export async function finalizeRental(deps: EngineDeps, rentalId: string, opts: { chargeMax?: boolean } = {}) {
  const ctx = await getContext(deps.db, rentalId);
  const r = ctx.rental;
  if (["succeeded", "partially_refunded", "refunded", "canceled"].includes(r.payment_status)) {
    return { amount: r.amount_cents, alreadyFinal: true };
  }
  if (r.payment_status !== "authorized") throw new Error(`CANNOT_FINALIZE_${r.payment_status}`);
  if (!r.started_at) throw new Error("RENTAL_NOT_STARTED");
  const end = r.returned_at ?? new Date().toISOString();
  const breakdown = computeCharge(r.pricing_snapshot, rentalMinutes(r.started_at, end));
  const amount = Math.min(opts.chargeMax ? r.pricing_snapshot.max_charge_cents : breakdown.total, r.authorized_cents);
  const fee = Math.floor((amount * (deps.applicationFeeBps ?? 0)) / 10_000);

  const pay = ctx.payment;
  let chargeId: string | null = null;
  if (pay?.provider === "stripe") {
    if (!deps.stripe) throw new Error("STRIPE_NOT_CONFIGURED");
    const account = pay.stripe_account_id ?? r.stripe_account_id ?? "";
    try {
      if (amount === 0) {
        await deps.stripe.cancel({ paymentIntentId: pay.stripe_payment_intent_id!, account, idempotencyKey: `release-${rentalId}` });
      } else {
        const res = await deps.stripe.capture({
          paymentIntentId: pay.stripe_payment_intent_id!,
          account,
          amount,
          applicationFee: fee,
          idempotencyKey: `capture-${rentalId}`,
        });
        chargeId = res.chargeId;
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      await rpcOrThrow(deps.db, "rental_payment_failed", {
        p_rental: rentalId,
        p_code: err.code ?? "capture_failed",
        p_message: err.message ?? "Capture failed",
      });
      throw e;
    }
  }
  await rpcOrThrow(deps.db, "rental_payment_captured", {
    p_rental: rentalId,
    p_amount: amount,
    p_charge: chargeId,
    p_application_fee: pay?.provider === "stripe" ? fee : 0,
  });
  return { amount, breakdown, alreadyFinal: false };
}

type MachineLookup = { id: string; tenant_id: string; is_simulated: boolean; device_id: string; provider: string };

/**
 * Single entry point for ALL hardware events (manufacturer webhooks, polling,
 * simulator). Events are deduplicated by externalId.
 */
export async function handleDeviceEvent(deps: EngineDeps, providerId: string, ev: NormalizedDeviceEvent) {
  const machine = await rpcOrThrow<MachineLookup | null>(deps.db, "machine_by_device", {
    p_provider: providerId,
    p_device_id: ev.deviceId,
  });
  if (!machine) return { handled: false, reason: "unknown_device" };
  const source = machine.is_simulated ? "simulator" : "provider";

  switch (ev.type) {
    case "connection_changed":
      await rpcOrThrow(deps.db, "machine_set_connection", {
        p_machine: machine.id,
        p_status: ev.status,
        p_source: source,
        p_external_id: ev.externalId,
      });
      return { handled: true };

    case "device_error":
      await rpcOrThrow(deps.db, "log_device_event", {
        p_tenant: machine.tenant_id,
        p_machine: machine.id,
        p_rental: null,
        p_type: "device_error",
        p_source: source,
        p_payload: { code: ev.code, message: ev.message },
        p_severity: "error",
        p_simulated: machine.is_simulated,
        p_external_id: ev.externalId,
        p_occurred_at: ev.occurredAt,
      });
      return { handled: true };

    case "battery_released": {
      if (!ev.rentalRef) return { handled: false, reason: "missing_rental_ref" };
      const rentalId = await rpcOrThrow<string | null>(deps.db, "rental_by_provider_ref", {
        p_tenant: machine.tenant_id,
        p_ref: ev.rentalRef,
      });
      if (!rentalId) return { handled: false, reason: "unknown_rental" };
      await rpcOrThrow(deps.db, "rental_unlock_confirmed", {
        p_rental: rentalId,
        p_battery_serial: ev.batterySerial,
        p_slot: ev.slot,
        p_provider_ref: ev.rentalRef,
        p_source: source,
      });
      return { handled: true, rentalId };
    }

    case "unlock_failed": {
      if (!ev.rentalRef) return { handled: false, reason: "missing_rental_ref" };
      const rentalId = await rpcOrThrow<string | null>(deps.db, "rental_by_provider_ref", {
        p_tenant: machine.tenant_id,
        p_ref: ev.rentalRef,
      });
      if (!rentalId) return { handled: false, reason: "unknown_rental" };
      await failUnlock(deps, rentalId, ev.reason, true);
      return { handled: true, rentalId };
    }

    case "battery_returned": {
      const res = await rpcOrThrow<{ matched?: boolean; duplicate?: boolean; rental_id?: string; was_overdue?: boolean }>(
        deps.db,
        "rental_battery_returned",
        {
          p_tenant: machine.tenant_id,
          p_battery_serial: ev.batterySerial,
          p_return_machine: machine.id,
          p_slot: ev.slot,
          p_returned_at: ev.occurredAt,
          p_source: source,
          p_external_id: ev.externalId,
          p_charge_level: ev.chargeLevel,
        },
      );
      if (res.duplicate) return { handled: true, duplicate: true };
      if (!res.matched || !res.rental_id) return { handled: true, matched: false };
      const fin = await finalizeRental(deps, res.rental_id);
      return { handled: true, rentalId: res.rental_id, amount: fin.amount };
    }
  }
}

/** Operator / system cancellation of a rental that never started. */
export async function cancelRental(deps: EngineDeps, rentalId: string, reason: string) {
  await rpcOrThrow(deps.db, "rental_cancel", { p_rental: rentalId, p_reason: reason });
  await releaseHold(deps, rentalId);
}

/**
 * Periodic reconciliation (cron):
 *  - expire abandoned checkouts
 *  - retry/resolve stuck unlocks (ask provider for status)
 *  - mark overdue rentals and capture the maximum charge before the card hold expires
 */
export async function reconcile(deps: EngineDeps) {
  const log = deps.log ?? noop;
  const summary = { expired: 0, unlocksRetried: 0, overdue: 0, errors: [] as string[] };
  const expired = await rpcOrThrow<string[]>(deps.db, "rental_expire_pending", { p_minutes: 45 });
  summary.expired = expired?.length ?? 0;

  const stuck = (await rpcOrThrow<string[]>(deps.db, "rental_stuck_unlocks", { p_minutes: 5 })) ?? [];
  for (const id of stuck) {
    try {
      const ctx = await getContext(deps.db, id);
      const provider = deps.provider(ctx.machine.provider);
      const ref = (ctx.rental as RentalRow & { provider_rental_ref?: string | null }).provider_rental_ref;
      if (provider.isReady && ref) {
        const st = await provider.getRentalStatus(ref, deviceRef(ctx));
        if (st.state === "released" && st.batterySerial) {
          await rpcOrThrow(deps.db, "rental_unlock_confirmed", {
            p_rental: id,
            p_battery_serial: st.batterySerial,
            p_slot: st.slot ?? null,
            p_provider_ref: ref,
            p_source: ctx.machine.is_simulated ? "simulator" : "provider",
          });
          continue;
        }
        if (st.state === "failed") {
          await failUnlock(deps, id, "provider_reported_failure", true);
          continue;
        }
      }
      const out = await dispatchUnlock(deps, id);
      if (out === "skipped" && ctx.rental.unlock_attempts >= MAX_UNLOCK_ATTEMPTS) {
        await failUnlock(deps, id, "unlock_not_confirmed", true);
      }
      summary.unlocksRetried++;
    } catch (e) {
      summary.errors.push(`${id}: ${(e as Error).message}`);
      log("error", "reconcile unlock failed", { id, error: (e as Error).message });
    }
  }

  const overdue = (await rpcOrThrow<string[]>(deps.db, "rental_mark_overdue", {})) ?? [];
  for (const id of overdue) {
    try {
      await finalizeRental(deps, id, { chargeMax: true });
      summary.overdue++;
    } catch (e) {
      summary.errors.push(`${id}: ${(e as Error).message}`);
    }
  }
  return summary;
}

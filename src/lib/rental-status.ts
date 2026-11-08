import "server-only";
import { createAdminClient } from "./supabase/admin";
import { computeCharge, rentalMinutes, type Pricing } from "./pricing";

/** Customer-safe status for a rental identified by its unguessable public token. */
export async function loadRentalStatus(token: string) {
  if (!/^[a-f0-9]{36}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("rentals")
    .select("id, tenant_id, status, payment_status, refund_status, amount_cents, refunded_cents, authorized_cents, currency, started_at, returned_at, slot_number, is_simulated, pricing_snapshot, stripe_checkout_session_id, stripe_account_id, created_at, machines!rentals_machine_id_tenant_id_fkey(public_code)")
    .eq("public_token", token)
    .maybeSingle();
  if (!r) return null;
  const p = r.pricing_snapshot as unknown as Pricing;
  const live = r.started_at && r.status === "active" ? computeCharge(p, rentalMinutes(r.started_at, new Date())).total : null;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    paymentStatus: r.payment_status,
    refundStatus: r.refund_status,
    amount: r.amount_cents,
    refunded: r.refunded_cents,
    authorized: r.authorized_cents,
    currency: r.currency,
    startedAt: r.started_at,
    returnedAt: r.returned_at,
    slot: r.slot_number,
    isSimulated: r.is_simulated,
    liveCharge: live,
    machineCode: r.machines?.public_code ?? null,
    checkoutSessionId: r.stripe_checkout_session_id,
    stripeAccountId: r.stripe_account_id,
  };
}

export type RentalStatus = NonNullable<Awaited<ReturnType<typeof loadRentalStatus>>>;
export function publicView(s: RentalStatus) {
  const { tenantId: _t, checkoutSessionId: _c, stripeAccountId: _a, ...rest } = s;
  void _t; void _c; void _a;
  return rest;
}

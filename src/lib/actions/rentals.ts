"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { dbErrorCode, errorMessage } from "../utils";
import { parseMoneyToCents } from "../pricing";
import { adminRpc, getEngineDeps } from "../rentals/deps";
import { cancelRental, dispatchUnlock } from "../rentals/engine";
import { rpcOrThrow } from "../rpc";
import type { ActionState } from "../action-result";
import type { Dict } from "../i18n/format";

function fail(t: Dict, e: unknown): ActionState {
  if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
  const code = dbErrorCode(e);
  const known = code && (t.errors as Record<string, string>)[code];
  console.error("[rentals]", errorMessage(e));
  return { ok: false, error: known || t.errors.generic };
}

async function loadRental(tenantId: string, rentalId: string) {
  const ctx = await authorizeTenant(tenantId, "manager");
  const { data: r } = await ctx.supabase.from("rentals").select("id, status, payment_status").eq("id", rentalId).eq("tenant_id", ctx.tenant.id).maybeSingle();
  if (!r) throw new AuthError("NOT_FOUND");
  return { ctx, r };
}

export async function cancelRentalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const { ctx, r } = await loadRental(String(fd.get("tenantId")), String(fd.get("rentalId")));
    if (r.status !== "pending") return { ok: false, error: t.rentals.cancelHint };
    await cancelRental(await getEngineDeps(), r.id, "operator_cancelled");
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "rental.cancelled", entityType: "rental", entityId: r.id });
    revalidatePath(`/o/${ctx.tenant.slug}/rentals/${r.id}`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return fail(t, e);
  }
}

export async function retryUnlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const { ctx, r } = await loadRental(String(fd.get("tenantId")), String(fd.get("rentalId")));
    if (r.status !== "pending" || r.payment_status !== "authorized") return { ok: false, error: t.errors.generic };
    const out = await dispatchUnlock(await getEngineDeps(), r.id);
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "rental.unlock_retry", entityType: "rental", entityId: r.id, metadata: { outcome: out } });
    revalidatePath(`/o/${ctx.tenant.slug}/rentals/${r.id}`);
    return { ok: true, message: out };
  } catch (e) {
    return fail(t, e);
  }
}

const refundSchema = z.object({
  tenantId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amount: z.string(),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function refundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = refundSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  let amount: number;
  try {
    amount = parseMoneyToCents(v.amount);
  } catch {
    return { ok: false, error: t.errors.VALIDATION };
  }
  try {
    const ctx = await authorizeTenant(v.tenantId, "manager");
    const { data: pay } = await ctx.supabase
      .from("payments")
      .select("id, provider, stripe_payment_intent_id, stripe_account_id, amount_captured_cents, amount_refunded_cents, status, created_at, rental_id")
      .eq("id", v.paymentId)
      .eq("tenant_id", ctx.tenant.id)
      .maybeSingle();
    if (!pay) return { ok: false, error: t.common.notFound };
    if (!["succeeded", "partially_refunded"].includes(pay.status)) return { ok: false, error: t.errors.generic };
    const refundable = pay.amount_captured_cents - pay.amount_refunded_cents;
    if (amount <= 0 || amount > refundable) return { ok: false, error: t.errors.VALIDATION };
    const { data: pricing } = await ctx.supabase.from("rental_pricing").select("refund_window_days").eq("tenant_id", ctx.tenant.id).maybeSingle();
    const windowDays = pricing?.refund_window_days ?? 30;
    if (Date.now() - new Date(pay.created_at).getTime() > windowDays * 86_400_000 && ctx.role !== "super_admin" && ctx.role !== "owner") {
      return { ok: false, error: t.rentals.refundWindowExpired };
    }
    let stripeRefundId: string | null = null;
    let status = "succeeded";
    if (pay.provider === "stripe") {
      const deps = await getEngineDeps();
      if (!deps.stripe) return { ok: false, error: t.errors.STRIPE_NOT_CONFIGURED };
      const r = await deps.stripe.refund({
        paymentIntentId: pay.stripe_payment_intent_id!,
        account: pay.stripe_account_id!,
        amount,
        idempotencyKey: `refund-${v.idempotencyKey}`,
        reason: v.reason,
      });
      stripeRefundId = r.refundId;
      status = ["succeeded", "pending", "failed", "canceled", "requires_action"].includes(r.status) ? r.status : "pending";
    }
    await rpcOrThrow(adminRpc(), "refund_apply", {
      p_payment: pay.id,
      p_amount: amount,
      p_status: status,
      p_stripe_refund: stripeRefundId,
      p_reason: v.reason ?? null,
      p_actor: ctx.user.id,
      p_idempotency: v.idempotencyKey,
      p_simulated: pay.provider === "simulated",
    });
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "refund.created", entityType: "payment", entityId: pay.id, metadata: { amount, status, simulated: pay.provider === "simulated" } });
    revalidatePath(`/o/${ctx.tenant.slug}/rentals/${pay.rental_id}`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return fail(t, e);
  }
}

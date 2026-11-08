"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { isStripeConfigured } from "../env";
import { ensureConnectedAccount, onboardingLink, syncAccount } from "../stripe/connect";
import { createAdminClient } from "../supabase/admin";
import { rateLimit } from "../rate-limit";
import type { ActionState } from "../action-result";

export async function connectStripe(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  let url: string;
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    if (!isStripeConfigured()) return { ok: false, error: t.integrations.stripeNotConfigured };
    if (!(await rateLimit("stripe-connect", 10, 600, ctx.tenant.id))) return { ok: false, error: t.errors.RATE_LIMITED };
    const acct = await ensureConnectedAccount(ctx.tenant, ctx.user.email);
    url = await onboardingLink(acct, ctx.tenant.slug);
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "stripe.onboarding_started", entityType: "integration", entityId: acct });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    console.error("[stripe connect]", (e as Error).message);
    return { ok: false, error: `${t.errors.generic} (${(e as Error).message})` };
  }
  redirect(url);
}

export async function refreshStripe(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "manager");
    if (!isStripeConfigured()) return { ok: false, error: t.integrations.stripeNotConfigured };
    const { data } = await ctx.supabase.from("integrations").select("stripe_account_id").eq("tenant_id", ctx.tenant.id).eq("kind", "stripe_connect").maybeSingle();
    if (!data?.stripe_account_id) return { ok: false, error: t.status.not_connected };
    await syncAccount(data.stripe_account_id);
    revalidatePath(`/o/${ctx.tenant.slug}/integrations`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

export async function disconnectStripe(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    const { error } = await createAdminClient()
      .from("integrations")
      .update({ status: "disconnected" })
      .eq("tenant_id", ctx.tenant.id)
      .eq("kind", "stripe_connect");
    if (error) throw error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "stripe.disconnected", entityType: "integration" });
    revalidatePath(`/o/${ctx.tenant.slug}/integrations`);
    return { ok: true, message: t.integrations.disconnectedNote };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { isStripeConfigured } from "../env";
import { billingPortalUrl, changeSubscriptionPrice, setCancelAtPeriodEnd, subscriptionCheckoutUrl } from "../stripe/billing";
import type { ActionState } from "../action-result";

export async function choosePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  let url: string | null = null;
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    if (!isStripeConfigured()) return { ok: false, error: t.subscription.billingNotConfigured };
    const { data: plan } = await ctx.supabase.from("plans").select("*").eq("code", String(fd.get("plan"))).eq("is_active", true).maybeSingle();
    if (!plan?.stripe_price_id) return { ok: false, error: t.subscription.billingNotConfigured };
    const { count } = await ctx.supabase.from("machines").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id).neq("state", "retired");
    if ((count ?? 0) > plan.machine_limit) return { ok: false, error: t.machines.limitReached };
    const { data: sub } = await ctx.supabase.from("subscriptions").select("stripe_subscription_id, status, trial_ends_at").eq("tenant_id", ctx.tenant.id).maybeSingle();
    if (sub?.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(sub.status)) {
      await changeSubscriptionPrice(sub.stripe_subscription_id, plan.stripe_price_id);
      await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "subscription.plan_changed", entityType: "subscription", metadata: { plan: plan.code } });
      revalidatePath(`/o/${ctx.tenant.slug}/subscription`);
      return { ok: true, message: t.subscription.successNote };
    }
    url = await subscriptionCheckoutUrl({
      tenant: ctx.tenant,
      email: ctx.user.email,
      priceId: plan.stripe_price_id,
      planId: plan.id,
      trialEndsAt: sub?.status === "trialing" ? sub.trial_ends_at : null,
    });
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "subscription.checkout_started", entityType: "subscription", metadata: { plan: plan.code } });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    console.error("[billing]", (e as Error).message);
    return { ok: false, error: t.errors.generic };
  }
  redirect(url!);
}

export async function openBillingPortal(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  let url: string;
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    if (!isStripeConfigured()) return { ok: false, error: t.subscription.billingNotConfigured };
    const { data: sub } = await ctx.supabase.from("subscriptions").select("stripe_customer_id").eq("tenant_id", ctx.tenant.id).maybeSingle();
    if (!sub?.stripe_customer_id) return { ok: false, error: t.subscription.billingNotConfigured };
    url = await billingPortalUrl(sub.stripe_customer_id, ctx.tenant.slug);
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
  redirect(url);
}

export async function toggleCancel(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    const { data: sub } = await ctx.supabase.from("subscriptions").select("stripe_subscription_id, cancel_at_period_end").eq("tenant_id", ctx.tenant.id).maybeSingle();
    if (!sub?.stripe_subscription_id) return { ok: false, error: t.errors.generic };
    await setCancelAtPeriodEnd(sub.stripe_subscription_id, !sub.cancel_at_period_end);
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: sub.cancel_at_period_end ? "subscription.resumed" : "subscription.cancel_scheduled", entityType: "subscription" });
    revalidatePath(`/o/${ctx.tenant.slug}/subscription`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeSuperAdmin, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { createAdminClient } from "../supabase/admin";
import { publicEnv, isStripeConfigured } from "../env";
import { parseMoneyToCents } from "../pricing";
import { syncPlanToStripe } from "../stripe/billing";
import type { ActionState } from "../action-result";
import type { Json } from "../supabase/database.types";

function denied(t: { common: { forbidden: string }; errors: { generic: string } }, e: unknown): ActionState {
  if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
  console.error("[admin]", e);
  return { ok: false, error: `${t.errors.generic}${e instanceof Error ? ` (${e.message})` : ""}` };
}

async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/),
  plan: z.string().trim().min(2),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerPassword: z.string().max(128).optional(),
});

export async function createOperator(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getI18n();
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  let tenantId: string;
  try {
    const actor = await authorizeSuperAdmin();
    const admin = createAdminClient();
    let ownerId = await findUserByEmail(v.ownerEmail);
    if (!ownerId) {
      if (v.ownerPassword && v.ownerPassword.length >= 8) {
        const { data, error } = await admin.auth.admin.createUser({
          email: v.ownerEmail,
          password: v.ownerPassword,
          email_confirm: true,
          user_metadata: { locale },
        });
        if (error) throw error;
        ownerId = data.user.id;
      } else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(v.ownerEmail, {
          redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password`,
          data: { locale },
        });
        if (error) throw error;
        ownerId = data.user.id;
      }
    }
    const { data, error } = await admin.rpc("provision_tenant", {
      p_name: v.name, p_slug: v.slug, p_plan_code: v.plan, p_owner: ownerId, p_locale: locale,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: t.onboarding.slugTaken };
      throw error;
    }
    tenantId = data as string;
    await audit({ tenantId, actorId: actor.id, actorEmail: actor.email, action: "admin.tenant_created", entityType: "tenant", entityId: tenantId, metadata: { owner: v.ownerEmail, plan: v.plan } });
  } catch (e) {
    return denied(t, e);
  }
  redirect(`/admin/tenants/${tenantId}`);
}

const tenantOp = z.object({
  tenantId: z.string().uuid(),
  op: z.enum(["suspend", "reactivate", "plan", "extend_trial", "verify_domain", "delete_domain", "set_primary_domain"]),
  reason: z.string().trim().max(500).optional(),
  plan: z.string().optional(),
  domainId: z.string().uuid().optional(),
});

export async function tenantAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = tenantOp.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const actor = await authorizeSuperAdmin();
    const admin = createAdminClient();
    switch (v.op) {
      case "suspend":
        await admin.from("tenants").update({ status: "suspended", suspended_at: new Date().toISOString(), suspended_reason: v.reason ?? null }).eq("id", v.tenantId);
        break;
      case "reactivate":
        await admin.from("tenants").update({ status: "active", suspended_at: null, suspended_reason: null }).eq("id", v.tenantId);
        break;
      case "plan": {
        const { data: plan } = await admin.from("plans").select("id").eq("code", v.plan ?? "").maybeSingle();
        if (!plan) return { ok: false, error: t.errors.VALIDATION };
        await admin.from("tenants").update({ plan_id: plan.id }).eq("id", v.tenantId);
        await admin.from("subscriptions").update({ plan_id: plan.id }).eq("tenant_id", v.tenantId);
        break;
      }
      case "extend_trial": {
        const { data: sub } = await admin.from("subscriptions").select("trial_ends_at, status").eq("tenant_id", v.tenantId).maybeSingle();
        const base = sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date() ? new Date(sub.trial_ends_at) : new Date();
        await admin.from("subscriptions").update({ status: sub?.status === "active" ? "active" : "trialing", trial_ends_at: new Date(base.getTime() + 14 * 86400000).toISOString() }).eq("tenant_id", v.tenantId);
        break;
      }
      case "verify_domain":
        await admin.from("tenant_domains").update({ verified: true, verified_at: new Date().toISOString() }).eq("id", v.domainId!).eq("tenant_id", v.tenantId);
        break;
      case "set_primary_domain":
        await admin.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", v.tenantId);
        await admin.from("tenant_domains").update({ is_primary: true }).eq("id", v.domainId!).eq("tenant_id", v.tenantId);
        break;
      case "delete_domain":
        await admin.from("tenant_domains").delete().eq("id", v.domainId!).eq("tenant_id", v.tenantId);
        break;
    }
    await audit({ tenantId: v.tenantId, actorId: actor.id, actorEmail: actor.email, action: `admin.tenant_${v.op}`, entityType: "tenant", entityId: v.tenantId, metadata: { reason: v.reason, plan: v.plan, domain: v.domainId } });
    revalidatePath(`/admin/tenants/${v.tenantId}`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return denied(t, e);
  }
}

const planSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  price: z.string(),
  currency: z.string().regex(/^[a-z]{3}$/),
  billing_interval: z.enum(["month", "year"]),
  trial_days: z.coerce.number().int().min(0).max(365),
  machine_limit: z.coerce.number().int().min(0).max(100000),
  location_limit: z.string().optional(),
  team_limit: z.string().optional(),
  stripe_price_id: z.string().trim().optional(),
  sort_order: z.coerce.number().int().default(0),
});

const FEATURES = ["basic_dashboard", "basic_reports", "advanced_reports", "advanced_analytics", "team_access", "multiple_locations", "advanced_branding", "priority_support", "custom_domain", "csv_export"];

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = planSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const actor = await authorizeSuperAdmin();
    const features: Record<string, boolean> = {};
    for (const f of FEATURES) features[f] = fd.get(`f_${f}`) === "on";
    const lim = (s?: string) => (s && s.trim() !== "" ? Math.max(0, Number(s)) : null);
    const row = {
      code: v.code,
      name: v.name,
      description: v.description || null,
      price_cents: parseMoneyToCents(v.price),
      currency: v.currency,
      billing_interval: v.billing_interval,
      trial_days: v.trial_days,
      machine_limit: v.machine_limit,
      location_limit: lim(v.location_limit),
      team_limit: lim(v.team_limit) || null,
      stripe_price_id: v.stripe_price_id || null,
      features: features as Json,
      is_active: fd.get("is_active") === "on",
      is_public: fd.get("is_public") === "on",
      sort_order: v.sort_order,
    };
    const admin = createAdminClient();
    let planId = v.id || null;
    if (planId) {
      const { error } = await admin.from("plans").update(row).eq("id", planId);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("plans").insert(row).select("id").single();
      if (error) throw error;
      planId = data.id;
    }
    if (fd.get("sync_stripe") === "on") {
      if (!isStripeConfigured()) return { ok: false, error: t.errors.STRIPE_NOT_CONFIGURED };
      const { data: plan } = await admin.from("plans").select("*").eq("id", planId).single();
      const { productId, priceId } = await syncPlanToStripe(plan!);
      await admin.from("plans").update({ stripe_product_id: productId, stripe_price_id: priceId }).eq("id", planId);
    }
    await audit({ tenantId: null, actorId: actor.id, actorEmail: actor.email, action: v.id ? "admin.plan_updated" : "admin.plan_created", entityType: "plan", entityId: planId, metadata: { code: v.code, price_cents: row.price_cents } });
    revalidatePath("/admin/plans");
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return denied(t, e);
  }
}

export async function savePlatformSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const actor = await authorizeSuperAdmin();
    const fee = Math.max(0, Math.min(2000, Number(fd.get("application_fee_bps") ?? 0) || 0));
    const admin = createAdminClient();
    const { data: cur } = await admin.from("platform_settings").select("value").eq("key", "signups").maybeSingle();
    const prev = (cur?.value ?? {}) as Record<string, unknown>;
    const rows = [
      { key: "payments", value: { application_fee_bps: fee, allow_simulated_payments: fd.get("allow_simulated") === "on" } },
      { key: "signups", value: { ...prev, self_serve_enabled: fd.get("self_serve") === "on", default_plan: String(fd.get("default_plan") ?? "community") } },
      { key: "platform", value: { name: publicEnv.platformName, support_email: String(fd.get("support_email") ?? "") || null, default_locale: "en" } },
    ];
    for (const r of rows) {
      const { error } = await admin.from("platform_settings").upsert({ key: r.key, value: r.value as Json, updated_at: new Date().toISOString(), updated_by: actor.id });
      if (error) throw error;
    }
    await audit({ tenantId: null, actorId: actor.id, actorEmail: actor.email, action: "admin.settings_updated", entityType: "platform_settings", metadata: { application_fee_bps: fee } });
    revalidatePath("/admin/settings");
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return denied(t, e);
  }
}

export async function regenerateAccessCode(_: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  const { t } = await getI18n();
  try {
    const actor = await authorizeSuperAdmin();
    const admin = createAdminClient();
    const { data: cur } = await admin.from("platform_settings").select("value").eq("key", "signups").maybeSingle();
    const prev = (cur?.value ?? {}) as Record<string, unknown>;
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    const { error } = await admin.from("platform_settings").upsert({ key: "signups", value: { ...prev, access_code: code } as Json, updated_at: new Date().toISOString(), updated_by: actor.id });
    if (error) throw error;
    await audit({ tenantId: null, actorId: actor.id, actorEmail: actor.email, action: "admin.access_code_rotated", entityType: "platform_settings" });
    revalidatePath("/admin/settings");
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return denied(t, e);
  }
}

export async function replyTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const actor = await authorizeSuperAdmin();
    const id = z.string().uuid().parse(fd.get("ticketId"));
    const reply = String(fd.get("reply") ?? "").trim().slice(0, 5000);
    const status = fd.get("close") === "on" ? "closed" : "pending";
    const { error } = await createAdminClient().from("support_tickets").update({ admin_reply: reply || null, replied_at: new Date().toISOString(), status }).eq("id", id);
    if (error) throw error;
    await audit({ tenantId: null, actorId: actor.id, actorEmail: actor.email, action: "admin.ticket_replied", entityType: "support_ticket", entityId: id });
    revalidatePath("/admin/support");
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return denied(t, e);
  }
}

export async function retryWebhook(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const actor = await authorizeSuperAdmin();
    const id = z.string().uuid().parse(fd.get("eventId"));
    const admin = createAdminClient();
    const { data: ev } = await admin.from("webhook_events").select("source, payload, status").eq("id", id).maybeSingle();
    if (!ev || ev.status === "processed") return { ok: false, error: t.errors.generic };
    if (ev.source === "hardware") return { ok: false, error: t.errors.generic };
    const { processEvent } = await import("../stripe/webhooks");
    const { adminRpc, getEngineDeps } = await import("../rentals/deps");
    const { getStripe } = await import("../stripe/client");
    const out = await processEvent(ev.source as "stripe_platform" | "stripe_connect", ev.payload as never, { db: adminRpc(), stripe: getStripe(), engine: await getEngineDeps() });
    await audit({ tenantId: null, actorId: actor.id, actorEmail: actor.email, action: "admin.webhook_retried", entityType: "webhook_event", entityId: id, metadata: out });
    revalidatePath("/admin/webhooks");
    return { ok: true, message: out.status };
  } catch (e) {
    return denied(t, e);
  }
}

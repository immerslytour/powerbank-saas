"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError, getSessionUser } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { parseMoneyToCents, pricingSchema } from "../pricing";
import { createClient } from "../supabase/server";
import { rateLimit } from "../rate-limit";
import type { ActionState } from "../action-result";

export async function savePricing(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  let input;
  try {
    const lateAfter = String(fd.get("late_after_hours") ?? "").trim();
    input = {
      currency: String(fd.get("currency") ?? "usd").toLowerCase(),
      initial_fee_cents: parseMoneyToCents(fd.get("initial_fee")),
      free_minutes: Number(fd.get("free_minutes") ?? 0),
      hourly_rate_cents: parseMoneyToCents(fd.get("hourly_rate")),
      daily_rate_cents: parseMoneyToCents(fd.get("daily_rate")),
      max_charge_cents: parseMoneyToCents(fd.get("max_charge")),
      late_fee_cents: parseMoneyToCents(fd.get("late_fee")),
      late_after_hours: lateAfter === "" ? null : Number(lateAfter),
      overdue_after_hours: Number(fd.get("overdue_after_hours") ?? 72),
      refund_window_days: Number(fd.get("refund_window_days") ?? 30),
      refund_policy: String(fd.get("refund_policy") ?? "").trim() || null,
      terms_text: String(fd.get("terms_text") ?? "").trim() || null,
    };
  } catch {
    return { ok: false, error: t.errors.VALIDATION };
  }
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message;
    return { ok: false, error: t.errors.VALIDATION, fieldErrors: fe };
  }
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "manager");
    const { error } = await ctx.supabase.from("rental_pricing").update(parsed.data).eq("tenant_id", ctx.tenant.id);
    if (error) throw error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "pricing.updated", entityType: "pricing", entityId: ctx.tenant.id, metadata: parsed.data });
    revalidatePath(`/o/${ctx.tenant.slug}/settings`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

const businessSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
  locale: z.enum(["en", "es"]),
  country: z.string().trim().length(2),
});

export async function saveBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = businessSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const { tenantId, ...v } = parsed.data;
  try {
    const ctx = await authorizeTenant(tenantId, "owner");
    const { error } = await ctx.supabase.from("tenants").update({ ...v, country: v.country.toUpperCase() }).eq("id", ctx.tenant.id);
    if (error) throw error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "tenant.updated", entityType: "tenant", entityId: ctx.tenant.id });
    revalidatePath(`/o/${ctx.tenant.slug}`, "layout");
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

export async function saveProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return { ok: false, error: t.common.forbidden };
  const name = z.string().trim().min(1).max(120).safeParse(fd.get("full_name"));
  if (!name.success) return { ok: false, error: t.errors.VALIDATION };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: name.data }).eq("id", user.id);
  if (error) return { ok: false, error: t.errors.generic };
  return { ok: true, message: t.common.saved };
}

const ticketSchema = z.object({
  tenantId: z.string().uuid(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10000),
});

export async function createTicket(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = ticketSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  try {
    const ctx = await authorizeTenant(parsed.data.tenantId, "employee");
    if (!(await rateLimit("ticket", 10, 3600, ctx.user.id))) return { ok: false, error: t.errors.RATE_LIMITED };
    const { error } = await ctx.supabase.from("support_tickets").insert({
      tenant_id: ctx.tenant.id,
      created_by: ctx.user.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      priority: ctx.features.priority_support ? "high" : "normal",
    });
    if (error) throw error;
    revalidatePath(`/o/${ctx.tenant.slug}/settings`);
    return { ok: true, message: t.settings.supportSent };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

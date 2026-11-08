"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { dbErrorCode } from "../utils";
import { parseMoneyToCents } from "../pricing";
import type { ActionState } from "../action-result";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const schema = z.object({
  tenantId: z.string().uuid(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1).max(120),
  address_line1: opt(200),
  address_line2: opt(200),
  city: opt(100),
  region: opt(100),
  postal_code: opt(20),
  country: opt(2),
  contact_name: opt(120),
  contact_email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
  contact_phone: opt(40),
  notes: opt(4000),
  commission_type: z.enum(["none", "percent", "flat_monthly"]),
  commission_value: z.string().optional(),
  is_active: z.string().optional(),
});

export async function saveLocation(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const { tenantId, locationId, commission_value, is_active, ...v } = parsed.data;
  let commission = 0;
  try {
    if (v.commission_type === "percent") {
      const pct = Number(String(commission_value ?? "0").replace(",", "."));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, error: t.errors.VALIDATION };
      commission = Math.round(pct * 100); // basis points
    } else if (v.commission_type === "flat_monthly") {
      commission = parseMoneyToCents(commission_value ?? "0");
    }
  } catch {
    return { ok: false, error: t.errors.VALIDATION };
  }
  try {
    const ctx = await authorizeTenant(tenantId, "manager");
    const row = { ...v, country: v.country?.toUpperCase() ?? "US", commission_value: commission, is_active: is_active !== "false" };
    let id = locationId || null;
    if (id) {
      const { error, count } = await ctx.supabase.from("locations").update(row, { count: "exact" }).eq("id", id).eq("tenant_id", ctx.tenant.id);
      if (error) throw error;
      if (!count) return { ok: false, error: t.common.notFound };
    } else {
      const { data, error } = await ctx.supabase.from("locations").insert({ ...row, tenant_id: ctx.tenant.id }).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: locationId ? "location.updated" : "location.created", entityType: "location", entityId: id });
    revalidatePath(`/o/${ctx.tenant.slug}/locations`);
    return { ok: true, message: t.common.saved, data: { id } };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    const code = dbErrorCode(e);
    return { ok: false, error: (code && (t.errors as Record<string, string>)[code]) || t.errors.generic };
  }
}

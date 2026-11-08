"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { createAdminClient } from "../supabase/admin";
import { isValidDomain } from "../domains";
import { publicEnv } from "../env";
import type { ActionState } from "../action-result";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const schema = z.object({
  tenantId: z.string().uuid(),
  display_name: z.string().trim().min(1).max(120),
  primary_color: hex,
  secondary_color: hex,
  accent_color: hex,
  support_email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
  support_phone: opt(40),
  website: z.string().trim().url().optional().or(z.literal("")).transform((v) => v || null),
  checkout_headline: opt(120),
  portal_message: opt(500),
  return_instructions: opt(1000),
});

const MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export async function saveBranding(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const { tenantId, ...v } = parsed.data;
  try {
    const ctx = await authorizeTenant(tenantId, "manager");
    const update: typeof v & { logo_path?: string | null } = { ...v };
    const file = fd.get("logo");
    if (file instanceof File && file.size > 0) {
      const ext = MIME[file.type];
      if (!ext || file.size > 2 * 1024 * 1024) return { ok: false, error: t.branding.logoHint };
      if (ext === "svg") {
        const text = await file.text();
        if (/<script|on\w+\s*=|javascript:/i.test(text)) return { ok: false, error: t.branding.logoHint };
      }
      const path = `${ctx.tenant.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await ctx.supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      update.logo_path = path;
    }
    if (fd.get("removeLogo") === "1") update.logo_path = null;
    const { error } = await ctx.supabase.from("brands").update(update).eq("tenant_id", ctx.tenant.id);
    if (error) throw error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "branding.updated", entityType: "brand", entityId: ctx.tenant.id });
    revalidatePath(`/o/${ctx.tenant.slug}/branding`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    console.error("[branding]", e);
    return { ok: false, error: t.errors.generic };
  }
}

export async function requestDomain(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "owner");
    const kind = String(fd.get("kind")) === "subdomain" ? "subdomain" : "custom";
    if (kind === "custom" && !ctx.features.custom_domain && ctx.role !== "super_admin") return { ok: false, error: t.branding.advancedLocked };
    let domain: string;
    let verified = false;
    if (kind === "subdomain") {
      if (!publicEnv.rootDomain) return { ok: false, error: t.errors.generic };
      domain = `${ctx.tenant.slug}.${publicEnv.rootDomain}`;
      verified = true; // the platform controls the wildcard DNS for its own root domain
    } else {
      domain = String(fd.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!isValidDomain(domain) || (publicEnv.rootDomain && domain.endsWith(publicEnv.rootDomain))) return { ok: false, error: t.errors.VALIDATION };
    }
    const admin = createAdminClient();
    const { count } = await admin.from("tenant_domains").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id);
    const { error } = await admin.from("tenant_domains").insert({
      tenant_id: ctx.tenant.id, domain, kind, verified, verified_at: verified ? new Date().toISOString() : null, is_primary: (count ?? 0) === 0,
    });
    if (error) return { ok: false, error: error.code === "23505" ? t.onboarding.slugTaken : t.errors.generic };
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "domain.requested", entityType: "domain", metadata: { domain, kind } });
    revalidatePath(`/o/${ctx.tenant.slug}/branding`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
    return { ok: false, error: t.errors.generic };
  }
}

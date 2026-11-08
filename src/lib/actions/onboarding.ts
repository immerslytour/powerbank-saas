"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../supabase/server";
import { getI18n } from "../i18n";
import { getSessionUser } from "../auth";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import type { ActionState } from "../action-result";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/),
  accessCode: z.string().trim().min(4).max(40),
});

export async function createBusiness(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/onboarding");
  const parsed = schema.safeParse({ name: formData.get("name"), slug: formData.get("slug"), accessCode: formData.get("accessCode") });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.path[0] === "slug" ? t.onboarding.slugHint : i.path[0] === "accessCode" ? t.errors.INVALID_ACCESS_CODE : t.errors.VALIDATION;
    return { ok: false, error: t.errors.VALIDATION, fieldErrors: fe };
  }
  if (!(await rateLimit("create-tenant", 10, 3600, user.id))) return { ok: false, error: t.errors.RATE_LIMITED };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_my_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_access_code: parsed.data.accessCode,
  });
  if (error) {
    if (error.message.includes("tenants_slug_key") || error.code === "23505") {
      return { ok: false, error: t.onboarding.slugTaken, fieldErrors: { slug: t.onboarding.slugTaken } };
    }
    if (error.message.includes("INVALID_ACCESS_CODE")) return { ok: false, error: t.errors.INVALID_ACCESS_CODE, fieldErrors: { accessCode: t.errors.INVALID_ACCESS_CODE } };
    if (error.message.includes("SIGNUPS_CLOSED")) return { ok: false, error: t.errors.SIGNUPS_CLOSED };
    return { ok: false, error: error.message.includes("TENANT_LIMIT") ? error.message : t.errors.generic };
  }
  await audit({ tenantId: data as string, actorId: user.id, actorEmail: user.email, action: "tenant.self_signup", entityType: "tenant", entityId: data as string });
  redirect(`/o/${parsed.data.slug}`);
}

export async function acceptInvite(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  const token = String(formData.get("token") ?? "");
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const m = error.message;
    const msg = m.includes("INVITE_USED") ? t.invite.used : m.includes("INVITE_EXPIRED") ? t.invite.expired
      : m.includes("INVITE_EMAIL_MISMATCH") ? t.invite.mismatch : t.invite.invalid;
    return { ok: false, error: msg };
  }
  const { data: tenant } = await supabase.from("tenants").select("slug").eq("id", data as string).maybeSingle();
  redirect(tenant ? `/o/${tenant.slug}` : "/app");
}

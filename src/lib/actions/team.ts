"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeTenant, AuthError, ROLE_RANK, type Role } from "../auth";
import { getI18n } from "../i18n";
import { audit } from "../audit";
import { newToken, sha256Hex } from "../crypto";
import { publicEnv, isServiceRoleConfigured } from "../env";
import { createAdminClient } from "../supabase/admin";
import { rateLimit } from "../rate-limit";
import { dbErrorCode } from "../utils";
import type { ActionState } from "../action-result";
import type { Dict } from "../i18n/format";

function fail(t: Dict, e: unknown): ActionState {
  if (e instanceof AuthError) return { ok: false, error: t.common.forbidden };
  const code = dbErrorCode(e);
  return { ok: false, error: (code && (t.errors as Record<string, string>)[code]) || t.errors.generic };
}

const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["owner", "manager", "employee"]),
});

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getI18n();
  const parsed = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const ctx = await authorizeTenant(v.tenantId, "manager");
    if (ROLE_RANK[v.role] > ctx.rank) return { ok: false, error: t.errors.FORBIDDEN_ROLE };
    if (!(await rateLimit("invite", 20, 3600, ctx.user.id))) return { ok: false, error: t.errors.RATE_LIMITED };
    const isAdmin = ctx.role === "super_admin";
    if (!isAdmin && !ctx.features.team_access && v.role !== "owner") return { ok: false, error: t.team.teamLocked };
    const [{ count: members }, { count: pending }] = await Promise.all([
      ctx.supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id).eq("status", "active"),
      ctx.supabase.from("invitations").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    ]);
    const limit = ctx.plan?.team_limit;
    if (!isAdmin && limit != null && (members ?? 0) + (pending ?? 0) >= limit) return { ok: false, error: t.team.limitReached };

    const token = newToken();
    const { error } = await ctx.supabase.from("invitations").insert({
      tenant_id: ctx.tenant.id,
      email: v.email,
      role: v.role,
      token_hash: sha256Hex(token),
      invited_by: ctx.user.id,
    });
    if (error) throw error;
    const link = `${publicEnv.appUrl}/invite/${token}`;
    if (isServiceRoleConfigured()) {
      // Supabase sends the invite email for new users; existing users use the link.
      const { error: mailErr } = await createAdminClient().auth.admin.inviteUserByEmail(v.email, {
        redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`,
        data: { locale, invited_to: ctx.tenant.name },
      });
      if (mailErr) console.info("[invite] email not sent (likely existing user):", mailErr.message);
    }
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "invitation.created", entityType: "invitation", metadata: { email: v.email, role: v.role } });
    revalidatePath(`/o/${ctx.tenant.slug}/team`);
    return { ok: true, message: t.team.inviteSent, data: { link } };
  } catch (e) {
    return fail(t, e);
  }
}

export async function revokeInvitation(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  try {
    const ctx = await authorizeTenant(String(fd.get("tenantId")), "manager");
    const { error } = await ctx.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", String(fd.get("invitationId"))).eq("tenant_id", ctx.tenant.id);
    if (error) throw error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: "invitation.revoked", entityType: "invitation", entityId: String(fd.get("invitationId")) });
    revalidatePath(`/o/${ctx.tenant.slug}/team`);
    return { ok: true };
  } catch (e) {
    return fail(t, e);
  }
}

const memberSchema = z.object({
  tenantId: z.string().uuid(),
  membershipId: z.string().uuid(),
  op: z.enum(["role", "disable", "enable", "remove"]),
  role: z.enum(["owner", "manager", "employee"]).optional(),
});

export async function updateMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = memberSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: t.errors.VALIDATION };
  const v = parsed.data;
  try {
    const ctx = await authorizeTenant(v.tenantId, "owner");
    const q = ctx.supabase.from("memberships");
    let res;
    if (v.op === "remove") res = await q.delete({ count: "exact" }).eq("id", v.membershipId).eq("tenant_id", ctx.tenant.id);
    else if (v.op === "role") res = await q.update({ role: v.role as Role }, { count: "exact" }).eq("id", v.membershipId).eq("tenant_id", ctx.tenant.id);
    else res = await q.update({ status: v.op === "disable" ? "disabled" : "active" }, { count: "exact" }).eq("id", v.membershipId).eq("tenant_id", ctx.tenant.id);
    if (res.error) throw res.error;
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, actorEmail: ctx.user.email, action: `member.${v.op}`, entityType: "membership", entityId: v.membershipId, metadata: { role: v.role } });
    revalidatePath(`/o/${ctx.tenant.slug}/team`);
    return { ok: true, message: t.common.saved };
  } catch (e) {
    return fail(t, e);
  }
}

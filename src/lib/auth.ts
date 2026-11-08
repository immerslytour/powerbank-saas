import "server-only";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Database } from "./supabase/database.types";

export type Role = "owner" | "manager" | "employee";
export const ROLE_RANK: Record<Role | "super_admin", number> = { employee: 1, manager: 2, owner: 3, super_admin: 100 };

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type PlanFeatures = Partial<Record<
  | "basic_dashboard" | "basic_reports" | "advanced_reports" | "advanced_analytics" | "team_access"
  | "multiple_locations" | "advanced_branding" | "priority_support" | "custom_domain" | "csv_export",
  boolean
>>;

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND", message?: string) {
    super(message ?? code);
  }
}

/** Verified current user (JWT validated by Supabase), or null. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, locale, is_super_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? profile?.email ?? "",
    fullName: profile?.full_name ?? null,
    isSuperAdmin: !!profile?.is_super_admin,
    locale: (profile?.locale ?? "en") as "en" | "es",
  };
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!user.isSuperAdmin) notFound();
  return user;
}

export type TenantContext = {
  user: SessionUser;
  tenant: Tenant;
  plan: Plan | null;
  features: PlanFeatures;
  role: Role | "super_admin";
  rank: number;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function loadTenant(by: { slug?: string; id?: string }, user: SessionUser): Promise<TenantContext | null> {
  const supabase = await createClient();
  let q = supabase.from("tenants").select("*, plans(*)");
  q = by.slug ? q.eq("slug", by.slug) : q.eq("id", by.id!);
  const { data: tenant } = await q.maybeSingle();
  if (!tenant) return null; // RLS: not a member (or doesn't exist)
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, status")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  let role: Role | "super_admin" | null = membership?.status === "active" ? (membership.role as Role) : null;
  if (!role && user.isSuperAdmin) role = "super_admin";
  if (!role) return null;
  const { plans, ...t } = tenant as Tenant & { plans: Plan | null };
  return {
    user,
    tenant: t,
    plan: plans,
    features: (plans?.features ?? {}) as PlanFeatures,
    role,
    rank: ROLE_RANK[role],
    supabase,
  };
}

/** For pages: resolve tenant by slug and enforce minimum role (404 if not a member). */
export async function requireTenant(slug: string, minRole: Role = "employee"): Promise<TenantContext> {
  const user = await requireUser(`/o/${slug}`);
  const ctx = await loadTenant({ slug }, user);
  if (!ctx) notFound();
  if (ctx.rank < ROLE_RANK[minRole]) redirect(`/o/${slug}?forbidden=1`);
  return ctx;
}

/** For server actions / route handlers: throws AuthError instead of redirecting. */
export async function authorizeTenant(tenantId: string, minRole: Role = "employee"): Promise<TenantContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  const ctx = await loadTenant({ id: tenantId }, user);
  if (!ctx) throw new AuthError("NOT_FOUND");
  if (ctx.rank < ROLE_RANK[minRole]) throw new AuthError("FORBIDDEN");
  return ctx;
}

export async function authorizeSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (!user.isSuperAdmin) throw new AuthError("FORBIDDEN");
  return user;
}

export function canWrite(ctx: TenantContext, minRole: Role) {
  return ctx.rank >= ROLE_RANK[minRole] && (ctx.tenant.status === "active" || ctx.role === "super_admin");
}

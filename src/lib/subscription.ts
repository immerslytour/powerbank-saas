import type { Database } from "./supabase/database.types";

type Sub = Pick<Database["public"]["Tables"]["subscriptions"]["Row"], "status" | "trial_ends_at">;

/** Mirrors SQL tenant_subscription_ok() for UI messaging (enforcement happens in SQL). */
export function subscriptionOk(sub: Sub | null | undefined, tenantStatus: string) {
  if (!sub || tenantStatus !== "active") return false;
  if (sub.status === "active" || sub.status === "past_due") return true;
  if (sub.status === "trialing") return !sub.trial_ends_at || new Date(sub.trial_ends_at) > new Date();
  return false;
}

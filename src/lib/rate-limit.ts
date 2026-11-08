import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { isServiceRoleConfigured } from "./env";

/** Fixed-window rate limit backed by Postgres (works across serverless instances). */
export async function rateLimit(scope: string, max: number, windowSeconds: number, key?: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return true;
  let id = key;
  if (!id) {
    const h = await headers();
    id = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  }
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_bucket: `${scope}:${id}`,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit]", error.message);
    return true; // fail open on infrastructure errors, never on auth
  }
  return data === true;
}

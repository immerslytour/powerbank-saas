import "server-only";
import { createAdminClient } from "../supabase/admin";
import { getProvider } from "../hardware/registry";
import { getStripe } from "../stripe/client";
import { createStripeOps } from "../stripe/ops";
import { isStripeConfigured } from "../env";
import type { RpcClient } from "../rpc";
import type { EngineDeps } from "./engine";

/** Service-role RPC client (bypasses RLS; only engine/system functions are callable). */
export function adminRpc(): RpcClient {
  const admin = createAdminClient();
  return {
    rpc: (fn, args) =>
      (admin.rpc as unknown as (f: string, a?: Record<string, unknown>) => PromiseLike<{
        data: unknown;
        error: { message: string; code?: string } | null;
      }>)(fn, args),
  };
}

export async function getPlatformSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function getEngineDeps(): Promise<EngineDeps> {
  const db = adminRpc();
  const payments = await getPlatformSetting<{ application_fee_bps?: number }>("payments");
  return {
    db,
    provider: (id) => getProvider(id, db),
    stripe: isStripeConfigured() ? createStripeOps(getStripe()) : null,
    applicationFeeBps: Math.max(0, Math.min(2000, Number(payments?.application_fee_bps ?? 0))),
    log: (level, msg, meta) => console[level === "info" ? "log" : level](`[rental-engine] ${msg}`, meta ?? {}),
  };
}

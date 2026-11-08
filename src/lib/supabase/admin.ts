import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicEnv, serverEnv } from "../env";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client. BYPASSES RLS — use only on the server after explicit
 * authorization checks, or for system flows (webhooks, customer rental flow, cron).
 * The key is never exposed to the browser (no NEXT_PUBLIC_ prefix, `server-only`).
 */
export function createAdminClient() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  if (!cached) {
    cached = createClient<Database>(publicEnv.supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { isServiceRoleConfigured } from "./env";
import type { Json } from "./supabase/database.types";

export async function audit(entry: {
  tenantId: string | null;
  actorId: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isServiceRoleConfigured()) {
    console.warn("[audit] service role not configured; skipping", entry.action);
    return;
  }
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  } catch {
    ip = null;
  }
  const { error } = await createAdminClient()
    .from("audit_logs")
    .insert({
      tenant_id: entry.tenantId,
      actor_id: entry.actorId,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: (entry.metadata ?? {}) as Json,
      ip,
    });
  if (error) console.error("[audit] failed", entry.action, error.message);
}

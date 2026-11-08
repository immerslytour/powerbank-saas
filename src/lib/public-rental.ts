import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "./supabase/admin";
import { normalizeHost } from "./domains";

export type PublicMachineInfo = {
  machine: { id: string; code: string; name: string; available_batteries: number; total_slots: number; connection_status: string; state: string; is_simulated: boolean; provider: string };
  location: { name: string; address: string } | null;
  tenant: { id: string; name: string; slug: string; status: string; subscription_ok: boolean };
  brand: {
    display_name: string; logo_path: string | null; primary_color: string; secondary_color: string; accent_color: string;
    support_email: string | null; support_phone: string | null; website: string | null; checkout_headline: string | null;
    portal_message: string | null; return_instructions: string | null;
  };
  pricing: {
    currency: string; initial_fee_cents: number; free_minutes: number; hourly_rate_cents: number; daily_rate_cents: number;
    max_charge_cents: number; late_fee_cents: number; late_after_hours: number | null; overdue_after_hours: number;
    refund_policy: string | null; terms_text: string | null;
  };
  stripe: { account_id: string | null; charges_enabled: boolean; status: string | null };
};

/** Resolve the operator for a customer-facing custom domain / subdomain (verified only). */
export async function tenantForRequestHost(): Promise<{ host: string; tenantId: string | null } | null> {
  const h = await headers();
  const host = h.get("x-tenant-host");
  if (!host) return null;
  const { data } = await createAdminClient().from("tenant_domains").select("tenant_id").eq("domain", normalizeHost(host)).eq("verified", true).maybeSingle();
  return { host, tenantId: data?.tenant_id ?? null };
}

/** Machine info for the QR page. Enforces that a tenant domain only serves its own machines. */
export async function loadPublicMachine(code: string): Promise<PublicMachineInfo | null> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const { data } = await createAdminClient().rpc("public_machine_info", { p_code: code });
  const info = data as PublicMachineInfo | null;
  if (!info) return null;
  const hostTenant = await tenantForRequestHost();
  if (hostTenant && hostTenant.tenantId !== info.tenant.id) return null;
  return info;
}

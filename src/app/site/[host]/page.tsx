import { notFound } from "next/navigation";
import { MapPin, QrCode } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { publicEnv, isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHost } from "@/lib/domains";
import { CustomerShell } from "@/components/customer/shell";

export const dynamic = "force-dynamic";

/** Operator's branded home on their subdomain / custom domain (verified domains only). */
export default async function TenantSite(props: PageProps<"/site/[host]">) {
  const { host } = await props.params;
  if (!isServiceRoleConfigured()) notFound();
  const admin = createAdminClient();
  const { data: dom } = await admin.from("tenant_domains").select("tenant_id").eq("domain", normalizeHost(decodeURIComponent(host))).eq("verified", true).maybeSingle();
  if (!dom) notFound();
  const [{ data: brand }, { data: tenant }, { data: locations }] = await Promise.all([
    admin.from("brands").select("*").eq("tenant_id", dom.tenant_id).single(),
    admin.from("tenants").select("status").eq("id", dom.tenant_id).single(),
    admin.from("locations").select("id, name, address_line1, city, region").eq("tenant_id", dom.tenant_id).eq("is_active", true).order("name"),
  ]);
  if (!brand || tenant?.status !== "active") notFound();
  const { t, locale } = await getI18n();
  return (
    <CustomerShell brand={brand} t={t} locale={locale} platformName={publicEnv.platformName}>
      <section className="-mx-4 px-5 pb-10 pt-8 text-white" style={{ background: brand.primary_color }}>
        <h1 className="text-3xl font-semibold tracking-tight">{brand.checkout_headline || t.customer.rentTitle}</h1>
        {brand.portal_message && <p className="mt-2 opacity-85">{brand.portal_message}</p>}
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm"><QrCode className="size-8 shrink-0" />{t.machines.qrHint}</div>
      </section>
      <ul className="-mt-4 space-y-2">
        {(locations ?? []).map((l) => (
          <li key={l.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <MapPin className="mt-0.5 size-4" style={{ color: brand.accent_color }} />
            <div><div className="font-medium">{l.name}</div><div className="text-sm text-muted">{[l.address_line1, l.city, l.region].filter(Boolean).join(", ")}</div></div>
          </li>
        ))}
      </ul>
    </CustomerShell>
  );
}

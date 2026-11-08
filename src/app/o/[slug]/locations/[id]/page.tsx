import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { rangeBounds } from "@/lib/ranges";
import { PageHeader, Stat, KeyValue } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { EditLocationForm } from "@/components/locations/location-form";

export default async function LocationDetail(props: PageProps<"/o/[slug]/locations/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const { data: loc } = await ctx.supabase.from("locations").select("*").eq("id", id).eq("tenant_id", ctx.tenant.id).maybeSingle();
  if (!loc) notFound();
  const { from, to } = rangeBounds("30");
  const [{ data: perf }, { data: machines }, { data: pricing }] = await Promise.all([
    ctx.supabase.rpc("analytics_machine_performance", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: "all" }),
    ctx.supabase.from("machines").select("id, name, device_id, connection_status, available_batteries, total_slots, is_simulated").eq("location_id", id),
    ctx.supabase.from("rental_pricing").select("currency").eq("tenant_id", ctx.tenant.id).maybeSingle(),
  ]);
  const currency = pricing?.currency ?? "usd";
  const ids = new Set((machines ?? []).map((m) => m.id));
  const mp = (perf ?? []).filter((p) => ids.has(p.machine_id));
  const revenue = mp.reduce((a, p) => a + Number(p.revenue_cents), 0);
  const rentals = mp.reduce((a, p) => a + Number(p.rentals), 0);
  const commission =
    loc.commission_type === "percent" ? Math.round((revenue * loc.commission_value) / 10000) : loc.commission_type === "flat_monthly" ? loc.commission_value : 0;
  return (
    <>
      <Link href={`/o/${slug}/locations`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t.locations.title}</Link>
      <PageHeader title={loc.name} subtitle={[loc.address_line1, loc.city, loc.region].filter(Boolean).join(", ")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${t.locations.revenue} · ${t.common.last30}`} value={formatMoney(revenue, currency, locale)} />
        <Stat label={t.locations.rentals} value={rentals} />
        <Stat label={t.locations.machines} value={(machines ?? []).length} />
        <Stat label={t.locations.commissionDue} value={formatMoney(commission, currency, locale)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.analytics.machinePerformance}</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>{t.rentals.machine}</TH><TH>{t.machines.connection}</TH><TH className="text-right">{t.locations.rentals}</TH><TH className="text-right">{t.locations.revenue}</TH><TH className="text-right">{t.analytics.utilization}</TH></tr></THead>
            <tbody>
              {(machines ?? []).map((m) => {
                const p = mp.find((x) => x.machine_id === m.id);
                return (
                  <TR key={m.id}>
                    <TD><Link href={`/o/${slug}/machines/${m.id}`} className="font-medium hover:text-electric">{m.name ?? m.device_id}</Link> {m.is_simulated && <SimBadge t={t} />}</TD>
                    <TD><StatusBadge status={m.connection_status} t={t} /></TD>
                    <TD className="tabular text-right">{Number(p?.rentals ?? 0)}</TD>
                    <TD className="tabular text-right">{formatMoney(Number(p?.revenue_cents ?? 0), currency, locale)}</TD>
                    <TD className="tabular text-right">{Number(p?.utilization_pct ?? 0).toFixed(1)}%</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <CardContent>
            <KeyValue items={[
              [t.locations.contactName, loc.contact_name ?? "—"],
              [t.locations.contactEmail, loc.contact_email ?? "—"],
              [t.locations.contactPhone, loc.contact_phone ?? "—"],
              [t.common.notes, loc.notes ?? "—"],
            ]} />
          </CardContent>
        </Card>
        {ctx.rank >= ROLE_RANK.manager && (
          <Card>
            <CardHeader><CardTitle>{t.common.edit}</CardTitle></CardHeader>
            <CardContent><EditLocationForm t={t} tenantId={ctx.tenant.id} loc={loc} /></CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

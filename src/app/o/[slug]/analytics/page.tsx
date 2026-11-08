import Link from "next/link";
import { Download } from "lucide-react";
import { requireTenant } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDuration, formatMoney, cn } from "@/lib/utils";
import { parseData, parseRange, rangeBounds } from "@/lib/ranges";
import { PageHeader, Stat, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SimBadge } from "@/components/ui/status-badge";
import { RevenueAreaChart, SimpleBarChart } from "@/components/ui/charts";
import { RangeFilters } from "@/components/dashboard/filters";
import { LockedCard } from "@/components/dashboard/locked";

const BUCKETS = ["day", "week", "month"] as const;

export default async function AnalyticsPage(props: PageProps<"/o/[slug]/analytics">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug, "manager");
  const { t, locale } = await getI18n();
  const range = parseRange(sp.range ?? "90");
  const data = parseData(sp.data);
  const bucket = BUCKETS.includes(sp.bucket as (typeof BUCKETS)[number]) ? (sp.bucket as (typeof BUCKETS)[number]) : "day";
  const { from, to } = rangeBounds(range);
  const tz = ctx.tenant.timezone;
  const base = `/o/${slug}/analytics`;
  const advReports = !!ctx.features.advanced_reports || ctx.role === "super_admin";
  const advAnalytics = !!ctx.features.advanced_analytics || ctx.role === "super_admin";
  const s = ctx.supabase;
  const [sum, series, locs, machines] = await Promise.all([
    s.rpc("analytics_summary", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }),
    s.rpc("analytics_revenue_series", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_bucket: bucket, p_tz: tz, p_data: data }),
    advReports ? s.rpc("analytics_location_performance", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }) : Promise.resolve({ data: [] }),
    advReports ? s.rpc("analytics_machine_performance", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }) : Promise.resolve({ data: [] }),
  ]);
  const m = (sum.data ?? {}) as Record<string, number | null | boolean | string>;
  const cur = String(m.currency ?? "usd");
  const fmtLabel = (d: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", bucket === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d));
  const chart = (series.data ?? []).map((p) => ({ label: fmtLabel(p.bucket_start), value: Number(p.revenue_cents) }));
  const exp = (r: string, extra = "") => `/api/export/${ctx.tenant.id}/${r}?range=${range}&data=${data}${extra}`;
  const upgrade = `/o/${slug}/subscription`;
  const machinesData = (machines.data ?? []) as Array<{ machine_id: string; machine_name: string; device_id: string; location_name: string | null; is_simulated: boolean; rentals: number; revenue_cents: number; rental_minutes: number; utilization_pct: number; offline_minutes: number }>;

  return (
    <>
      <PageHeader title={t.analytics.title} subtitle={t.analytics.subtitle} actions={<RangeFilters t={t} base={base} range={range} data={data} extra={{ bucket }} />} />
      {m.has_simulated && data !== "real" && <Alert tone="warning" className="mb-4">{t.common.simulatedData}</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.analytics.revenue} value={formatMoney(Number(m.revenue_cents ?? 0), cur, locale)} hint={`${t.analytics.gross} ${formatMoney(Number(m.gross_cents ?? 0), cur, locale)}`} />
        <Stat label={t.analytics.rentals} value={Number(m.rentals ?? 0)} hint={`${Number(m.completed ?? 0)} ${t.status.returned.toLowerCase()}`} />
        <Stat label={t.analytics.avgRevenue} value={formatMoney(Number(m.avg_revenue_cents ?? 0), cur, locale)} />
        <Stat label={t.analytics.returnRate} value={m.return_rate == null ? "—" : `${m.return_rate}%`} tone={m.return_rate != null && Number(m.return_rate) < 90 ? "bad" : "default"} />
        <Stat label={t.analytics.failed} value={Number(m.failed ?? 0)} tone={Number(m.failed ?? 0) > 0 ? "bad" : "default"} />
        <Stat label={t.analytics.refunds} value={formatMoney(Number(m.refunds_cents ?? 0), cur, locale)} hint={`${Number(m.refund_count ?? 0)}`} />
        <Stat label={t.status.overdue} value={Number(m.overdue ?? 0)} />
        <Stat label={t.overview.activeRentals} value={Number(m.active_now ?? 0)} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t.overview.revenueOverTime}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
              {BUCKETS.map((b) => (
                <Link key={b} scroll={false} href={`${base}?range=${range}&data=${data}&bucket=${b}`} className={cn("rounded-md px-2.5 py-1 font-medium", bucket === b ? "bg-navy-900 text-white" : "text-muted")}>
                  {b === "day" ? t.analytics.daily : b === "week" ? t.analytics.weekly : t.analytics.monthly}
                </Link>
              ))}
            </div>
            <Button asChild size="sm" variant="ghost"><a href={exp("revenue", `&bucket=${bucket}`)}><Download /></a></Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2"><RevenueAreaChart data={chart} currency={cur} locale={locale} height={280} /></CardContent>
      </Card>

      {advReports ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{t.analytics.revenuePerLocation}</CardTitle><Button asChild size="sm" variant="ghost"><a href={exp("locations")}><Download /></a></Button></CardHeader>
            <CardContent className="pt-2"><SimpleBarChart data={(locs.data ?? []).slice(0, 10).map((l) => ({ label: l.location_name.slice(0, 12), value: Number(l.revenue_cents) }))} currency={cur} locale={locale} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.analytics.revenuePerMachine}</CardTitle><Button asChild size="sm" variant="ghost"><a href={exp("machines")}><Download /></a></Button></CardHeader>
            <CardContent className="pt-2"><SimpleBarChart data={machinesData.slice(0, 10).map((x) => ({ label: x.machine_name.slice(0, 12), value: Number(x.revenue_cents) }))} currency={cur} locale={locale} /></CardContent>
          </Card>
        </div>
      ) : (
        <div className="mt-4"><LockedCard message={t.analytics.reportsLocked} href={upgrade} cta={t.subscription.choose} /></div>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>{t.analytics.machinePerformance}</CardTitle></CardHeader>
        {advAnalytics ? (
          <Table>
            <THead><tr><TH>{t.rentals.machine}</TH><TH>{t.machines.location}</TH><TH className="text-right">{t.analytics.rentals}</TH><TH className="text-right">{t.analytics.revenue}</TH><TH className="text-right">{t.analytics.utilization}</TH><TH className="text-right">{t.analytics.offlineTime}</TH></tr></THead>
            <tbody>
              {machinesData.map((x) => (
                <TR key={x.machine_id}>
                  <TD><Link href={`/o/${slug}/machines/${x.machine_id}`} className="font-medium hover:text-electric">{x.machine_name}</Link> {x.is_simulated && <SimBadge t={t} />}</TD>
                  <TD className="text-muted">{x.location_name ?? "—"}</TD>
                  <TD className="tabular text-right">{Number(x.rentals)}</TD>
                  <TD className="tabular text-right">{formatMoney(Number(x.revenue_cents), cur, locale)}</TD>
                  <TD className="tabular text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-canvas"><div className="h-1.5 rounded-full bg-electric" style={{ width: `${Math.min(100, Number(x.utilization_pct))}%` }} /></div>
                      {Number(x.utilization_pct).toFixed(1)}%
                    </div>
                  </TD>
                  <TD className={cn("tabular text-right", Number(x.offline_minutes) > 0 && "text-danger")}>{formatDuration(Number(x.offline_minutes), locale)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><LockedCard message={t.analytics.advancedLocked} href={upgrade} cta={t.subscription.choose} /></div>
        )}
      </Card>
    </>
  );
}

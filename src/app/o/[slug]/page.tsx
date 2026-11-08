import Link from "next/link";
import { Activity, AlertTriangle, BatteryCharging, CheckCircle2, MapPin, Palette, Plug, Plus, Receipt, Wifi, WifiOff, Wallet } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { rangeBounds, parseData, parseRange } from "@/lib/ranges";
import { PageHeader, Stat, EmptyState, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimBadge } from "@/components/ui/status-badge";
import { RevenueAreaChart } from "@/components/ui/charts";
import { RangeFilters } from "@/components/dashboard/filters";

export default async function OverviewPage(props: PageProps<"/o/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const range = parseRange(sp.range);
  const data = parseData(sp.data);
  const { from, to } = rangeBounds(range);
  const tz = ctx.tenant.timezone;
  const base = `/o/${slug}`;
  const s = ctx.supabase;
  const isMgr = ctx.rank >= ROLE_RANK.manager;

  const [summaryRes, seriesRes, machinesRes, locationsRes, eventsRes, alertsRes, stripeRes] = await Promise.all([
    s.rpc("analytics_summary", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }),
    s.rpc("analytics_revenue_series", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_bucket: "day", p_tz: tz, p_data: data }),
    s.from("machines").select("id, connection_status, available_batteries, state, is_simulated").eq("tenant_id", ctx.tenant.id).neq("state", "retired"),
    s.rpc("analytics_location_performance", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }),
    s.from("device_events").select("id, event_type, severity, occurred_at, is_simulated, machine_id, rental_id, payload, machines(name, device_id)").eq("tenant_id", ctx.tenant.id).order("occurred_at", { ascending: false }).limit(10),
    s.from("device_events").select("id, event_type, severity, occurred_at, is_simulated, payload, machines(id, name, device_id)").eq("tenant_id", ctx.tenant.id).in("severity", ["warning", "error"]).gte("occurred_at", rangeBounds("7").from).order("occurred_at", { ascending: false }).limit(6),
    isMgr ? s.from("integrations").select("status, details").eq("tenant_id", ctx.tenant.id).eq("kind", "stripe_connect").maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const summary = (summaryRes.data ?? {}) as Record<string, number | boolean | string | null>;
  const currency = String(summary.currency ?? "usd");
  const machines = machinesRes.data ?? [];
  const online = machines.filter((m) => m.connection_status === "online").length;
  const offline = machines.length - online;
  const available = machines.reduce((a, m) => a + (m.available_batteries ?? 0), 0);
  const locations = locationsRes.data ?? [];
  const chart = (seriesRes.data ?? []).map((p) => ({
    label: new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(p.bucket_start)),
    value: Number(p.revenue_cents),
  }));
  const stripeOk = !!(stripeRes.data?.details as { charges_enabled?: boolean } | undefined)?.charges_enabled;
  const isEmpty = machines.length === 0 && locations.length === 0;

  if (isEmpty) {
    const steps = [
      { done: locations.length > 0, label: t.overview.stepLocation, href: `${base}/locations`, icon: <MapPin /> },
      { done: machines.length > 0, label: t.overview.stepMachine, href: `${base}/machines`, icon: <BatteryCharging /> },
      { done: stripeOk, label: t.overview.stepStripe, href: `${base}/integrations`, icon: <Plug /> },
      { done: false, label: t.overview.stepBrand, href: `${base}/branding`, icon: <Palette /> },
    ];
    return (
      <>
        <PageHeader title={t.overview.title} subtitle={ctx.tenant.name} />
        <Card>
          <EmptyState icon={<BatteryCharging />} title={t.overview.emptyTitle} body={t.overview.emptyBody} />
          <div className="mx-auto grid max-w-2xl gap-2 px-5 pb-8 sm:grid-cols-2">
            {steps.map((st) => (
              <Link key={st.label} href={st.href} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm hover:border-electric/40 hover:bg-electric-50/40">
                <span className="text-electric [&_svg]:size-4">{st.done ? <CheckCircle2 /> : st.icon}</span>
                <span className="font-medium">{st.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.overview.title}
        subtitle={t.overview.subtitle}
        actions={<RangeFilters t={t} base={base} range={range} data={data} />}
      />
      {summary.has_simulated && data !== "real" && (
        <Alert tone="warning" className="mb-4">{t.common.simulatedData}</Alert>
      )}
      {isMgr && !stripeOk && (
        <Alert tone="info" className="mb-4" action={<Button asChild size="sm" variant="secondary"><Link href={`${base}/integrations`}>{t.integrations.connect}</Link></Button>}>
          {t.overview.stripeMissing}
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={t.overview.revenue} value={formatMoney(Number(summary.revenue_cents ?? 0), currency, locale)} icon={<Wallet />} />
        <Stat label={t.overview.rentals} value={Number(summary.rentals ?? 0)} icon={<Receipt />} />
        <Stat label={t.overview.activeRentals} value={Number(summary.active_now ?? 0)} icon={<Activity />} />
        <Stat label={t.overview.machinesOnline} value={online} icon={<Wifi />} tone={online > 0 ? "good" : "default"} />
        <Stat label={t.overview.machinesOffline} value={offline} icon={<WifiOff />} tone={offline > 0 ? "bad" : "default"} />
        <Stat label={t.overview.availableBanks} value={available} icon={<BatteryCharging />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>{t.overview.revenueOverTime}</CardTitle></CardHeader>
          <CardContent className="pt-2"><RevenueAreaChart data={chart} currency={currency} locale={locale} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.bestLocations}</CardTitle>
            <Link href={`${base}/locations`} className="text-xs text-electric hover:underline">{t.common.view}</Link>
          </CardHeader>
          <CardContent>
            {locations.length === 0 ? (
              <p className="text-sm text-muted">{t.locations.emptyBody}</p>
            ) : (
              <ol className="space-y-3">
                {locations.slice(0, 5).map((l, i) => {
                  const max = Math.max(1, ...locations.map((x) => Number(x.revenue_cents)));
                  return (
                    <li key={l.location_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate"><span className="mr-2 text-muted tabular">{i + 1}</span>{l.location_name}</span>
                        <span className="tabular font-medium">{formatMoney(Number(l.revenue_cents), currency, locale)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-canvas">
                        <div className="h-1.5 rounded-full bg-electric" style={{ width: `${(Number(l.revenue_cents) / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t.overview.alerts}</CardTitle></CardHeader>
          <CardContent>
            {(alertsRes.data ?? []).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 text-success" />{t.overview.noAlerts}</div>
            ) : (
              <ul className="space-y-2">
                {(alertsRes.data ?? []).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <AlertTriangle className={e.severity === "error" ? "mt-0.5 size-4 text-danger" : "mt-0.5 size-4 text-warning"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {e.event_type.replaceAll("_", " ")}
                        {e.is_simulated && <SimBadge t={t} />}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {e.machines?.name ?? e.machines?.device_id} · {formatDateTime(e.occurred_at, locale, tz)}
                      </div>
                    </div>
                    {e.machines?.id && <Link href={`${base}/machines/${e.machines.id}`} className="text-xs text-electric hover:underline">{t.common.view}</Link>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.recentActivity}</CardTitle>
            {isMgr && <Button asChild size="sm" variant="secondary"><Link href={`${base}/machines`}><Plus />{t.machines.add}</Link></Button>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {(eventsRes.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{e.event_type.replaceAll("_", " ")}</span>
                      {e.is_simulated && <SimBadge t={t} />}
                    </div>
                    <div className="truncate text-xs text-muted">{e.machines?.name ?? e.machines?.device_id}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(e.occurred_at, locale, tz)}</span>
                </li>
              ))}
              {(eventsRes.data ?? []).length === 0 && <li className="py-2 text-sm text-muted">{t.machines.noEvents}</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
      {summary.rentals === 0 && <Badge className="mt-4">{t.rentals.emptyBody}</Badge>}
    </>
  );
}

import Link from "next/link";
import { Building2, BatteryCharging, MapPin, Receipt, Wallet, AlertTriangle, LifeBuoy } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function AdminHome() {
  await requireSuperAdmin();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: stats }, { data: tenants }] = await Promise.all([
    supabase.rpc("platform_stats"),
    supabase.from("tenants").select("id, name, slug, status, created_at, plans(name), subscriptions(status)").order("created_at", { ascending: false }).limit(8),
  ]);
  const s = (stats ?? {}) as Record<string, number | Record<string, number>>;
  const subs = (s.subscriptions ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader title={t.admin.title} subtitle={t.admin.subtitle} actions={<Button asChild><Link href="/admin/tenants/new">{t.admin.newOperator}</Link></Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.admin.operators} value={Number(s.tenants ?? 0)} icon={<Building2 />} hint={`${Number(s.tenants_active ?? 0)} ${t.status.active.toLowerCase()} · ${Number(s.tenants_suspended ?? 0)} ${t.status.suspended.toLowerCase()}`} />
        <Stat label={t.admin.machines} value={Number(s.machines ?? 0)} icon={<BatteryCharging />} hint={`${Number(s.machines_online ?? 0)} ${t.status.online.toLowerCase()} · ${Number(s.machines_simulated ?? 0)} ${t.common.simulated.toLowerCase()}`} />
        <Stat label={t.admin.locations} value={Number(s.locations ?? 0)} icon={<MapPin />} />
        <Stat label={t.admin.rentals} value={Number(s.rentals ?? 0)} icon={<Receipt />} hint={`${Number(s.rentals_real ?? 0)} ${t.common.real.toLowerCase()} · ${Number(s.rentals_30d ?? 0)} / 30d`} />
        <Stat label={t.admin.mrr} value={formatMoney(Number(s.mrr_cents ?? 0), "usd", locale)} icon={<Wallet />} />
        <Stat label={t.nav.webhooks} value={Number(s.webhooks_failed ?? 0)} icon={<AlertTriangle />} tone={Number(s.webhooks_failed ?? 0) > 0 ? "bad" : "default"} hint={t.status.failed} />
        <Stat label={t.nav.support} value={Number(s.open_tickets ?? 0)} icon={<LifeBuoy />} hint={t.status.open} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.admin.recentOperators}</CardTitle><Link href="/admin/tenants" className="text-xs text-electric hover:underline">{t.common.view}</Link></CardHeader>
          <Table>
            <THead><tr><TH>{t.common.name}</TH><TH>{t.admin.plan}</TH><TH>{t.common.status}</TH><TH>{t.nav.subscription}</TH><TH>{t.common.created}</TH></tr></THead>
            <tbody>
              {(tenants ?? []).map((x) => (
                <TR key={x.id}>
                  <TD><Link href={`/admin/tenants/${x.id}`} className="font-medium hover:text-electric">{x.name}</Link><div className="text-xs text-muted">{x.slug}</div></TD>
                  <TD>{x.plans?.name ?? "—"}</TD>
                  <TD><StatusBadge status={x.status} t={t} /></TD>
                  <TD>{x.subscriptions ? <StatusBadge status={x.subscriptions.status} t={t} /> : "—"}</TD>
                  <TD className="text-muted">{formatDate(x.created_at, locale)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.admin.subscriptions}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {Object.entries(subs).map(([k, n]) => (
                <li key={k} className="flex items-center justify-between text-sm"><StatusBadge status={k} t={t} /><span className="tabular font-medium">{n}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

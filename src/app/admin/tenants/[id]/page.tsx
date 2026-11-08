import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { rangeBounds } from "@/lib/ranges";
import { PageHeader, KeyValue, Stat, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { TenantOp, ChangePlanForm } from "@/components/admin/admin-forms";

export default async function AdminTenantDetail(props: PageProps<"/admin/tenants/[id]">) {
  await requireSuperAdmin();
  const { id } = await props.params;
  const { t, locale } = await getI18n();
  const s = await createClient();
  const { data: tenant } = await s.from("tenants").select("*, plans(code, name, machine_limit)").eq("id", id).maybeSingle();
  if (!tenant) notFound();
  const { from, to } = rangeBounds("30");
  const [{ data: sub }, { data: members }, { data: domains }, { data: integ }, { data: summary }, { count: machines }, { count: locations }, { data: plans }, { data: logs }] = await Promise.all([
    s.from("subscriptions").select("*").eq("tenant_id", id).maybeSingle(),
    s.from("memberships").select("id, role, status, profiles(email, full_name)").eq("tenant_id", id),
    s.from("tenant_domains").select("*").eq("tenant_id", id),
    s.from("integrations").select("status, stripe_account_id, details, livemode").eq("tenant_id", id).eq("kind", "stripe_connect").maybeSingle(),
    s.rpc("analytics_summary", { p_tenant: id, p_from: from, p_to: to, p_data: "all" }),
    s.from("machines").select("id", { count: "exact", head: true }).eq("tenant_id", id).neq("state", "retired"),
    s.from("locations").select("id", { count: "exact", head: true }).eq("tenant_id", id),
    s.from("plans").select("code, name").order("sort_order"),
    s.from("audit_logs").select("id, action, actor_email, created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  const m = (summary ?? {}) as Record<string, number>;
  return (
    <>
      <Link href="/admin/tenants" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t.nav.tenants}</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{tenant.name} <StatusBadge status={tenant.status} t={t} /></span>}
        subtitle={tenant.slug}
        actions={
          <>
            <Button asChild variant="secondary" size="sm"><Link href={`/o/${tenant.slug}`}><ExternalLink />{t.admin.openDashboard}</Link></Button>
            {tenant.status === "active" ? (
              <TenantOp t={t} tenantId={id} op="suspend" label={t.admin.suspend} variant="danger" confirm withReason />
            ) : (
              <TenantOp t={t} tenantId={id} op="reactivate" label={t.admin.reactivate} variant="primary" />
            )}
          </>
        }
      />
      {tenant.suspended_reason && <Alert tone="danger" className="mb-4">{tenant.suspended_reason}</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${t.overview.revenue} · 30d`} value={formatMoney(Number(m.revenue_cents ?? 0), String((summary as Record<string, unknown>)?.currency ?? "usd"), locale)} />
        <Stat label={t.overview.rentals} value={Number(m.rentals ?? 0)} />
        <Stat label={t.admin.machines} value={`${machines ?? 0} / ${tenant.plans?.machine_limit ?? 0}`} />
        <Stat label={t.admin.locations} value={locations ?? 0} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t.nav.subscription}</CardTitle>{sub && <StatusBadge status={sub.status} t={t} />}</CardHeader>
          <CardContent className="space-y-4">
            <KeyValue items={[
              [t.admin.plan, tenant.plans?.name ?? "—"],
              [t.subscription.trialEnds, formatDate(sub?.trial_ends_at, locale)],
              [t.subscription.renews, formatDate(sub?.current_period_end, locale)],
              ["Stripe customer", <span key="c" className="font-mono text-xs">{sub?.stripe_customer_id ?? "—"}</span>],
              ["Stripe subscription", <span key="s" className="font-mono text-xs">{sub?.stripe_subscription_id ?? "—"}</span>],
            ]} />
            <div className="flex flex-wrap gap-2">
              <ChangePlanForm t={t} tenantId={id} plans={plans ?? []} current={tenant.plans?.code} />
              <TenantOp t={t} tenantId={id} op="extend_trial" label={t.admin.extendTrial} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Stripe Connect</CardTitle><StatusBadge status={integ?.status ?? "not_connected"} t={t} /></CardHeader>
          <CardContent>
            <KeyValue items={[
              [t.integrations.accountId, <span key="a" className="font-mono text-xs">{integ?.stripe_account_id ?? "—"}</span>],
              [t.integrations.chargesEnabled, String(!!(integ?.details as { charges_enabled?: boolean } | null)?.charges_enabled)],
              [t.payments.mode, integ?.livemode == null ? "—" : integ.livemode ? t.payments.live : t.payments.test],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.admin.members}</CardTitle></CardHeader>
          <Table>
            <tbody>
              {(members ?? []).map((mm) => (
                <TR key={mm.id}><TD>{mm.profiles?.full_name ?? "—"}<div className="text-xs text-muted">{mm.profiles?.email}</div></TD><TD>{(t.roles as Record<string, string>)[mm.role]}</TD><TD><StatusBadge status={mm.status === "active" ? "active" : "suspended"} t={t} /></TD></TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.admin.domains}</CardTitle></CardHeader>
          <CardContent>
            {(domains ?? []).length === 0 ? <p className="text-sm text-muted">—</p> : (
              <ul className="space-y-2">
                {(domains ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="font-mono">{d.domain} {d.is_primary && <Badge tone="navy">primary</Badge>}</span>
                    <span className="flex gap-2">
                      {!d.verified && <TenantOp t={t} tenantId={id} op="verify_domain" label={t.admin.verifyDomain} extra={{ domainId: d.id }} variant="primary" />}
                      {!d.is_primary && <TenantOp t={t} tenantId={id} op="set_primary_domain" label="Primary" extra={{ domainId: d.id }} />}
                      <TenantOp t={t} tenantId={id} op="delete_domain" label={t.common.delete} extra={{ domainId: d.id }} variant="ghost" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>{t.admin.auditTitle}</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>{t.common.created}</TH><TH>{t.admin.action}</TH><TH>{t.admin.actor}</TH></tr></THead>
          <tbody>{(logs ?? []).map((l) => <TR key={l.id}><TD className="text-muted">{formatDateTime(l.created_at, locale)}</TD><TD className="font-mono text-xs">{l.action}</TD><TD>{l.actor_email ?? "—"}</TD></TR>)}</tbody>
        </Table>
      </Card>
    </>
  );
}

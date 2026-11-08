import Link from "next/link";
import { CreditCard, Download } from "lucide-react";
import { requireTenant } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { PageHeader, EmptyState, Stat } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/dashboard/pagination";

const PAGE = 50;

export default async function PaymentsPage(props: PageProps<"/o/[slug]/payments">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug, "manager");
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page) || 1);
  const { data } = await ctx.supabase
    .from("payments")
    .select("id, rental_id, provider, status, amount_authorized_cents, amount_captured_cents, amount_refunded_cents, application_fee_cents, currency, livemode, is_simulated, stripe_payment_intent_id, created_at, customers!payments_customer_id_tenant_id_fkey(email)")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  const rows = (data ?? []).slice(0, PAGE);
  const real = rows.filter((p) => !p.is_simulated);
  const cur = rows[0]?.currency ?? ctx.tenant.default_currency;
  return (
    <>
      <PageHeader
        title={t.payments.title}
        subtitle={t.payments.subtitle}
        actions={<Button asChild variant="secondary"><a href={`/api/export/${ctx.tenant.id}/payments`}><Download />{t.common.exportCsv}</a></Button>}
      />
      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`${t.payments.captured} (${t.common.real})`} value={formatMoney(real.reduce((a, p) => a + p.amount_captured_cents, 0), cur, locale)} />
          <Stat label={`${t.payments.refunded} (${t.common.real})`} value={formatMoney(real.reduce((a, p) => a + p.amount_refunded_cents, 0), cur, locale)} />
          <Stat label={t.payments.authorized} value={real.filter((p) => p.status === "authorized").length} />
          <Stat label={t.common.simulated} value={rows.length - real.length} />
        </div>
      )}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<CreditCard />} title={t.payments.emptyTitle} body={t.payments.emptyBody} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>{t.common.created}</TH><TH>{t.rentals.rental}</TH><TH>{t.rentals.customer}</TH><TH>{t.common.status}</TH><TH className="text-right">{t.payments.captured}</TH><TH className="text-right">{t.payments.refunded}</TH><TH className="text-right">{t.payments.fee}</TH><TH>{t.payments.mode}</TH></tr></THead>
              <tbody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-muted">{formatDateTime(p.created_at, locale, ctx.tenant.timezone)}</TD>
                    <TD>{p.rental_id ? <Link href={`/o/${slug}/rentals/${p.rental_id}`} className="font-mono text-xs hover:text-electric">{p.rental_id.slice(0, 8)}</Link> : "—"}</TD>
                    <TD className="text-muted">{p.customers?.email ?? "—"}</TD>
                    <TD><StatusBadge status={p.status} t={t} /></TD>
                    <TD className="tabular text-right font-medium">{formatMoney(p.amount_captured_cents, p.currency, locale)}</TD>
                    <TD className="tabular text-right">{formatMoney(p.amount_refunded_cents, p.currency, locale)}</TD>
                    <TD className="tabular text-right text-muted">{formatMoney(p.application_fee_cents, p.currency, locale)}</TD>
                    <TD>{p.is_simulated ? <SimBadge t={t} /> : <Badge tone={p.livemode ? "green" : "amber"}>{p.livemode ? t.payments.live : t.payments.test}</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination t={t} page={page} hasNext={(data ?? []).length > PAGE} href={(pg) => `/o/${slug}/payments?page=${pg}`} />
          </>
        )}
      </Card>
    </>
  );
}

import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime, formatDuration, formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/dashboard/pagination";

const STATUSES = ["all", "pending", "active", "returned", "overdue", "failed", "cancelled"] as const;
const PAGE = 25;

export default async function RentalsPage(props: PageProps<"/o/[slug]/rentals">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as string) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  let q = ctx.supabase
    .from("rentals")
    .select("id, status, payment_status, refund_status, amount_cents, currency, started_at, returned_at, created_at, is_simulated, battery_serial, machines!rentals_machine_id_tenant_id_fkey(name, device_id), locations!rentals_location_id_tenant_id_fkey(name), customers!rentals_customer_id_tenant_id_fkey(email)")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  if (status !== "all") q = q.eq("status", status as "active");
  const { data } = await q;
  const rows = (data ?? []).slice(0, PAGE);
  const base = `/o/${slug}/rentals`;
  const tz = ctx.tenant.timezone;
  return (
    <>
      <PageHeader
        title={t.rentals.title}
        subtitle={t.rentals.subtitle}
        actions={ctx.rank >= ROLE_RANK.manager ? (
          <Button asChild variant="secondary"><a href={`/api/export/${ctx.tenant.id}/rentals?status=${status}`}><Download />{t.common.exportCsv}</a></Button>
        ) : null}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link key={s} href={`${base}?status=${s}`} className={cn("rounded-full border px-3 py-1 text-xs font-medium", s === status ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-muted hover:text-ink")}>
            {s === "all" ? t.common.all : (t.status as Record<string, string>)[s]}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title={t.rentals.emptyTitle} body={t.rentals.emptyBody} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t.rentals.rental}</TH>
                  <TH>{t.common.status}</TH>
                  <TH>{t.rentals.machine}</TH>
                  <TH>{t.rentals.customer}</TH>
                  <TH>{t.rentals.started}</TH>
                  <TH>{t.rentals.duration}</TH>
                  <TH className="text-right">{t.rentals.amount}</TH>
                  <TH>{t.rentals.payment}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const mins = r.started_at ? ((r.returned_at ? new Date(r.returned_at) : new Date()).getTime() - new Date(r.started_at).getTime()) / 60000 : 0;
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`${base}/${r.id}`} className="font-mono text-xs font-medium hover:text-electric">{r.id.slice(0, 8)}</Link>
                        {r.is_simulated && <span className="ml-2"><SimBadge t={t} /></span>}
                      </TD>
                      <TD><StatusBadge status={r.status} t={t} /></TD>
                      <TD>
                        <div className="text-sm">{r.machines?.name ?? r.machines?.device_id}</div>
                        <div className="text-xs text-muted">{r.locations?.name}</div>
                      </TD>
                      <TD className="text-muted">{r.customers?.email ?? "—"}</TD>
                      <TD className="text-muted">{formatDateTime(r.started_at ?? r.created_at, locale, tz)}</TD>
                      <TD className="tabular">{r.started_at ? formatDuration(mins, locale) : "—"}</TD>
                      <TD className="tabular text-right font-medium">{formatMoney(r.amount_cents, r.currency, locale)}</TD>
                      <TD><StatusBadge status={r.payment_status} t={t} /></TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination t={t} page={page} hasNext={(data ?? []).length > PAGE} href={(p) => `${base}?status=${status}&page=${p}`} />
          </>
        )}
      </Card>
    </>
  );
}

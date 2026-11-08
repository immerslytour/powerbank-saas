import Link from "next/link";
import { Download, MapPin } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { parseData, parseRange, rangeBounds } from "@/lib/ranges";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/ui/charts";
import { RangeFilters } from "@/components/dashboard/filters";
import { AddLocationDialog } from "@/components/locations/location-form";

export default async function LocationsPage(props: PageProps<"/o/[slug]/locations">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const range = parseRange(sp.range);
  const data = parseData(sp.data);
  const { from, to } = rangeBounds(range);
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const [{ data: perf }, { data: locs }, { data: pricing }] = await Promise.all([
    ctx.supabase.rpc("analytics_location_performance", { p_tenant: ctx.tenant.id, p_from: from, p_to: to, p_data: data }),
    ctx.supabase.from("locations").select("id, city, region, is_active, contact_name").eq("tenant_id", ctx.tenant.id),
    ctx.supabase.from("rental_pricing").select("currency").eq("tenant_id", ctx.tenant.id).maybeSingle(),
  ]);
  const currency = pricing?.currency ?? "usd";
  const rows = perf ?? [];
  const byId = new Map((locs ?? []).map((l) => [l.id, l]));
  return (
    <>
      <PageHeader
        title={t.locations.title}
        subtitle={t.locations.subtitle}
        actions={isMgr ? <AddLocationDialog t={t} tenantId={ctx.tenant.id} slug={slug} /> : null}
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={<MapPin />} title={t.locations.emptyTitle} body={t.locations.emptyBody} action={isMgr ? <AddLocationDialog t={t} tenantId={ctx.tenant.id} slug={slug} /> : null} /></Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <RangeFilters t={t} base={`/o/${slug}/locations`} range={range} data={data} />
            {isMgr && (
              <Button asChild size="sm" variant="secondary">
                <a href={`/api/export/${ctx.tenant.id}/locations?range=${range}&data=${data}`}><Download />{t.common.exportCsv}</a>
              </Button>
            )}
          </div>
          <Card className="mb-4">
            <CardHeader><CardTitle>{t.locations.performance}</CardTitle></CardHeader>
            <div className="p-5 pt-2">
              <SimpleBarChart data={rows.slice(0, 10).map((r) => ({ label: r.location_name.slice(0, 14), value: Number(r.revenue_cents) }))} currency={currency} locale={locale} />
            </div>
          </Card>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.name}</TH>
                  <TH>{t.locations.machines}</TH>
                  <TH className="text-right">{t.locations.rentals}</TH>
                  <TH className="text-right">{t.locations.revenue}</TH>
                  <TH className="text-right">{t.locations.avgPerRental}</TH>
                  <TH>{t.locations.commission}</TH>
                  <TH className="text-right">{t.locations.commissionDue}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const l = byId.get(r.location_id);
                  return (
                    <TR key={r.location_id}>
                      <TD>
                        <Link href={`/o/${slug}/locations/${r.location_id}`} className="font-medium hover:text-electric">{r.location_name}</Link>
                        <div className="text-xs text-muted">{[l?.city, l?.region].filter(Boolean).join(", ") || "—"}</div>
                      </TD>
                      <TD className="tabular">{Number(r.machines)}</TD>
                      <TD className="tabular text-right">{Number(r.rentals)}</TD>
                      <TD className="tabular text-right font-medium">{formatMoney(Number(r.revenue_cents), currency, locale)}</TD>
                      <TD className="tabular text-right">{formatMoney(Number(r.avg_revenue_cents), currency, locale)}</TD>
                      <TD className="text-muted">
                        {r.commission_type === "percent" ? `${r.commission_value / 100}%` : r.commission_type === "flat_monthly" ? `${formatMoney(r.commission_value, currency, locale)}/mo` : t.locations.commissionNone}
                      </TD>
                      <TD className="tabular text-right">{formatMoney(Number(r.commission_due_cents), currency, locale)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

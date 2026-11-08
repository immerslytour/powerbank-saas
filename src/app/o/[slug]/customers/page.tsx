import { UsersRound, Download } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pagination } from "@/components/dashboard/pagination";

const PAGE = 50;

export default async function CustomersPage(props: PageProps<"/o/[slug]/customers">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number(sp.page) || 1);
  const { data } = await ctx.supabase
    .from("customers")
    .select("id, email, phone, name, rental_count, created_at")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  const rows = (data ?? []).slice(0, PAGE);
  return (
    <>
      <PageHeader
        title={t.customers.title}
        subtitle={t.customers.subtitle}
        actions={ctx.rank >= ROLE_RANK.manager ? <Button asChild variant="secondary"><a href={`/api/export/${ctx.tenant.id}/customers`}><Download />{t.common.exportCsv}</a></Button> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title={t.customers.emptyTitle} body={t.customers.emptyBody} />
        ) : (
          <>
            <Table>
              <THead><tr><TH>{t.common.email}</TH><TH>{t.common.name}</TH><TH>{t.common.phone}</TH><TH className="text-right">{t.customers.rentals}</TH><TH>{t.customers.firstSeen}</TH></tr></THead>
              <tbody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.email ?? "—"}</TD>
                    <TD>{c.name ?? "—"}</TD>
                    <TD>{c.phone ?? "—"}</TD>
                    <TD className="tabular text-right">{c.rental_count}</TD>
                    <TD className="text-muted">{formatDate(c.created_at, locale, ctx.tenant.timezone)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination t={t} page={page} hasNext={(data ?? []).length > PAGE} href={(p) => `/o/${slug}/customers?page=${p}`} />
          </>
        )}
      </Card>
    </>
  );
}

import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function AdminTenants(props: PageProps<"/admin/tenants">) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  let query = supabase.from("tenants").select("id, name, slug, status, created_at, plans(name, machine_limit), subscriptions(status), machines(count), locations(count)").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,slug.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  return (
    <>
      <PageHeader title={t.nav.tenants} actions={<Button asChild><Link href="/admin/tenants/new">{t.admin.newOperator}</Link></Button>} />
      <form className="mb-4 max-w-sm"><Input name="q" defaultValue={q} placeholder={t.common.search} /></form>
      <Card>
        <Table>
          <THead><tr><TH>{t.common.name}</TH><TH>{t.admin.plan}</TH><TH>{t.common.status}</TH><TH>{t.nav.subscription}</TH><TH className="text-right">{t.admin.machines}</TH><TH className="text-right">{t.admin.locations}</TH><TH>{t.common.created}</TH></tr></THead>
          <tbody>
            {(data ?? []).map((x) => (
              <TR key={x.id}>
                <TD><Link href={`/admin/tenants/${x.id}`} className="font-medium hover:text-electric">{x.name}</Link><div className="text-xs text-muted">{x.slug}</div></TD>
                <TD>{x.plans?.name ?? "—"}</TD>
                <TD><StatusBadge status={x.status} t={t} /></TD>
                <TD>{x.subscriptions ? <StatusBadge status={x.subscriptions.status} t={t} /> : "—"}</TD>
                <TD className="tabular text-right">{(x.machines as unknown as { count: number }[])?.[0]?.count ?? 0}{x.plans ? ` / ${x.plans.machine_limit}` : ""}</TD>
                <TD className="tabular text-right">{(x.locations as unknown as { count: number }[])?.[0]?.count ?? 0}</TD>
                <TD className="text-muted">{formatDate(x.created_at, locale)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

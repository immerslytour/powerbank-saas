import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pagination } from "@/components/dashboard/pagination";

const PAGE = 100;

export default async function AdminAudit(props: PageProps<"/admin/audit">) {
  await requireSuperAdmin();
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { t, locale } = await getI18n();
  const { data } = await (await createClient())
    .from("audit_logs")
    .select("id, action, actor_email, entity_type, entity_id, metadata, ip, created_at, tenants(name)")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE);
  return (
    <>
      <PageHeader title={t.admin.auditTitle} />
      <Card>
        <Table>
          <THead><tr><TH>{t.common.created}</TH><TH>{t.admin.action}</TH><TH>{t.admin.actor}</TH><TH>{t.nav.tenants}</TH><TH>{t.admin.entity}</TH><TH>IP</TH></tr></THead>
          <tbody>
            {(data ?? []).slice(0, PAGE).map((l) => (
              <TR key={l.id}>
                <TD className="text-muted">{formatDateTime(l.created_at, locale)}</TD>
                <TD className="font-mono text-xs">{l.action}</TD>
                <TD>{l.actor_email ?? "system"}</TD>
                <TD>{l.tenants?.name ?? "—"}</TD>
                <TD className="max-w-xs truncate font-mono text-xs text-muted" title={JSON.stringify(l.metadata)}>{l.entity_type}{l.entity_id ? `:${l.entity_id.slice(0, 8)}` : ""}</TD>
                <TD className="font-mono text-xs text-muted">{l.ip ?? ""}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
        <Pagination t={t} page={page} hasNext={(data ?? []).length > PAGE} href={(p) => `/admin/audit?page=${p}`} />
      </Card>
    </>
  );
}

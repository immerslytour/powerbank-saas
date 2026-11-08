import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { RetryWebhookButton } from "@/components/admin/admin-forms";

export default async function AdminWebhooks() {
  await requireSuperAdmin();
  const { t, locale } = await getI18n();
  const { data } = await (await createClient())
    .from("webhook_events")
    .select("id, source, external_id, event_type, account_id, status, attempts, last_error, received_at, livemode")
    .order("received_at", { ascending: false })
    .limit(200);
  return (
    <>
      <PageHeader title={t.admin.webhooksTitle} />
      <Card>
        <Table>
          <THead><tr><TH>{t.common.created}</TH><TH>Source</TH><TH>Type</TH><TH>{t.common.status}</TH><TH>#</TH><TH>Error</TH><TH /></tr></THead>
          <tbody>
            {(data ?? []).map((e) => (
              <TR key={e.id}>
                <TD className="text-muted">{formatDateTime(e.received_at, locale)}</TD>
                <TD className="text-xs">{e.source}{e.livemode === false ? " · test" : ""}</TD>
                <TD className="font-mono text-xs">{e.event_type}<div className="text-muted">{e.external_id}</div></TD>
                <TD><StatusBadge status={e.status} t={t} /></TD>
                <TD className="tabular">{e.attempts}</TD>
                <TD className="max-w-xs truncate text-xs text-danger" title={e.last_error ?? ""}>{e.last_error}</TD>
                <TD>{e.status === "failed" && <RetryWebhookButton t={t} eventId={e.id} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

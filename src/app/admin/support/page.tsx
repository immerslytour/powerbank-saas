import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { TicketReplyForm } from "@/components/admin/admin-forms";
import { LifeBuoy } from "lucide-react";

export default async function AdminSupport() {
  await requireSuperAdmin();
  const { t, locale } = await getI18n();
  const { data } = await (await createClient())
    .from("support_tickets")
    .select("id, subject, body, status, priority, admin_reply, created_at, tenants(name, slug), profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader title={t.admin.supportTitle} />
      {(data ?? []).length === 0 ? (
        <Card><EmptyState icon={<LifeBuoy />} title={t.admin.supportTitle} /></Card>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((tk) => (
            <Card key={tk.id}>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{tk.subject}</span>
                    <StatusBadge status={tk.status} t={t} />
                    {tk.priority !== "normal" && <Badge tone="red">{tk.priority}</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted">{tk.tenants?.name} · {tk.profiles?.email} · {formatDateTime(tk.created_at, locale)}</div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">{tk.body}</p>
                </div>
                <TicketReplyForm t={t} ticketId={tk.id} reply={tk.admin_reply} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { BatteryCharging } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { AddMachineDialog } from "@/components/machines/machine-form";

export default async function MachinesPage(props: PageProps<"/o/[slug]/machines">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const [{ data: machines }, { data: locations }] = await Promise.all([
    ctx.supabase
      .from("machines")
      .select("id, name, device_id, provider, manufacturer, model, connection_status, state, last_seen_at, available_batteries, total_slots, is_simulated, location_id, locations(name)")
      .eq("tenant_id", ctx.tenant.id)
      .order("created_at", { ascending: true }),
    ctx.supabase.from("locations").select("id, name").eq("tenant_id", ctx.tenant.id).order("name"),
  ]);
  const list = machines ?? [];
  const active = list.filter((m) => m.state !== "retired").length;
  const limit = ctx.plan?.machine_limit ?? 0;
  const atLimit = active >= limit;
  const actions = isMgr ? (
    <>
      <AddMachineDialog t={t} tenantId={ctx.tenant.id} slug={slug} locations={locations ?? []} simulator />
      <AddMachineDialog t={t} tenantId={ctx.tenant.id} slug={slug} locations={locations ?? []} />
    </>
  ) : null;

  return (
    <>
      <PageHeader title={t.machines.title} subtitle={`${t.machines.subtitle} · ${active}/${limit}`} actions={actions} />
      {isMgr && atLimit && <Alert tone="warning" className="mb-4">{t.machines.limitReached}</Alert>}
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<BatteryCharging />} title={t.machines.emptyTitle} body={t.machines.emptyBody} action={actions && <div className="flex gap-2">{actions}</div>} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t.common.name}</TH>
                <TH>{t.machines.location}</TH>
                <TH>{t.machines.connection}</TH>
                <TH>{t.machines.batteries}</TH>
                <TH>{t.machines.provider}</TH>
                <TH>{t.machines.lastSeen}</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <Link href={`/o/${slug}/machines/${m.id}`} className="font-medium text-ink hover:text-electric">
                      {m.name ?? m.device_id}
                    </Link>
                    <div className="flex items-center gap-2 font-mono text-xs text-muted">
                      {m.device_id}
                      {m.is_simulated && <SimBadge t={t} />}
                      {m.state !== "active" && <StatusBadge status={m.state} t={t} />}
                    </div>
                  </TD>
                  <TD className="text-muted">{m.locations?.name ?? t.machines.unassigned}</TD>
                  <TD><StatusBadge status={m.connection_status} t={t} /></TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.min(m.total_slots, 16) }).map((_, i) => (
                          <span key={i} className={i < m.available_batteries ? "h-3 w-1.5 rounded-sm bg-electric" : "h-3 w-1.5 rounded-sm bg-line"} />
                        ))}
                      </div>
                      <span className="tabular text-xs text-muted">{m.available_batteries}/{m.total_slots}</span>
                    </div>
                  </TD>
                  <TD className="text-muted">{m.provider}</TD>
                  <TD className="text-muted">{formatDateTime(m.last_seen_at, locale, ctx.tenant.timezone)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

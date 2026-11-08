import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { machineUrl } from "@/lib/urls";
import { getProvider } from "@/lib/hardware/registry";
import type { RpcClient } from "@/lib/rpc";
import { PageHeader, KeyValue, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EditMachineForm } from "@/components/machines/machine-form";
import { SimulatorPanel, RefreshStatusButton } from "@/components/machines/simulator-panel";

const noDb: RpcClient = { rpc: async () => ({ data: null, error: { message: "unused" } }) };

export default async function MachineDetail(props: PageProps<"/o/[slug]/machines/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const tz = ctx.tenant.timezone;
  const s = ctx.supabase;
  const { data: m } = await s
    .from("machines")
    .select("*, locations(id, name)")
    .eq("id", id)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
  if (!m) notFound();
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const [{ data: batteries }, { data: events }, { data: locations }, { data: rentals }, { data: domain }] = await Promise.all([
    s.from("batteries").select("serial, slot_number, charge_level, status").eq("machine_id", m.id).order("slot_number"),
    s.from("device_events").select("id, event_type, severity, source, occurred_at, payload, is_simulated, rental_id").eq("machine_id", m.id).order("occurred_at", { ascending: false }).limit(40),
    s.from("locations").select("id, name").eq("tenant_id", ctx.tenant.id).order("name"),
    s.from("rentals").select("id, status, battery_serial").eq("machine_id", m.id).in("status", ["active", "overdue", "pending"]).order("created_at", { ascending: false }).limit(20),
    s.from("tenant_domains").select("domain").eq("tenant_id", ctx.tenant.id).eq("verified", true).eq("is_primary", true).maybeSingle(),
  ]);
  const url = machineUrl(m.public_code, domain?.domain);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 220, color: { dark: "#0a1428", light: "#ffffff" } });
  const provider = getProvider(m.provider, noDb);
  const slots = Array.from({ length: m.total_slots }, (_, i) => {
    const b = (batteries ?? []).find((x) => x.slot_number === i + 1 && ["in_slot", "charging", "faulty"].includes(x.status));
    return { slot: i + 1, b };
  });
  const cfg = (m.sim_config ?? {}) as { offline?: boolean; unlock_failure?: boolean; unlock_async?: boolean };

  return (
    <>
      <Link href={`/o/${slug}/machines`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t.machines.title}</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{m.name ?? m.device_id} {m.is_simulated && <SimBadge t={t} />}</span>}
        subtitle={<span className="font-mono">{m.device_id}</span>}
        actions={
          <>
            <StatusBadge status={m.connection_status} t={t} />
            {isMgr && <RefreshStatusButton t={t} tenantId={ctx.tenant.id} machineId={m.id} />}
            <Button asChild size="sm" variant="secondary"><a href={url} target="_blank" rel="noreferrer"><ExternalLink />{t.machines.openRentalPage}</a></Button>
          </>
        }
      />
      {!provider.isReady && (
        <Alert tone="warning" className="mb-4" title={t.machines.providerNotReady}>{t.machines.providerNotReadyBody}</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {m.is_simulated && isMgr && (
            <SimulatorPanel
              t={t}
              tenantId={ctx.tenant.id}
              machineId={m.id}
              config={cfg}
              activeRentals={(rentals ?? []).filter((r) => r.status !== "pending" && r.battery_serial)}
              pendingRentals={(rentals ?? []).filter((r) => r.status === "pending")}
            />
          )}
          <Card>
            <CardHeader><CardTitle>{t.machines.inventory}</CardTitle><span className="tabular text-sm text-muted">{m.available_batteries}/{m.total_slots} {t.machines.available.toLowerCase()}</span></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {slots.map(({ slot, b }) => (
                  <div key={slot} className={`rounded-lg border p-2 text-center ${b ? "border-electric/25 bg-electric-50" : "border-dashed border-line bg-canvas"}`}>
                    <div className="text-[10px] uppercase text-muted">{t.machines.slot} {slot}</div>
                    {b ? (
                      <>
                        <div className="tabular mt-1 text-sm font-semibold">{b.charge_level}%</div>
                        <div className="mx-auto mt-1 h-1 w-10 rounded bg-white"><div className="h-1 rounded bg-electric" style={{ width: `${b.charge_level}%` }} /></div>
                        <div className="mt-1 truncate font-mono text-[9px] text-muted" title={b.serial}>{b.serial}</div>
                      </>
                    ) : (
                      <div className="mt-2 text-xs text-muted">{t.machines.empty}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.machines.events}</CardTitle></CardHeader>
            <CardContent className="pt-3">
              {(events ?? []).length === 0 ? (
                <p className="text-sm text-muted">{t.machines.noEvents}</p>
              ) : (
                <ol className="relative space-y-3 border-l border-line pl-5">
                  {(events ?? []).map((e) => (
                    <li key={e.id} className="relative">
                      <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${e.severity === "error" ? "bg-danger" : e.severity === "warning" ? "bg-warning" : "bg-electric"}`} />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{e.event_type.replaceAll("_", " ")}</span>
                        {e.is_simulated && <SimBadge t={t} />}
                        <span className="text-xs text-muted">{e.source}</span>
                        {e.severity === "error" && <AlertTriangle className="size-3.5 text-danger" />}
                      </div>
                      <div className="text-xs text-muted">{formatDateTime(e.occurred_at, locale, tz)}</div>
                      {e.payload && Object.keys(e.payload as object).length > 0 && (
                        <code className="mt-1 block truncate rounded bg-canvas px-2 py-1 font-mono text-[11px] text-muted">{JSON.stringify(e.payload)}</code>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div><CardTitle>{t.machines.qrCode}</CardTitle><CardDescription>{t.machines.qrHint}</CardDescription></div>
            </CardHeader>
            <CardContent>
              <div className="mx-auto w-fit rounded-xl border border-line p-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="mt-3 text-center font-mono text-sm tracking-widest">{m.public_code}</div>
              <div className="mt-3 flex justify-center"><CopyButton value={url} label={t.common.copy} copiedLabel={t.common.copied} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <KeyValue
                items={[
                  [t.machines.manufacturer, m.manufacturer],
                  [t.machines.model, m.model ?? "—"],
                  [t.machines.provider, m.provider],
                  [t.machines.location, m.locations ? <Link className="text-electric" href={`/o/${slug}/locations/${m.locations.id}`}>{m.locations.name}</Link> : t.machines.unassigned],
                  [t.machines.capacity, m.total_slots],
                  [t.machines.lastSeen, formatDateTime(m.last_seen_at, locale, tz)],
                  [t.machines.state, <StatusBadge key="s" status={m.state} t={t} />],
                ]}
              />
            </CardContent>
          </Card>
          {isMgr && (
            <Card>
              <CardHeader><CardTitle>{t.common.edit}</CardTitle></CardHeader>
              <CardContent>
                <EditMachineForm t={t} tenantId={ctx.tenant.id} machine={m} locations={locations ?? []} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

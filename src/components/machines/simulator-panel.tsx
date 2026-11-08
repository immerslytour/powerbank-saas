"use client";
import { FlaskConical, PlugZap, RefreshCw, Undo2, Wifi, WifiOff, Timer, Zap } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { simulatorAction, refreshMachineStatus } from "@/lib/actions/machines";
import type { Dict } from "@/lib/i18n/format";

function Op({ tenantId, machineId, op, children, extra, variant = "secondary" }: {
  tenantId: string; machineId: string; op: string; children: React.ReactNode; extra?: Record<string, string>; variant?: "secondary" | "primary" | "navy";
}) {
  return (
    <ActionForm action={simulatorAction} showSuccess={false}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="machineId" value={machineId} />
      <input type="hidden" name="op" value={op} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton size="sm" variant={variant}>{children}</SubmitButton>
    </ActionForm>
  );
}

export function SimulatorPanel({
  t, tenantId, machineId, config, activeRentals, pendingRentals,
}: {
  t: Dict;
  tenantId: string;
  machineId: string;
  config: { offline?: boolean; unlock_failure?: boolean; unlock_async?: boolean };
  activeRentals: { id: string; battery_serial: string | null }[];
  pendingRentals: { id: string }[];
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[#f1c46b] bg-[repeating-linear-gradient(135deg,#fffaf0,#fffaf0_10px,#fff4dd_10px,#fff4dd_20px)] p-5">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-5 text-[#8a5a00]" />
        <div>
          <h3 className="font-semibold text-[#5c3d00]">{t.machines.simulatorTitle}</h3>
          <p className="text-sm text-[#8a5a00]">{t.machines.simulatorBody}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {config.offline ? (
          <Op tenantId={tenantId} machineId={machineId} op="online"><Wifi />{t.machines.simOnline}</Op>
        ) : (
          <Op tenantId={tenantId} machineId={machineId} op="offline"><WifiOff />{t.machines.simOffline}</Op>
        )}
        <Op tenantId={tenantId} machineId={machineId} op="toggle_fail" variant={config.unlock_failure ? "navy" : "secondary"}>
          <Zap />{t.machines.simFailNext}{config.unlock_failure ? " ✓" : ""}
        </Op>
        <Op tenantId={tenantId} machineId={machineId} op="toggle_async" variant={config.unlock_async ? "navy" : "secondary"}>
          <Timer />{t.machines.simAsync}{config.unlock_async ? " ✓" : ""}
        </Op>
        <Op tenantId={tenantId} machineId={machineId} op="refill"><RefreshCw />{t.machines.simRefill}</Op>
      </div>
      {(activeRentals.length > 0 || pendingRentals.length > 0) && (
        <div className="mt-4 space-y-2 border-t border-[#f1c46b]/60 pt-4">
          {pendingRentals.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-mono text-xs">{r.id.slice(0, 8)} · {t.status.pending}</span>
              <Op tenantId={tenantId} machineId={machineId} op="confirm_pending" extra={{ rentalId: r.id }} variant="primary"><PlugZap />{t.machines.simConfirm}</Op>
            </div>
          ))}
          {activeRentals.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-mono text-xs">{r.battery_serial}</span>
              <Op tenantId={tenantId} machineId={machineId} op="return" extra={{ serial: r.battery_serial ?? "" }} variant="primary"><Undo2 />{t.machines.simReturn}</Op>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RefreshStatusButton({ t, tenantId, machineId }: { t: Dict; tenantId: string; machineId: string }) {
  return (
    <ActionForm action={refreshMachineStatus}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="machineId" value={machineId} />
      <SubmitButton size="sm" variant="secondary"><RefreshCw />{t.machines.refreshStatus}</SubmitButton>
    </ActionForm>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FlaskConical } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createMachine, updateMachine } from "@/lib/actions/machines";
import type { Dict } from "@/lib/i18n/format";

type Loc = { id: string; name: string };

export function AddMachineDialog({ t, tenantId, slug, locations, simulator }: { t: Dict; tenantId: string; slug: string; locations: Loc[]; simulator?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [provider, setProvider] = useState(simulator ? "simulator" : "heycharge");
  const [simId] = useState(() => `SIM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={simulator ? t.machines.addSimulator : t.machines.add}
      trigger={
        <Button variant={simulator ? "secondary" : "primary"}>
          {simulator ? <FlaskConical /> : <Plus />}
          {simulator ? t.machines.addSimulator : t.machines.add}
        </Button>
      }
    >
      <ActionForm
        action={createMachine}
        className="space-y-4"
        onSuccess={(s) => {
          setOpen(false);
          const id = s?.ok ? (s.data?.id as string | undefined) : undefined;
          router.push(id ? `/o/${slug}/machines/${id}` : `/o/${slug}/machines`);
        }}
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.machines.provider} htmlFor="provider">
            <Select id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="heycharge">HeyCharge (Shenzhen EMCC)</option>
              <option value="simulator">Simulator — {t.common.simulated}</option>
            </Select>
          </Field>
          <Field label={t.machines.deviceId} htmlFor="deviceId" hint={provider === "simulator" ? undefined : "e.g. serial printed on the station"}>
            <Input id="deviceId" name="deviceId" required defaultValue={provider === "simulator" ? simId : ""} key={provider} />
          </Field>
          <Field label={t.common.name} htmlFor="name" hint={t.common.optional}>
            <Input id="name" name="name" placeholder="Front counter" />
          </Field>
          <Field label={t.machines.model} htmlFor="model" hint={t.common.optional}>
            <Input id="model" name="model" placeholder="8-slot w/ screen + POS" />
          </Field>
          <Field label={t.machines.location} htmlFor="locationId">
            <Select id="locationId" name="locationId" defaultValue="">
              <option value="">{t.machines.unassigned}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t.machines.capacity} htmlFor="totalSlots" hint={t.machines.slotsHint}>
            <Input id="totalSlots" name="totalSlots" type="number" min={1} max={96} defaultValue={8} required />
          </Field>
        </div>
        {provider !== "simulator" && <p className="rounded-lg bg-warning/5 px-3 py-2 text-xs text-warning">{t.machines.providerNotReadyBody}</p>}
        <div className="flex justify-end"><SubmitButton>{t.common.create}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  );
}

export function EditMachineForm({
  t, tenantId, machine, locations,
}: {
  t: Dict;
  tenantId: string;
  machine: { id: string; name: string | null; model: string | null; location_id: string | null; state: string; notes: string | null };
  locations: Loc[];
}) {
  return (
    <ActionForm action={updateMachine} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="machineId" value={machine.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.name} htmlFor="name"><Input id="name" name="name" defaultValue={machine.name ?? ""} /></Field>
        <Field label={t.machines.model} htmlFor="model"><Input id="model" name="model" defaultValue={machine.model ?? ""} /></Field>
        <Field label={t.machines.location} htmlFor="locationId">
          <Select id="locationId" name="locationId" defaultValue={machine.location_id ?? ""}>
            <option value="">{t.machines.unassigned}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label={t.machines.state} htmlFor="state">
          <Select id="state" name="state" defaultValue={machine.state}>
            {(["active", "maintenance", "retired"] as const).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t.common.notes} htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={machine.notes ?? ""} /></Field>
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </ActionForm>
  );
}

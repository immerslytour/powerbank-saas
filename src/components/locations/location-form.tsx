"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveLocation } from "@/lib/actions/locations";
import { centsToInput } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";

export type LocationRow = {
  id?: string;
  name?: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  commission_type?: string;
  commission_value?: number;
  is_active?: boolean;
};

export function LocationFields({ t, tenantId, loc = {} }: { t: Dict; tenantId: string; loc?: LocationRow }) {
  const [type, setType] = useState(loc.commission_type ?? "none");
  const initial =
    loc.commission_type === "percent" ? String((loc.commission_value ?? 0) / 100) : loc.commission_type === "flat_monthly" ? centsToInput(loc.commission_value) : "";
  return (
    <>
      <input type="hidden" name="tenantId" value={tenantId} />
      {loc.id && <input type="hidden" name="locationId" value={loc.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.common.name} htmlFor="name" className="sm:col-span-2"><Input id="name" name="name" required defaultValue={loc.name ?? ""} /></Field>
        <Field label={t.locations.address} htmlFor="address_line1" className="sm:col-span-2"><Input id="address_line1" name="address_line1" defaultValue={loc.address_line1 ?? ""} /></Field>
        <Field label={t.locations.address2} htmlFor="address_line2" className="sm:col-span-2"><Input id="address_line2" name="address_line2" defaultValue={loc.address_line2 ?? ""} /></Field>
        <Field label={t.locations.city} htmlFor="city"><Input id="city" name="city" defaultValue={loc.city ?? ""} /></Field>
        <Field label={t.locations.region} htmlFor="region"><Input id="region" name="region" defaultValue={loc.region ?? ""} /></Field>
        <Field label={t.locations.postal} htmlFor="postal_code"><Input id="postal_code" name="postal_code" defaultValue={loc.postal_code ?? ""} /></Field>
        <Field label={t.locations.country} htmlFor="country"><Input id="country" name="country" maxLength={2} defaultValue={loc.country ?? "US"} /></Field>
      </div>
      <h4 className="pt-2 text-sm font-semibold">{t.locations.contact}</h4>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.locations.contactName} htmlFor="contact_name"><Input id="contact_name" name="contact_name" defaultValue={loc.contact_name ?? ""} /></Field>
        <Field label={t.locations.contactEmail} htmlFor="contact_email"><Input id="contact_email" name="contact_email" type="email" defaultValue={loc.contact_email ?? ""} /></Field>
        <Field label={t.locations.contactPhone} htmlFor="contact_phone"><Input id="contact_phone" name="contact_phone" defaultValue={loc.contact_phone ?? ""} /></Field>
      </div>
      <h4 className="pt-2 text-sm font-semibold">{t.locations.commission}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.locations.commissionType} htmlFor="commission_type">
          <Select id="commission_type" name="commission_type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="none">{t.locations.commissionNone}</option>
            <option value="percent">{t.locations.commissionPercent}</option>
            <option value="flat_monthly">{t.locations.commissionFlat}</option>
          </Select>
        </Field>
        {type !== "none" && (
          <Field label={type === "percent" ? t.locations.commissionValuePercent : t.locations.commissionValueFlat} htmlFor="commission_value">
            <Input id="commission_value" name="commission_value" inputMode="decimal" defaultValue={initial} required />
          </Field>
        )}
      </div>
      <Field label={t.common.notes} htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={loc.notes ?? ""} /></Field>
    </>
  );
}

export function AddLocationDialog({ t, tenantId, slug }: { t: Dict; tenantId: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen} wide title={t.locations.add} trigger={<Button><Plus />{t.locations.add}</Button>}>
      <ActionForm
        action={saveLocation}
        className="space-y-4"
        onSuccess={(s) => {
          setOpen(false);
          const id = s?.ok ? (s.data?.id as string | undefined) : undefined;
          router.push(id ? `/o/${slug}/locations/${id}` : `/o/${slug}/locations`);
        }}
      >
        <LocationFields t={t} tenantId={tenantId} />
        <div className="flex justify-end"><SubmitButton>{t.common.create}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  );
}

export function EditLocationForm({ t, tenantId, loc }: { t: Dict; tenantId: string; loc: LocationRow }) {
  return (
    <ActionForm action={saveLocation} className="space-y-4">
      <LocationFields t={t} tenantId={tenantId} loc={loc} />
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </ActionForm>
  );
}

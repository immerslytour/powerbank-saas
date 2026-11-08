"use client";
import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { savePricing, saveBusiness, saveProfile, createTicket } from "@/lib/actions/settings";
import { computeCharge } from "@/lib/pricing";
import { centsToInput, formatMoney } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";

type PricingRow = {
  currency: string; initial_fee_cents: number; free_minutes: number; hourly_rate_cents: number; daily_rate_cents: number;
  max_charge_cents: number; late_fee_cents: number; late_after_hours: number | null; overdue_after_hours: number;
  refund_window_days: number; refund_policy: string | null; terms_text: string | null;
};

const toCents = (v: string) => Math.round((Number(v.replace(",", ".")) || 0) * 100);

export function PricingForm({ t, tenantId, pricing, locale, canEdit }: { t: Dict; tenantId: string; pricing: PricingRow; locale: string; canEdit: boolean }) {
  const [v, setV] = useState({
    initial: centsToInput(pricing.initial_fee_cents),
    free: String(pricing.free_minutes),
    hourly: centsToInput(pricing.hourly_rate_cents),
    daily: centsToInput(pricing.daily_rate_cents),
    max: centsToInput(pricing.max_charge_cents),
    late: centsToInput(pricing.late_fee_cents),
    lateAfter: pricing.late_after_hours == null ? "" : String(pricing.late_after_hours),
  });
  const examples = useMemo(() => {
    const p = {
      initial_fee_cents: toCents(v.initial), free_minutes: Number(v.free) || 0, hourly_rate_cents: toCents(v.hourly),
      daily_rate_cents: toCents(v.daily), max_charge_cents: toCents(v.max), late_fee_cents: toCents(v.late),
      late_after_hours: v.lateAfter === "" ? null : Number(v.lateAfter),
    };
    return [30, 60, 180, 1440, 2880].map((m) => ({ m, total: computeCharge(p, m).total }));
  }, [v]);
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <ActionForm action={savePricing} className="space-y-4">
      {(state) => (
        <fieldset disabled={!canEdit} className="space-y-4">
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.settings.currency} htmlFor="currency">
              <Select id="currency" name="currency" defaultValue={pricing.currency}>
                {["usd", "mxn", "cad", "eur", "gbp"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </Select>
            </Field>
            <Field label={t.settings.initialFee} htmlFor="initial_fee" error={fieldError(state, "initial_fee_cents")}><Input id="initial_fee" name="initial_fee" inputMode="decimal" value={v.initial} onChange={on("initial")} /></Field>
            <Field label={t.settings.freeMinutes} htmlFor="free_minutes"><Input id="free_minutes" name="free_minutes" type="number" min={0} max={1440} value={v.free} onChange={on("free")} /></Field>
            <Field label={t.settings.hourlyRate} htmlFor="hourly_rate" error={fieldError(state, "hourly_rate_cents")}><Input id="hourly_rate" name="hourly_rate" inputMode="decimal" value={v.hourly} onChange={on("hourly")} /></Field>
            <Field label={t.settings.dailyRate} htmlFor="daily_rate" error={fieldError(state, "daily_rate_cents")}><Input id="daily_rate" name="daily_rate" inputMode="decimal" value={v.daily} onChange={on("daily")} /></Field>
            <Field label={t.settings.maxCharge} hint={t.settings.maxChargeHint} htmlFor="max_charge" error={fieldError(state, "max_charge_cents")}><Input id="max_charge" name="max_charge" inputMode="decimal" value={v.max} onChange={on("max")} /></Field>
            <Field label={t.settings.lateFee} htmlFor="late_fee"><Input id="late_fee" name="late_fee" inputMode="decimal" value={v.late} onChange={on("late")} /></Field>
            <Field label={t.settings.lateAfter} htmlFor="late_after_hours"><Input id="late_after_hours" name="late_after_hours" type="number" min={1} max={720} value={v.lateAfter} onChange={on("lateAfter")} /></Field>
            <Field label={t.settings.overdueAfter} htmlFor="overdue_after_hours"><Input id="overdue_after_hours" name="overdue_after_hours" type="number" min={1} max={160} defaultValue={pricing.overdue_after_hours} /></Field>
            <Field label={t.settings.refundWindow} htmlFor="refund_window_days"><Input id="refund_window_days" name="refund_window_days" type="number" min={0} max={180} defaultValue={pricing.refund_window_days} /></Field>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t.settings.examples}</div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {examples.map((e) => (
                <div key={e.m} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                  <div className="text-xs text-muted">{e.m < 60 ? `${e.m} min` : e.m < 1440 ? `${e.m / 60} h` : `${e.m / 1440} d`}</div>
                  <div className="tabular font-semibold">{formatMoney(e.total, pricing.currency, locale)}</div>
                </div>
              ))}
            </div>
          </div>
          <Field label={t.settings.refundPolicy} htmlFor="refund_policy"><Textarea id="refund_policy" name="refund_policy" defaultValue={pricing.refund_policy ?? ""} /></Field>
          <Field label={t.settings.terms} htmlFor="terms_text"><Textarea id="terms_text" name="terms_text" className="min-h-32" defaultValue={pricing.terms_text ?? ""} /></Field>
          {canEdit && <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>}
        </fieldset>
      )}
    </ActionForm>
  );
}

export function BusinessForm({ t, tenant, canEdit }: { t: Dict; tenant: { id: string; name: string; timezone: string; locale: string; country: string }; canEdit: boolean }) {
  const zones = ["America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York", "America/Mexico_City", "America/Tijuana", "America/Bogota", "Europe/Madrid", "UTC"];
  if (!zones.includes(tenant.timezone)) zones.unshift(tenant.timezone);
  return (
    <ActionForm action={saveBusiness} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.auth.businessName} htmlFor="bname" className="sm:col-span-2"><Input id="bname" name="name" defaultValue={tenant.name} required /></Field>
          <Field label={t.settings.timezone} htmlFor="timezone"><Select id="timezone" name="timezone" defaultValue={tenant.timezone}>{zones.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label={t.settings.defaultLanguage} htmlFor="blocale"><Select id="blocale" name="locale" defaultValue={tenant.locale}><option value="en">English</option><option value="es">Español</option></Select></Field>
          <Field label={t.locations.country} htmlFor="bcountry"><Input id="bcountry" name="country" maxLength={2} defaultValue={tenant.country} /></Field>
        </div>
        {canEdit && <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>}
      </fieldset>
    </ActionForm>
  );
}

export function ProfileForm({ t, name }: { t: Dict; name: string }) {
  return (
    <ActionForm action={saveProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label={t.auth.fullName} htmlFor="full_name" className="flex-1"><Input id="full_name" name="full_name" defaultValue={name} required /></Field>
      <SubmitButton variant="secondary">{t.common.save}</SubmitButton>
    </ActionForm>
  );
}

export function TicketForm({ t, tenantId }: { t: Dict; tenantId: string }) {
  return (
    <ActionForm action={createTicket} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field label={t.settings.supportSubject} htmlFor="subject"><Input id="subject" name="subject" required minLength={3} maxLength={200} /></Field>
      <Field label={t.settings.supportBody} htmlFor="body"><Textarea id="body" name="body" required /></Field>
      <div className="flex justify-end"><SubmitButton>{t.settings.supportSend}</SubmitButton></div>
    </ActionForm>
  );
}

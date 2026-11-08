"use client";
import { useState } from "react";
import { BatteryCharging } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { saveBranding, requestDomain } from "@/lib/actions/branding";
import type { Dict } from "@/lib/i18n/format";

type Brand = {
  display_name: string; primary_color: string; secondary_color: string; accent_color: string; support_email: string | null;
  support_phone: string | null; website: string | null; checkout_headline: string | null; portal_message: string | null;
  return_instructions: string | null;
};

export function BrandingForm({ t, tenantId, brand, logoUrl }: { t: Dict; tenantId: string; brand: Brand; logoUrl: string | null }) {
  const [b, setB] = useState(brand);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const set = (k: keyof Brand) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setB({ ...b, [k]: e.target.value });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <ActionForm action={saveBranding} className="space-y-5">
        <input type="hidden" name="tenantId" value={tenantId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.branding.displayName} htmlFor="display_name" className="sm:col-span-2">
            <Input id="display_name" name="display_name" required value={b.display_name} onChange={set("display_name")} />
          </Field>
          <Field label={t.branding.logo} hint={t.branding.logoHint} htmlFor="logo" className="sm:col-span-2">
            <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="py-1.5"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
          </Field>
          {(["primary_color", "secondary_color", "accent_color"] as const).map((k) => (
            <Field key={k} label={k === "primary_color" ? t.branding.primary : k === "secondary_color" ? t.branding.secondary : t.branding.accent} htmlFor={k}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={k} value={b[k]} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" />
                <Input id={k} name={k} value={b[k]} onChange={set(k)} pattern="#[0-9a-fA-F]{6}" className="font-mono" />
              </div>
            </Field>
          ))}
          <Field label={t.branding.supportEmail} htmlFor="support_email"><Input id="support_email" name="support_email" type="email" value={b.support_email ?? ""} onChange={set("support_email")} /></Field>
          <Field label={t.branding.supportPhone} htmlFor="support_phone"><Input id="support_phone" name="support_phone" value={b.support_phone ?? ""} onChange={set("support_phone")} /></Field>
          <Field label={t.branding.website} htmlFor="website"><Input id="website" name="website" type="url" placeholder="https://" value={b.website ?? ""} onChange={set("website")} /></Field>
          <Field label={t.branding.checkoutHeadline} htmlFor="checkout_headline" className="sm:col-span-2"><Input id="checkout_headline" name="checkout_headline" value={b.checkout_headline ?? ""} onChange={set("checkout_headline")} /></Field>
          <Field label={t.branding.portalMessage} htmlFor="portal_message" className="sm:col-span-2"><Textarea id="portal_message" name="portal_message" value={b.portal_message ?? ""} onChange={set("portal_message")} /></Field>
          <Field label={t.branding.returnInstructions} htmlFor="return_instructions" className="sm:col-span-2"><Textarea id="return_instructions" name="return_instructions" value={b.return_instructions ?? ""} onChange={set("return_instructions")} /></Field>
        </div>
        <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
      </ActionForm>
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t.branding.preview}</div>
        <div className="mx-auto w-[300px] overflow-hidden rounded-[28px] border-[6px] border-navy-900 bg-white shadow-[var(--shadow-pop)]">
          <div className="px-5 pb-6 pt-7 text-white" style={{ background: b.primary_color }}>
            <div className="flex items-center gap-2">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-9 rounded-lg bg-white object-contain p-1" />
              ) : (
                <div className="grid size-9 place-items-center rounded-lg bg-white/15 font-semibold">{b.display_name.slice(0, 1)}</div>
              )}
              <span className="font-semibold">{b.display_name}</span>
            </div>
            <div className="mt-6 text-xl font-semibold leading-tight">{b.checkout_headline || t.customer.rentTitle}</div>
            {b.portal_message && <p className="mt-2 text-xs opacity-80">{b.portal_message}</p>}
          </div>
          <div className="space-y-3 p-5" style={{ background: b.secondary_color }}>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-3 text-sm">
              <BatteryCharging className="size-4" style={{ color: b.accent_color }} /> 6 / 8
            </div>
            <div className="rounded-xl py-3 text-center text-sm font-semibold text-white" style={{ background: b.accent_color }}>{t.customer.payAndRent}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DomainForm({ t, tenantId, canCustom, hasRoot }: { t: Dict; tenantId: string; canCustom: boolean; hasRoot: boolean }) {
  return (
    <div className="space-y-3">
      {hasRoot && (
        <ActionForm action={requestDomain} showSuccess={false}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="kind" value="subdomain" />
          <SubmitButton size="sm" variant="secondary">{t.branding.subdomain}</SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={requestDomain} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="kind" value="custom" />
        <Input name="domain" placeholder="rent.yourbrand.com" disabled={!canCustom} />
        <SubmitButton size="md" variant="secondary" disabled={!canCustom}>{t.branding.addDomain}</SubmitButton>
      </ActionForm>
      <p className="text-xs text-muted">{canCustom ? t.branding.domainHint : t.branding.advancedLocked}</p>
    </div>
  );
}

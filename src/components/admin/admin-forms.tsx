"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { createOperator, tenantAdminAction, savePlan, savePlatformSettings, regenerateAccessCode, replyTicket, retryWebhook } from "@/lib/actions/admin";
import { slugify, centsToInput } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";

export function CreateOperatorForm({ t, plans }: { t: Dict; plans: { code: string; name: string }[] }) {
  const [slug, setSlug] = useState("");
  return (
    <ActionForm action={createOperator} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.businessName} htmlFor="name"><Input id="name" name="name" required onChange={(e) => setSlug(slugify(e.target.value))} /></Field>
        <Field label={t.onboarding.slug} htmlFor="slug" hint={t.onboarding.slugHint}><Input id="slug" name="slug" required value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></Field>
        <Field label={t.admin.ownerEmail} htmlFor="ownerEmail"><Input id="ownerEmail" name="ownerEmail" type="email" required /></Field>
        <Field label={t.admin.ownerPassword} hint={t.admin.ownerPasswordHint} htmlFor="ownerPassword"><Input id="ownerPassword" name="ownerPassword" type="password" minLength={8} autoComplete="new-password" /></Field>
        <Field label={t.admin.plan} htmlFor="plan"><Select id="plan" name="plan">{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
      </div>
      <div className="flex justify-end"><SubmitButton>{t.admin.createOperator}</SubmitButton></div>
    </ActionForm>
  );
}

export function TenantOp({ tenantId, op, label, variant = "secondary", extra, confirm, t, withReason }: {
  tenantId: string; op: string; label: string; variant?: "secondary" | "danger" | "primary" | "ghost"; extra?: Record<string, string>; confirm?: boolean; t: Dict; withReason?: boolean;
}) {
  const form = (
    <ActionForm action={tenantAdminAction} showSuccess={false} className={withReason ? "space-y-3" : undefined}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="op" value={op} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {withReason && <Field label={t.admin.suspendReason} htmlFor="reason"><Input id="reason" name="reason" /></Field>}
      <SubmitButton size="sm" variant={variant}>{confirm ? t.common.confirm : label}</SubmitButton>
    </ActionForm>
  );
  if (!confirm) return form;
  return <Dialog title={label} trigger={<Button size="sm" variant={variant}>{label}</Button>}>{form}</Dialog>;
}

export function ChangePlanForm({ t, tenantId, plans, current }: { t: Dict; tenantId: string; plans: { code: string; name: string }[]; current?: string }) {
  return (
    <ActionForm action={tenantAdminAction} showSuccess={false} className="flex gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="op" value="plan" />
      <Select name="plan" defaultValue={current} className="h-8 text-xs">{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select>
      <SubmitButton size="sm" variant="secondary">{t.admin.changePlan}</SubmitButton>
    </ActionForm>
  );
}

type PlanRow = {
  id?: string; code?: string; name?: string; description?: string | null; price_cents?: number; currency?: string; billing_interval?: string;
  trial_days?: number; machine_limit?: number; location_limit?: number | null; team_limit?: number | null; stripe_price_id?: string | null;
  features?: Record<string, boolean>; is_active?: boolean; is_public?: boolean; sort_order?: number;
};
const FEATURES = ["basic_dashboard", "basic_reports", "advanced_reports", "advanced_analytics", "team_access", "multiple_locations", "advanced_branding", "priority_support", "custom_domain", "csv_export"] as const;

export function PlanForm({ t, plan = {} }: { t: Dict; plan?: PlanRow }) {
  return (
    <ActionForm action={savePlan} className="space-y-4">
      {plan.id && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t.admin.code} htmlFor={`code-${plan.id}`}><Input id={`code-${plan.id}`} name="code" defaultValue={plan.code} required /></Field>
        <Field label={t.common.name} htmlFor={`name-${plan.id}`}><Input id={`name-${plan.id}`} name="name" defaultValue={plan.name} required /></Field>
        <Field label={t.admin.price} htmlFor={`price-${plan.id}`}><Input id={`price-${plan.id}`} name="price" inputMode="decimal" defaultValue={centsToInput(plan.price_cents ?? 0)} required /></Field>
        <Field label={t.settings.currency} htmlFor={`cur-${plan.id}`}><Input id={`cur-${plan.id}`} name="currency" defaultValue={plan.currency ?? "usd"} required /></Field>
        <Field label={t.admin.interval} htmlFor={`int-${plan.id}`}><Select id={`int-${plan.id}`} name="billing_interval" defaultValue={plan.billing_interval ?? "month"}><option value="month">{t.subscription.month}</option><option value="year">{t.subscription.year}</option></Select></Field>
        <Field label={t.admin.trialDays} htmlFor={`tr-${plan.id}`}><Input id={`tr-${plan.id}`} name="trial_days" type="number" defaultValue={plan.trial_days ?? 14} /></Field>
        <Field label={t.admin.machineLimit} htmlFor={`ml-${plan.id}`}><Input id={`ml-${plan.id}`} name="machine_limit" type="number" defaultValue={plan.machine_limit ?? 5} required /></Field>
        <Field label={t.admin.locationLimit} htmlFor={`ll-${plan.id}`} hint="∞ = empty"><Input id={`ll-${plan.id}`} name="location_limit" type="number" defaultValue={plan.location_limit ?? ""} /></Field>
        <Field label={t.admin.teamLimit} htmlFor={`tl-${plan.id}`} hint="∞ = empty"><Input id={`tl-${plan.id}`} name="team_limit" type="number" defaultValue={plan.team_limit ?? ""} /></Field>
        <Field label={t.admin.stripePrice} htmlFor={`sp-${plan.id}`} className="sm:col-span-2"><Input id={`sp-${plan.id}`} name="stripe_price_id" defaultValue={plan.stripe_price_id ?? ""} placeholder="price_…" className="font-mono" /></Field>
        <Field label="Sort" htmlFor={`so-${plan.id}`}><Input id={`so-${plan.id}`} name="sort_order" type="number" defaultValue={plan.sort_order ?? 0} /></Field>
      </div>
      <Field label={t.common.notes} htmlFor={`d-${plan.id}`}><Textarea id={`d-${plan.id}`} name="description" defaultValue={plan.description ?? ""} className="min-h-16" /></Field>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {FEATURES.map((f) => (
          <label key={f} className="flex items-center gap-2"><input type="checkbox" name={`f_${f}`} defaultChecked={!!plan.features?.[f]} />{(t.subscription.features as Record<string, string>)[f]}</label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <div className="flex gap-4">
          <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={plan.is_active ?? true} />{t.admin.activeFlag}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="is_public" defaultChecked={plan.is_public ?? true} />{t.admin.visible}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="sync_stripe" />Sync → Stripe</label>
        </div>
        <SubmitButton>{t.common.save}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PlatformSettingsForm({ t, fee, allowSim, selfServe, defaultPlan, supportEmail, plans }: {
  t: Dict; fee: number; allowSim: boolean; selfServe: boolean; defaultPlan: string; supportEmail: string; plans: { code: string; name: string }[];
}) {
  return (
    <ActionForm action={savePlatformSettings} className="space-y-4">
      <Field label={t.admin.applicationFee} hint={t.admin.applicationFeeHint} htmlFor="fee"><Input id="fee" name="application_fee_bps" type="number" min={0} max={2000} defaultValue={fee} /></Field>
      <Field label={t.admin.defaultPlan} htmlFor="dp"><Select id="dp" name="default_plan" defaultValue={defaultPlan}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
      <Field label={t.admin.supportEmail} htmlFor="se"><Input id="se" name="support_email" type="email" defaultValue={supportEmail} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_simulated" defaultChecked={allowSim} />{t.admin.allowSimulated}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="self_serve" defaultChecked={selfServe} />{t.admin.selfServe}</label>
      <div className="flex justify-end"><SubmitButton>{t.common.save}</SubmitButton></div>
    </ActionForm>
  );
}

export function TicketReplyForm({ t, ticketId, reply }: { t: Dict; ticketId: string; reply: string | null }) {
  return (
    <ActionForm action={replyTicket} className="space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea name="reply" defaultValue={reply ?? ""} className="min-h-16" />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="close" />{t.status.closed}</label>
        <SubmitButton size="sm">{t.settings.reply}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RetryWebhookButton({ t, eventId }: { t: Dict; eventId: string }) {
  return (
    <ActionForm action={retryWebhook}>
      <input type="hidden" name="eventId" value={eventId} />
      <SubmitButton size="sm" variant="secondary">{t.admin.retry}</SubmitButton>
    </ActionForm>
  );
}

export function AccessCodeCard({ t, code }: { t: Dict; code: string }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{t.admin.accessCode}</div>
      <div className="flex items-center gap-2">
        <code className="rounded-lg border border-line bg-canvas px-4 py-2 font-mono text-lg tracking-widest">{code || "—"}</code>
        {code && <CopyButton value={code} label={t.common.copy} copiedLabel={t.common.copied} />}
      </div>
      <p className="text-xs text-muted">{t.admin.accessCodeHint}</p>
      <ActionForm action={regenerateAccessCode}>
        <SubmitButton variant="secondary">{t.admin.regenerate}</SubmitButton>
      </ActionForm>
    </div>
  );
}

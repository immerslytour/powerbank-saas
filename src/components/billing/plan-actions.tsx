"use client";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { choosePlan, openBillingPortal, toggleCancel } from "@/lib/actions/billing";

export function ChoosePlanButton({ tenantId, plan, label, variant = "primary" }: { tenantId: string; plan: string; label: string; variant?: "primary" | "secondary" }) {
  return (
    <ActionForm action={choosePlan}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton className="w-full" variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function PortalButton({ tenantId, label }: { tenantId: string; label: string }) {
  return (
    <ActionForm action={openBillingPortal}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <SubmitButton variant="secondary">{label}</SubmitButton>
    </ActionForm>
  );
}

export function CancelToggle({ tenantId, label }: { tenantId: string; label: string }) {
  return (
    <ActionForm action={toggleCancel} showSuccess={false}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <SubmitButton variant="ghost" size="sm">{label}</SubmitButton>
    </ActionForm>
  );
}

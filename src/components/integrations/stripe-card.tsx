"use client";
import { ExternalLink, Link2, RefreshCw, Unplug } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { connectStripe, refreshStripe, disconnectStripe } from "@/lib/actions/integrations";
import type { Dict } from "@/lib/i18n/format";

export function StripeActions({ t, tenantId, status, isOwner, hasAccount }: { t: Dict; tenantId: string; status: string; isOwner: boolean; hasAccount: boolean }) {
  const connectLabel = !hasAccount || status === "not_connected" ? t.integrations.connect : status === "disconnected" ? t.integrations.reconnect : t.integrations.continueOnboarding;
  return (
    <div className="flex flex-wrap gap-2">
      {isOwner && status !== "active" && (
        <ActionForm action={connectStripe}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <SubmitButton><Link2 />{connectLabel}</SubmitButton>
        </ActionForm>
      )}
      {hasAccount && (
        <ActionForm action={refreshStripe} showSuccess={false}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <SubmitButton variant="secondary"><RefreshCw />{t.integrations.refresh}</SubmitButton>
        </ActionForm>
      )}
      {hasAccount && status !== "disconnected" && (
        <Button asChild variant="secondary"><a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer"><ExternalLink />{t.integrations.openDashboard}</a></Button>
      )}
      {isOwner && hasAccount && status !== "disconnected" && (
        <ActionForm action={disconnectStripe} showSuccess={false}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <SubmitButton variant="danger-outline"><Unplug />{t.integrations.disconnect}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

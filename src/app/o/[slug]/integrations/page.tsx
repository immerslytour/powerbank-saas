import { CheckCircle2, CircleDashed, Cpu, FlaskConical } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { isStripeConfigured } from "@/lib/env";
import { stripeMode } from "@/lib/stripe/client";
import { HARDWARE_PROVIDERS, getProvider } from "@/lib/hardware/registry";
import type { RpcClient } from "@/lib/rpc";
import { PageHeader, Alert, KeyValue } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { StripeActions } from "@/components/integrations/stripe-card";

const noDb: RpcClient = { rpc: async () => ({ data: null, error: { message: "unused" } }) };

function Flag({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="ml-auto size-4 text-success" /> : <CircleDashed className="ml-auto size-4 text-muted" />;
}

export default async function IntegrationsPage(props: PageProps<"/o/[slug]/integrations">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug, "manager");
  const { t } = await getI18n();
  const { data: integ } = await ctx.supabase.from("integrations").select("status, stripe_account_id, livemode, details, last_synced_at").eq("tenant_id", ctx.tenant.id).eq("kind", "stripe_connect").maybeSingle();
  const d = (integ?.details ?? {}) as { charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean; requirements_due?: string[]; past_due?: string[]; disabled_reason?: string | null };
  const status = integ?.status ?? "not_connected";
  const mode = stripeMode();
  const { count: hwCount } = await ctx.supabase.from("machines").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id).eq("provider", "heycharge");
  return (
    <>
      <PageHeader title={t.integrations.title} subtitle={t.integrations.subtitle} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <svg viewBox="0 0 60 25" className="h-5 w-auto" aria-label="Stripe"><path fill="#635bff" d="M59.6 13c0-4.3-2-7.6-6.1-7.6-4 0-6.4 3.3-6.4 7.6 0 5 2.8 7.5 6.9 7.5 2 0 3.5-.5 4.6-1.1v-3.3c-1.1.6-2.4 1-4.1 1-1.6 0-3-.6-3.2-2.5h8.2l.1-1.6zm-8.3-1.6c0-1.9 1.1-2.6 2.2-2.6 1 0 2.1.7 2.1 2.6h-4.3zM40.7 5.4c-1.6 0-2.7.8-3.3 1.3l-.2-1h-3.7v19.6l4.2-.9V20c.6.4 1.5 1.1 3 1.1 3 0 5.8-2.4 5.8-7.8 0-4.9-2.8-7.6-5.8-7.6zm-1 11.7c-1 0-1.6-.4-2-.8V10c.4-.5 1-.9 2-.9 1.6 0 2.6 1.7 2.6 4 0 2.3-1 4-2.6 4zM28.1 4.4l4.2-.9V0l-4.2.9v3.5zM28.1 5.7h4.2v14.7h-4.2zM23.6 6.9l-.3-1.2h-3.6v14.7h4.2v-10c1-1.3 2.7-1 3.2-.9V5.7c-.6-.2-2.5-.5-3.5 1.2zM15.2 2l-4.1.9v13.5c0 2.5 1.9 4.3 4.4 4.3 1.4 0 2.4-.3 3-.6v-3.4c-.5.2-3.2 1-3.2-1.5V9.2h3.2V5.7h-3.2L15.2 2zM4.3 10c0-.7.5-.9 1.4-.9 1.3 0 2.9.4 4.2 1.1V6.3c-1.4-.6-2.8-.8-4.2-.8C2.3 5.4 0 7.2 0 10.2c0 4.7 6.4 3.9 6.4 6 0 .8-.7 1.1-1.7 1.1-1.5 0-3.3-.6-4.8-1.4v4c1.6.7 3.3 1 4.8 1 3.5 0 5.9-1.7 5.9-4.8C10.6 11 4.3 12 4.3 10z" /></svg>
              <span>{t.integrations.stripeTitle}</span>
            </CardTitle>
            <CardDescription>{t.integrations.stripeBody}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={status} t={t} />
            {mode && <Badge tone={mode === "live" ? "green" : "amber"}>{mode === "live" ? t.integrations.liveMode : t.integrations.testMode}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isStripeConfigured() && <Alert tone="warning">{t.integrations.stripeNotConfigured}</Alert>}
          {status === "disconnected" && <Alert tone="danger">{t.integrations.disconnectedNote}</Alert>}
          {integ?.stripe_account_id && (
            <div className="grid gap-4 md:grid-cols-2">
              <KeyValue items={[
                [t.integrations.accountId, <span key="a" className="font-mono text-xs">{integ.stripe_account_id}</span>],
                [t.integrations.chargesEnabled, <Flag key="c" ok={!!d.charges_enabled} />],
                [t.integrations.payoutsEnabled, <Flag key="p" ok={!!d.payouts_enabled} />],
                [t.integrations.detailsSubmitted, <Flag key="d" ok={!!d.details_submitted} />],
              ]} />
              {((d.requirements_due ?? []).length > 0 || (d.past_due ?? []).length > 0 || d.disabled_reason) && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                  <div className="mb-1 font-medium">{t.integrations.requirements}</div>
                  {d.disabled_reason && <div className="mb-1 font-mono text-xs text-danger">{d.disabled_reason}</div>}
                  <ul className="list-inside list-disc text-xs text-muted">
                    {[...(d.past_due ?? []), ...(d.requirements_due ?? [])].slice(0, 12).map((r) => <li key={r} className="font-mono">{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <StripeActions t={t} tenantId={ctx.tenant.id} status={status} isOwner={ctx.rank >= ROLE_RANK.owner} hasAccount={!!integ?.stripe_account_id} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><div><CardTitle>{t.integrations.hardwareTitle}</CardTitle><CardDescription>{t.integrations.hardwareBody}</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {HARDWARE_PROVIDERS.map((p) => {
            const adapter = getProvider(p.id, noDb);
            return (
              <div key={p.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">{p.simulated ? <FlaskConical className="size-4 text-warning" /> : <Cpu className="size-4 text-electric" />}{p.name}</div>
                  <Badge tone={adapter.isReady ? "green" : "amber"} dot>{adapter.isReady ? t.integrations.ready : t.integrations.notReady}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{p.simulated ? t.integrations.simulatorDesc : t.integrations.heychargeDesc}</p>
                {!p.simulated && (hwCount ?? 0) > 0 && <p className="mt-2 text-xs text-muted">{hwCount} {t.machines.title.toLowerCase()}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

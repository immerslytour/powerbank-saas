import { Check } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { formatDate, formatMoney, cn } from "@/lib/utils";
import { isStripeConfigured } from "@/lib/env";
import { PageHeader, Alert, KeyValue } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChoosePlanButton, PortalButton, CancelToggle } from "@/components/billing/plan-actions";

export default async function SubscriptionPage(props: PageProps<"/o/[slug]/subscription">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const ctx = await requireTenant(slug, "manager");
  const { t, locale } = await getI18n();
  const isOwner = ctx.rank >= ROLE_RANK.owner;
  const [{ data: sub }, { data: plans }, { count: machineCount }] = await Promise.all([
    ctx.supabase.from("subscriptions").select("*, plans(name, code)").eq("tenant_id", ctx.tenant.id).maybeSingle(),
    ctx.supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    ctx.supabase.from("machines").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenant.id).neq("state", "retired"),
  ]);
  const billing = isStripeConfigured();
  if ((ctx.plan?.price_cents ?? 0) === 0) {
    return (
      <>
        <PageHeader title={t.subscription.title} />
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-xl font-semibold">{t.subscription.communityTitle}<Badge tone="green">{ctx.plan?.name}</Badge></div>
            <p className="mt-2 text-sm text-muted">{t.subscription.communityBody}</p>
            <div className="mt-4 text-sm">{machineCount ?? 0} / {ctx.plan?.machine_limit ?? 0} {t.subscription.machines}</div>
          </CardContent>
        </Card>
      </>
    );
  }
  const currentCode = sub?.plans?.code ?? ctx.plan?.code;
  return (
    <>
      <PageHeader title={t.subscription.title} subtitle={t.subscription.subtitle} actions={isOwner && sub?.stripe_customer_id && billing ? <PortalButton tenantId={ctx.tenant.id} label={t.subscription.manage} /> : null} />
      {sp.success && <Alert tone="success" className="mb-4">{t.subscription.successNote}</Alert>}
      {sub?.last_payment_error && <Alert tone="danger" className="mb-4">{t.subscription.paymentFailed}</Alert>}
      {!billing && <Alert tone="info" className="mb-4">{t.subscription.billingNotConfigured}</Alert>}
      <Card className="mb-6">
        <CardContent className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">{t.subscription.currentPlan}</div>
            <div className="mt-1 flex items-center gap-3 text-2xl font-semibold">{sub?.plans?.name ?? ctx.plan?.name ?? "—"} {sub && <StatusBadge status={sub.status} t={t} />}</div>
            <div className="mt-2 text-sm text-muted">{machineCount ?? 0} / {ctx.plan?.machine_limit ?? 0} {t.subscription.machines}</div>
          </div>
          <KeyValue items={[
            ...(sub?.trial_ends_at && sub.status === "trialing" ? [[t.subscription.trialEnds, formatDate(sub.trial_ends_at, locale)] as [string, string]] : []),
            ...(sub?.current_period_end ? [[t.subscription.renews, formatDate(sub.current_period_end, locale)] as [string, string]] : []),
            ...(sub?.cancel_at_period_end ? [[t.subscription.cancelsAt, <span key="c" className="flex items-center gap-2">{t.common.yes}{isOwner && <CancelToggle tenantId={ctx.tenant.id} label={t.common.cancel} />}</span>] as [string, React.ReactNode]] : []),
          ]} />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {(plans ?? []).map((p) => {
          const current = p.code === currentCode && sub?.status !== "canceled";
          const features = Object.entries((p.features ?? {}) as Record<string, boolean>).filter(([, v]) => v);
          return (
            <Card key={p.id} className={cn("flex flex-col", current && "ring-2 ring-electric")}>
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {current && <Badge tone="blue">{t.subscription.current}</Badge>}
                </div>
                <p className="mt-1 min-h-10 text-sm text-muted">{p.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="tabular text-3xl font-semibold">{formatMoney(p.price_cents, p.currency, locale)}</span>
                  <span className="text-sm text-muted">/{p.billing_interval === "year" ? t.subscription.year : t.subscription.month}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="size-4 text-electric" />{fmt(t.subscription.upTo, { n: p.machine_limit })}</li>
                  <li className="flex gap-2"><Check className="size-4 text-electric" />{p.location_limit ?? t.subscription.unlimited} {t.subscription.locations}</li>
                  <li className="flex gap-2"><Check className="size-4 text-electric" />{p.team_limit ?? t.subscription.unlimited} {t.subscription.teamSeats}</li>
                  {features.map(([k]) => (
                    <li key={k} className="flex gap-2"><Check className="size-4 text-electric" />{(t.subscription.features as Record<string, string>)[k] ?? k}</li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  {isOwner && billing && p.stripe_price_id && !(current && sub?.stripe_subscription_id && sub.status !== "trialing") && (
                    <ChoosePlanButton
                      tenantId={ctx.tenant.id}
                      plan={p.code}
                      variant={current ? "primary" : "secondary"}
                      label={current || !sub?.stripe_subscription_id ? t.subscription.subscribe : fmt(t.subscription.switchTo, { plan: p.name })}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

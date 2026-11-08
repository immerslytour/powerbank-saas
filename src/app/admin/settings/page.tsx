import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { isServiceRoleConfigured, isStripeConfigured, serverEnv, publicEnv } from "@/lib/env";
import { stripeMode } from "@/lib/stripe/client";
import { PageHeader, KeyValue } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformSettingsForm } from "@/components/admin/admin-forms";

function Ok({ ok }: { ok: boolean }) {
  return <Badge tone={ok ? "green" : "red"} dot>{ok ? "configured" : "missing"}</Badge>;
}

export default async function AdminSettings() {
  await requireSuperAdmin();
  const { t } = await getI18n();
  const s = await createClient();
  const [{ data: settings }, { data: plans }] = await Promise.all([s.from("platform_settings").select("key, value"), s.from("plans").select("code, name").order("sort_order")]);
  const get = (k: string) => (settings ?? []).find((x) => x.key === k)?.value as Record<string, unknown> | undefined;
  const env = serverEnv();
  return (
    <>
      <PageHeader title={t.admin.settingsTitle} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <PlatformSettingsForm
              t={t}
              fee={Number(get("payments")?.application_fee_bps ?? 0)}
              allowSim={get("payments")?.allow_simulated_payments !== false}
              selfServe={get("signups")?.self_serve_enabled !== false}
              defaultPlan={String(get("signups")?.default_plan ?? "starter")}
              supportEmail={String(get("platform")?.support_email ?? "")}
              plans={plans ?? []}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Environment</CardTitle></CardHeader>
          <CardContent>
            <KeyValue items={[
              ["NEXT_PUBLIC_APP_URL", <span key="u" className="font-mono text-xs">{publicEnv.appUrl}</span>],
              ["NEXT_PUBLIC_ROOT_DOMAIN", <span key="r" className="font-mono text-xs">{publicEnv.rootDomain || "—"}</span>],
              ["SUPABASE_SERVICE_ROLE_KEY", <Ok key="a" ok={isServiceRoleConfigured()} />],
              ["STRIPE_SECRET_KEY", <span key="b" className="flex items-center gap-2"><Ok ok={isStripeConfigured()} />{stripeMode() && <Badge tone={stripeMode() === "live" ? "green" : "amber"}>{stripeMode()}</Badge>}</span>],
              ["STRIPE_WEBHOOK_SECRET", <Ok key="c" ok={!!env.stripeWebhookSecret} />],
              ["STRIPE_CONNECT_WEBHOOK_SECRET", <Ok key="d" ok={!!env.stripeConnectWebhookSecret} />],
              ["CRON_SECRET", <Ok key="e" ok={!!env.cronSecret} />],
              ["APP_ENCRYPTION_KEY", <Ok key="f" ok={!!process.env.APP_ENCRYPTION_KEY} />],
            ]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

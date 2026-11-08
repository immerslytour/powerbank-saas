import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanForm } from "@/components/admin/admin-forms";

export default async function AdminPlans() {
  await requireSuperAdmin();
  const { t, locale } = await getI18n();
  const { data: plans } = await (await createClient()).from("plans").select("*").order("sort_order");
  return (
    <>
      <PageHeader title={t.admin.planEditor} subtitle={t.admin.planEditorHint} />
      <div className="space-y-4">
        {(plans ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div><CardTitle>{p.name} · {formatMoney(p.price_cents, p.currency, locale)}/{p.billing_interval}</CardTitle><CardDescription className="font-mono text-xs">{p.stripe_price_id ?? "no Stripe price"}</CardDescription></div>
              <div className="flex gap-2">{!p.is_active && <Badge tone="red">inactive</Badge>}{!p.is_public && <Badge>hidden</Badge>}</div>
            </CardHeader>
            <CardContent><PlanForm t={t} plan={{ ...p, features: p.features as Record<string, boolean> }} /></CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>{t.admin.newPlan}</CardTitle></CardHeader>
          <CardContent><PlanForm t={t} /></CardContent>
        </Card>
      </div>
    </>
  );
}

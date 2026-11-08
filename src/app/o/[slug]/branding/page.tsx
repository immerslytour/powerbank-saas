import { notFound } from "next/navigation";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { brandAssetUrl } from "@/lib/storage";
import { publicEnv } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrandingForm, DomainForm } from "@/components/branding/branding-form";

export default async function BrandingPage(props: PageProps<"/o/[slug]/branding">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug, "manager");
  const { t } = await getI18n();
  const [{ data: brand }, { data: domains }] = await Promise.all([
    ctx.supabase.from("brands").select("*").eq("tenant_id", ctx.tenant.id).maybeSingle(),
    ctx.supabase.from("tenant_domains").select("id, domain, kind, verified, is_primary").eq("tenant_id", ctx.tenant.id),
  ]);
  if (!brand) notFound();
  const canCustom = !!ctx.features.custom_domain || ctx.role === "super_admin";
  return (
    <>
      <PageHeader title={t.branding.title} subtitle={t.branding.subtitle} />
      <Card>
        <CardContent className="p-6">
          <BrandingForm t={t} tenantId={ctx.tenant.id} brand={brand} logoUrl={brandAssetUrl(brand.logo_path)} />
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>{t.branding.domains}</CardTitle><CardDescription>{t.branding.domainHint}</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {(domains ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="font-mono">{d.domain}</span>
                <span className="flex gap-2">
                  {d.is_primary && <Badge tone="navy">primary</Badge>}
                  <Badge tone={d.verified ? "green" : "amber"} dot>{d.verified ? t.branding.verified : t.branding.unverified}</Badge>
                </span>
              </li>
            ))}
          </ul>
          {ctx.rank >= ROLE_RANK.owner && <DomainForm t={t} tenantId={ctx.tenant.id} canCustom={canCustom} hasRoot={!!publicEnv.rootDomain && !(domains ?? []).some((d) => d.kind === "subdomain")} />}
        </CardContent>
      </Card>
    </>
  );
}

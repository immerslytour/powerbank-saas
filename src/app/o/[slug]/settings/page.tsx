import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PricingForm, BusinessForm, ProfileForm, TicketForm } from "@/components/settings/forms";

export default async function SettingsPage(props: PageProps<"/o/[slug]/settings">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const [{ data: pricing }, { data: tickets }] = await Promise.all([
    ctx.supabase.from("rental_pricing").select("*").eq("tenant_id", ctx.tenant.id).maybeSingle(),
    ctx.supabase.from("support_tickets").select("id, subject, body, status, admin_reply, created_at").eq("tenant_id", ctx.tenant.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {isMgr && pricing && (
            <Card>
              <CardHeader><div><CardTitle>{t.settings.pricing}</CardTitle><CardDescription>{t.settings.pricingHint}</CardDescription></div></CardHeader>
              <CardContent><PricingForm t={t} tenantId={ctx.tenant.id} pricing={pricing} locale={locale} canEdit={isMgr} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>{t.settings.supportTitle}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <TicketForm t={t} tenantId={ctx.tenant.id} />
              {(tickets ?? []).length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t.settings.tickets}</div>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {(tickets ?? []).map((tk) => (
                      <li key={tk.id} className="p-3 text-sm">
                        <div className="flex items-center justify-between gap-2"><span className="font-medium">{tk.subject}</span><StatusBadge status={tk.status} t={t} /></div>
                        <div className="text-xs text-muted">{formatDateTime(tk.created_at, locale)}</div>
                        {tk.admin_reply && <div className="mt-2 rounded-lg bg-electric-50 p-2 text-[13px]"><span className="font-medium">{t.settings.reply}:</span> {tk.admin_reply}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          {isMgr && (
            <Card>
              <CardHeader><CardTitle>{t.settings.business}</CardTitle></CardHeader>
              <CardContent><BusinessForm t={t} tenant={ctx.tenant} canEdit={ctx.rank >= ROLE_RANK.owner} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>{t.settings.profile}</CardTitle></CardHeader>
            <CardContent><ProfileForm t={t} name={ctx.user.fullName ?? ""} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

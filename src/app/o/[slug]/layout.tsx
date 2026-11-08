import Link from "next/link";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { publicEnv } from "@/lib/env";
import { signOut } from "@/lib/actions/auth";
import { subscriptionOk } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { AppShell, type NavItem } from "@/components/shell/sidebar";

export default async function TenantLayout(props: LayoutProps<"/o/[slug]">) {
  const { slug } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const base = `/o/${slug}`;
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const isFree = (ctx.plan?.price_cents ?? 0) === 0;
  const nav: NavItem[] = [
    { href: base, label: t.nav.overview, icon: "gauge" },
    { href: `${base}/machines`, label: t.nav.machines, icon: "battery" },
    { href: `${base}/locations`, label: t.nav.locations, icon: "pin" },
    { href: `${base}/rentals`, label: t.nav.rentals, icon: "receipt" },
    { href: `${base}/customers`, label: t.nav.customers, icon: "users" },
    ...(isMgr
      ? ([
          { href: `${base}/payments`, label: t.nav.payments, icon: "card" },
          { href: `${base}/analytics`, label: t.nav.analytics, icon: "chart" },
        ] as NavItem[])
      : []),
  ];
  const footerNav: NavItem[] = isMgr
    ? [
        { href: `${base}/team`, label: t.nav.team, icon: "team" },
        { href: `${base}/branding`, label: t.nav.branding, icon: "palette" },
        { href: `${base}/integrations`, label: t.nav.integrations, icon: "plug" },
        ...(isFree ? [] : ([{ href: `${base}/subscription`, label: t.nav.subscription, icon: "wallet" }] as NavItem[])),
        { href: `${base}/settings`, label: t.nav.settings, icon: "settings" },
        ...(ctx.user.isSuperAdmin ? ([{ href: "/admin", label: t.nav.admin, icon: "shield" }] as NavItem[]) : []),
      ]
    : [{ href: `${base}/settings`, label: t.nav.support, icon: "life" }];

  if (ctx.tenant.status === "suspended" && ctx.role !== "super_admin") {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">{t.admin.suspendedTitle}</h1>
          <p className="mt-3 text-muted">{t.admin.suspendedBody}</p>
          {ctx.tenant.suspended_reason && <p className="mt-3 rounded-lg border border-line bg-white p-3 text-sm">{ctx.tenant.suspended_reason}</p>}
          <form action={signOut} className="mt-6"><button className="text-sm text-electric underline">{t.common.signOut}</button></form>
        </div>
      </div>
    );
  }

  const { data: sub } = await ctx.supabase.from("subscriptions").select("status, trial_ends_at").eq("tenant_id", ctx.tenant.id).maybeSingle();
  let banner: React.ReactNode = null;
  if (ctx.tenant.status === "suspended") {
    banner = <div className="bg-danger px-4 py-2 text-center text-sm text-white">{t.overview.suspended}</div>;
  } else if (isMgr && !isFree && sub && !subscriptionOk(sub, ctx.tenant.status)) {
    banner = (
      <div className="bg-warning px-4 py-2 text-center text-sm text-white">
        {t.overview.subscriptionInactive}{" "}
        <Link href={`${base}/subscription`} className="font-semibold underline">{t.subscription.choose}</Link>
      </div>
    );
  } else if (isMgr && !isFree && sub?.status === "trialing" && sub.trial_ends_at) {
    banner = (
      <div className="border-b border-electric/15 bg-electric-50 px-4 py-2 text-center text-[13px] text-navy-800">
        {fmt(t.overview.trialEnds, { date: formatDate(sub.trial_ends_at, locale, ctx.tenant.timezone) })}{" "}
        <Link href={`${base}/subscription`} className="font-medium text-electric underline-offset-2 hover:underline">{t.subscription.choose}</Link>
      </div>
    );
  }

  return (
    <AppShell
      platformName={publicEnv.platformName}
      title={ctx.tenant.name}
      subtitle={(t.roles as Record<string, string>)[ctx.role]}
      nav={nav}
      footerNav={footerNav}
      locale={locale}
      userEmail={ctx.user.email}
      signOutLabel={t.common.signOut}
      menuLabel={t.nav.menu}
      switchHref="/app"
      switchLabel={t.nav.switchBusiness}
      signOutAction={signOut}
      banner={banner}
    >
      {props.children}
    </AppShell>
  );
}

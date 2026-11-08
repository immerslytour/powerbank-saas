import { requireSuperAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { signOut } from "@/lib/actions/auth";
import { AppShell, type NavItem } from "@/components/shell/sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const { t, locale } = await getI18n();
  const nav: NavItem[] = [
    { href: "/admin", label: t.nav.overview, icon: "gauge" },
    { href: "/admin/tenants", label: t.nav.tenants, icon: "building" },
    { href: "/admin/users", label: t.nav.users, icon: "users" },
    { href: "/admin/plans", label: t.nav.plans, icon: "layers" },
    { href: "/admin/support", label: t.nav.support, icon: "life" },
    { href: "/admin/webhooks", label: t.nav.webhooks, icon: "webhook" },
    { href: "/admin/audit", label: t.nav.audit, icon: "audit" },
  ];
  return (
    <AppShell
      platformName={publicEnv.platformName}
      title={t.nav.admin}
      subtitle={t.roles.super_admin}
      nav={nav}
      footerNav={[{ href: "/admin/settings", label: t.nav.platformSettings, icon: "settings" }]}
      locale={locale}
      userEmail={user.email}
      signOutLabel={t.common.signOut}
      menuLabel={t.nav.menu}
      switchHref="/app"
      switchLabel={t.nav.switchBusiness}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}

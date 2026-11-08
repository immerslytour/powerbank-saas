import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Shield } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { Logo } from "@/components/shell/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Post-login router: picks the right workspace. */
export default async function AppHome() {
  const user = await requireUser("/app");
  const { t } = await getI18n();
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, status, tenants(id, name, slug, status)")
    .eq("user_id", user.id)
    .eq("status", "active");
  const list = (memberships ?? []).filter((m) => m.tenants);
  if (list.length === 1 && !user.isSuperAdmin) redirect(`/o/${list[0].tenants!.slug}`);
  if (list.length === 0 && user.isSuperAdmin) redirect("/admin");
  if (list.length === 0) redirect("/onboarding");
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-lg px-5 py-12">
        <Logo name={publicEnv.platformName} />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">{t.onboarding.chooseBusiness}</h1>
        <Card className="mt-6 divide-y divide-line">
          {user.isSuperAdmin && (
            <Link href="/admin" className="flex items-center gap-3 px-5 py-4 hover:bg-canvas">
              <Shield className="size-5 text-electric" />
              <span className="flex-1 font-medium">{t.nav.admin}</span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          )}
          {list.map((m) => (
            <Link key={m.tenants!.id} href={`/o/${m.tenants!.slug}`} className="flex items-center gap-3 px-5 py-4 hover:bg-canvas">
              <Building2 className="size-5 text-muted" />
              <span className="flex-1">
                <span className="block font-medium">{m.tenants!.name}</span>
                <span className="text-xs text-muted">{(t.roles as Record<string, string>)[m.role]}</span>
              </span>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          ))}
        </Card>
        <Button asChild variant="secondary" className="mt-6"><Link href="/onboarding">{t.onboarding.create}</Link></Button>
      </div>
    </div>
  );
}

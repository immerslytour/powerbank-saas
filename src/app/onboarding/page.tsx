import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { Logo } from "@/components/shell/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { CreateBusinessForm } from "@/components/onboarding/create-business-form";

export const metadata = { title: "Create your business" };

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  const { t, locale } = await getI18n();
  return (
    <div className="min-h-dvh bg-canvas bg-grid-light">
      <div className="mx-auto flex max-w-lg flex-col px-5 py-10">
        <div className="flex items-center justify-between">
          <Logo name={publicEnv.platformName} />
          <LanguageSwitcher locale={locale} />
        </div>
        <Card className="mt-10 animate-fade-up">
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{t.onboarding.title}</h1>
            <p className="mb-6 mt-1 text-sm text-muted">{t.onboarding.subtitle}</p>
            <CreateBusinessForm t={t} appHost={new URL(publicEnv.appUrl).host} />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted">{t.onboarding.invited}</p>
      </div>
    </div>
  );
}

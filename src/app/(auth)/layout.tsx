import Link from "next/link";
import { BatteryCharging, ShieldCheck, Wallet } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { Logo } from "@/components/shell/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-950 bg-grid p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[#2f7bff]/20 blur-3xl" />
        <Link href="/"><Logo name={publicEnv.platformName} dark /></Link>
        <div className="relative mt-auto max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8db6ff]">{t.landing.eyebrow}</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight">{t.landing.title}</h2>
          <ul className="mt-8 space-y-4 text-sm text-white/70">
            <li className="flex gap-3"><Wallet className="mt-0.5 size-4 text-[#6aa2ff]" />{t.landing.feature2Body}</li>
            <li className="flex gap-3"><BatteryCharging className="mt-0.5 size-4 text-[#6aa2ff]" />{t.landing.feature3Body}</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 text-[#6aa2ff]" />{t.landing.feature1Body}</li>
          </ul>
        </div>
      </section>
      <section className="flex flex-col bg-white">
        <div className="flex items-center justify-between p-5">
          <Link href="/" className="lg:invisible"><Logo name={publicEnv.platformName} /></Link>
          <LanguageSwitcher locale={locale} />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
      </section>
    </div>
  );
}

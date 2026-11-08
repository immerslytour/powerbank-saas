import Link from "next/link";
import { ArrowRight, BatteryCharging, Check, Palette, ShieldCheck, Wallet, BarChart3, MapPin } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils";
import { Logo } from "@/components/shell/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Button } from "@/components/ui/button";

function PhoneMock({ t }: { t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  return (
    <div className="relative mx-auto w-[280px] rotate-[-2deg] rounded-[34px] border-[7px] border-navy-800 bg-white shadow-[0_40px_80px_-30px_rgba(47,123,255,0.55)]">
      <div className="rounded-t-[26px] bg-[#0f2a5c] px-5 pb-6 pt-6 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-md bg-white/15">C</span>Café Volt</div>
        <div className="mt-5 text-xl font-semibold leading-tight">{t.customer.rentTitle}</div>
        <div className="mt-2 flex items-center gap-1 text-xs opacity-80"><MapPin className="size-3" />Tower District · Fresno</div>
      </div>
      <div className="-mt-3 space-y-3 px-4 pb-5">
        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-lg">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-electric text-white"><BatteryCharging className="size-4" /></span><span className="text-sm font-semibold">{fmt(t.customer.available, { n: 6 })}</span></div>
          <div className="flex gap-0.5">{Array.from({ length: 8 }).map((_, i) => <span key={i} className={`h-5 w-1 rounded-sm ${i < 6 ? "bg-electric" : "bg-line"}`} />)}</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
          {["$3.00", "$5.00", "$10.00"].map((v, i) => <div key={v} className="rounded-lg bg-canvas py-1.5"><div className="text-muted">{["1 h", "3 h", "24 h"][i]}</div><div className="font-semibold">{v}</div></div>)}
        </div>
        <div className="rounded-xl bg-electric py-3 text-center text-sm font-semibold text-white">{t.customer.payAndRent}</div>
      </div>
    </div>
  );
}

export default async function Landing() {
  const { t, locale } = await getI18n();
  const plans = isSupabaseConfigured()
    ? (await (await createClient()).from("plans").select("code, name, description, price_cents, currency, billing_interval, trial_days, machine_limit, features").eq("is_active", true).eq("is_public", true).order("sort_order")).data ?? []
    : [];
  const features = [
    { icon: <Palette />, title: t.landing.feature1, body: t.landing.feature1Body },
    { icon: <Wallet />, title: t.landing.feature2, body: t.landing.feature2Body },
    { icon: <ShieldCheck />, title: t.landing.feature3, body: t.landing.feature3Body },
  ];
  return (
    <div className="min-h-dvh bg-white">
      <section className="relative overflow-hidden bg-navy-950 bg-grid text-white">
        <div className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-[#2f7bff]/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -top-40 size-[420px] rounded-full bg-[#6aa2ff]/10 blur-3xl" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Logo name={publicEnv.platformName} dark />
          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} dark />
            <Button asChild variant="ghost" className="text-white hover:bg-white/10"><Link href="/login">{t.landing.ctaSecondary}</Link></Button>
          </div>
        </nav>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div className="animate-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#8db6ff]">{t.landing.eyebrow}</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{t.landing.title}</h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">{t.landing.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/signup">{t.landing.ctaPrimary}<ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="ghost" className="border border-white/15 text-white hover:bg-white/10"><Link href="/login">{t.landing.ctaSecondary}</Link></Button>
            </div>
          </div>
          <PhoneMock t={t} />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-20 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-line p-6">
            <div className="grid size-10 place-items-center rounded-xl bg-electric-50 text-electric [&_svg]:size-5">{f.icon}</div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
        <div className="flex items-center gap-4 rounded-2xl bg-canvas p-6 md:col-span-3">
          <BarChart3 className="size-6 text-electric" />
          <p className="text-sm text-muted">{t.analytics.subtitle}</p>
        </div>
      </section>

      {plans.length > 0 && (
        <section className="bg-canvas py-20">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-3xl font-semibold tracking-tight">{t.landing.pricingTitle}</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((p, i) => (
                <div key={p.code} className={`rounded-2xl border bg-white p-6 ${i === 1 ? "border-electric shadow-[var(--shadow-pop)]" : "border-line"}`}>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-muted">{p.description}</p>
                  <div className="mt-4"><span className="tabular text-4xl font-semibold">{formatMoney(p.price_cents, p.currency, locale)}</span><span className="text-muted">{p.billing_interval === "year" ? t.landing.perYear : t.landing.perMonth}</span></div>
                  {p.trial_days > 0 && <div className="mt-1 text-xs text-electric">{fmt(t.landing.trial, { n: p.trial_days })}</div>}
                  <ul className="mt-5 space-y-2 text-sm">
                    <li className="flex gap-2"><Check className="size-4 text-electric" />{fmt(t.subscription.upTo, { n: p.machine_limit })}</li>
                    {Object.entries((p.features ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => (
                      <li key={k} className="flex gap-2"><Check className="size-4 text-electric" />{(t.subscription.features as Record<string, string>)[k] ?? k}</li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6 w-full" variant={i === 1 ? "primary" : "secondary"}><Link href="/signup">{t.landing.ctaPrimary}</Link></Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <footer className="border-t border-line py-8 text-center text-xs text-muted">© {new Date().getFullYear()} {publicEnv.platformName}</footer>
    </div>
  );
}

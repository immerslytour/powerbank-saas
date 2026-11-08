import type { Metadata } from "next";
import { AlertTriangle, BatteryCharging, MapPin, WifiOff } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { publicEnv, isStripeConfigured, serverEnv, isServiceRoleConfigured } from "@/lib/env";
import { loadPublicMachine } from "@/lib/public-rental";
import { getPlatformSetting } from "@/lib/rentals/deps";
import { priceExamples } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";
import { CustomerShell } from "@/components/customer/shell";
import { RentForm, DualRentForms } from "@/components/customer/rent-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rent a power bank", robots: { index: false } };

export default async function RentPage(props: PageProps<"/r/[code]">) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const { t, locale } = await getI18n();
  const info = isServiceRoleConfigured() ? await loadPublicMachine(code) : null;
  if (!info) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto size-10 text-warning" />
          <h1 className="mt-4 text-xl font-semibold">{t.customer.notFound}</h1>
          <p className="mt-2 text-sm text-muted">{t.customer.notFoundBody}</p>
        </div>
      </div>
    );
  }
  const { machine, brand, pricing: p, tenant, location, stripe } = info;
  const money = (c: number) => formatMoney(c, p.currency, locale);
  const payments = await getPlatformSetting<{ allow_simulated_payments?: boolean }>("payments");
  const simAllowed = machine.is_simulated && serverEnv().allowSimulatedPayments && payments?.allow_simulated_payments !== false;
  const stripeAllowed = isStripeConfigured() && !!stripe.account_id && stripe.charges_enabled && stripe.status !== "disconnected";
  let blocker: string | null = null;
  if (tenant.status !== "active" || !tenant.subscription_ok) blocker = t.customer.operatorUnavailable;
  else if (machine.state !== "active") blocker = t.customer.unavailable;
  else if (machine.connection_status !== "online") blocker = t.customer.offline;
  else if (machine.available_batteries < 1) blocker = t.customer.noneAvailable;
  else if (!stripeAllowed && !simAllowed) blocker = t.errors.PAYMENTS_NOT_ENABLED;
  const canRent = !blocker;

  return (
    <CustomerShell brand={brand} t={t} locale={locale} platformName={publicEnv.platformName}>
      {machine.is_simulated && (
        <div className="-mx-4 mb-4 bg-[repeating-linear-gradient(135deg,#fff3d6,#fff3d6_10px,#ffe8b3_10px,#ffe8b3_20px)] px-5 py-2.5 text-center text-xs font-semibold text-[#7a5200]">
          {t.customer.simBanner}
        </div>
      )}
      <section className="relative -mx-4 overflow-hidden px-5 pb-8 pt-6 text-white" style={{ background: brand.primary_color }}>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{brand.checkout_headline || t.customer.rentTitle}</h1>
        {brand.portal_message && <p className="mt-2 text-sm opacity-85">{brand.portal_message}</p>}
        {location && (
          <p className="mt-3 flex items-center gap-1.5 text-sm opacity-90"><MapPin className="size-4" />{location.name}{location.address ? ` · ${location.address}` : ""}</p>
        )}
      </section>

      <div className="-mt-5 space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: brand.accent_color }}>
              {machine.connection_status === "online" ? <BatteryCharging className="size-5" /> : <WifiOff className="size-5" />}
            </span>
            <div>
              <div className="font-semibold">{machine.connection_status === "online" ? fmt(t.customer.available, { n: machine.available_batteries }) : t.customer.offline}</div>
              <div className="font-mono text-xs text-muted">#{machine.code}</div>
            </div>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: Math.min(machine.total_slots, 12) }).map((_, i) => (
              <span key={i} className="h-6 w-1.5 rounded-sm" style={{ background: i < machine.available_batteries ? brand.accent_color : "#e6e9f0" }} />
            ))}
          </div>
        </div>

        {sp.cancelled && <div className="rounded-xl bg-white p-3 text-center text-sm text-muted shadow-sm">{t.customer.paymentCancelled}</div>}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t.customer.pricing}</h2>
          <ul className="space-y-2 text-[15px]">
            {p.free_minutes > 0 && <li className="font-medium" style={{ color: brand.accent_color }}>{fmt(t.customer.freePeriod, { n: p.free_minutes })}</li>}
            <li className="flex justify-between"><span>{t.customer.initialFee}</span><span className="tabular font-semibold">{money(p.initial_fee_cents)}</span></li>
            <li>{fmt(t.customer.hourly, { price: money(p.hourly_rate_cents) })}</li>
            {p.daily_rate_cents > 0 && <li>{fmt(t.customer.dailyCap, { price: money(p.daily_rate_cents) })}</li>}
            {p.late_fee_cents > 0 && p.late_after_hours && <li>{fmt(t.customer.lateFee, { price: money(p.late_fee_cents), n: p.late_after_hours })}</li>}
            <li className="text-sm text-muted">{fmt(t.customer.maxCharge, { price: money(p.max_charge_cents) })}</li>
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {priceExamples(p).map((e) => (
              <div key={e.minutes} className="rounded-xl bg-canvas px-2 py-2 text-center">
                <div className="text-xs text-muted">{e.minutes < 1440 ? `${e.minutes / 60} h` : "24 h"}</div>
                <div className="tabular font-semibold">{money(e.total)}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-canvas p-3 text-[13px] text-muted">{fmt(t.customer.holdNotice, { price: money(p.max_charge_cents) })}</p>
        </div>

        {(p.terms_text || p.refund_policy) && (
          <div className="space-y-2">
            {p.terms_text && (
              <details className="rounded-2xl bg-white p-4 text-sm shadow-sm">
                <summary className="cursor-pointer font-medium">{t.customer.terms}</summary>
                <p className="mt-2 whitespace-pre-wrap text-muted">{p.terms_text}</p>
              </details>
            )}
            {p.refund_policy && (
              <details className="rounded-2xl bg-white p-4 text-sm shadow-sm">
                <summary className="cursor-pointer font-medium">{t.customer.refundPolicy}</summary>
                <p className="mt-2 whitespace-pre-wrap text-muted">{p.refund_policy}</p>
              </details>
            )}
          </div>
        )}

        {blocker && <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-center text-sm font-medium">{blocker}</div>}

        <div className="rounded-2xl bg-white/70 p-1">
          {stripeAllowed && simAllowed ? (
            <DualRentForms t={t} code={machine.code} accent={brand.accent_color} canRent={canRent} />
          ) : (
            <RentForm t={t} code={machine.code} accent={brand.accent_color} canRent={canRent} allowStripe={stripeAllowed} allowSim={!stripeAllowed && simAllowed} />
          )}
        </div>
      </div>
    </CustomerShell>
  );
}

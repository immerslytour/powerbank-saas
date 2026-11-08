import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTenant, ROLE_RANK } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { formatDateTime, formatDuration, formatMoney } from "@/lib/utils";
import { computeCharge, rentalMinutes, type Pricing } from "@/lib/pricing";
import { PageHeader, KeyValue, Alert } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, SimBadge } from "@/components/ui/status-badge";
import { CancelRentalButton, RetryUnlockButton, RefundDialog } from "@/components/rentals/rental-actions";

export default async function RentalDetail(props: PageProps<"/o/[slug]/rentals/[id]">) {
  const { slug, id } = await props.params;
  const ctx = await requireTenant(slug);
  const { t, locale } = await getI18n();
  const tz = ctx.tenant.timezone;
  const isMgr = ctx.rank >= ROLE_RANK.manager;
  const { data: r } = await ctx.supabase
    .from("rentals")
    .select("*, machines!rentals_machine_id_tenant_id_fkey(id, name, device_id), locations!rentals_location_id_tenant_id_fkey(id, name), customers!rentals_customer_id_tenant_id_fkey(id, email)")
    .eq("id", id)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
  if (!r) notFound();
  const [{ data: events }, paymentsRes, refundsRes] = await Promise.all([
    ctx.supabase.from("device_events").select("id, event_type, severity, source, occurred_at, payload, is_simulated").eq("rental_id", id).order("occurred_at"),
    isMgr ? ctx.supabase.from("payments").select("*").eq("rental_id", id).order("created_at") : Promise.resolve({ data: [] }),
    isMgr ? ctx.supabase.from("refunds").select("*").eq("rental_id", id).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const payments = (paymentsRes.data ?? []) as Array<Record<string, unknown> & { id: string; provider: string; status: string; amount_captured_cents: number; amount_refunded_cents: number; amount_authorized_cents: number; stripe_payment_intent_id: string | null; livemode: boolean; currency: string }>;
  const refunds = (refundsRes.data ?? []) as Array<{ id: string; amount_cents: number; status: string; reason: string | null; created_at: string; stripe_refund_id: string | null; currency: string }>;
  const p = r.pricing_snapshot as unknown as Pricing;
  const end = r.returned_at ?? new Date().toISOString();
  const mins = r.started_at ? rentalMinutes(r.started_at, end) : 0;
  const live = r.started_at ? computeCharge(p, mins) : null;
  return (
    <>
      <Link href={`/o/${slug}/rentals`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t.rentals.title}</Link>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2 font-mono text-xl">{r.id.slice(0, 8)} <StatusBadge status={r.status} t={t} /> {r.is_simulated && <SimBadge t={t} />}</span>}
        subtitle={formatDateTime(r.created_at, locale, tz)}
        actions={isMgr && (
          <>
            {r.status === "pending" && r.payment_status === "authorized" && <RetryUnlockButton t={t} tenantId={ctx.tenant.id} rentalId={r.id} />}
            {r.status === "pending" && <CancelRentalButton t={t} tenantId={ctx.tenant.id} rentalId={r.id} />}
          </>
        )}
      />
      {r.failure_reason && <Alert tone={r.status === "failed" ? "danger" : "warning"} className="mb-4" title={t.rentals.failureReason}>{r.failure_reason}</Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent>
              <KeyValue items={[
                [t.rentals.machine, r.machines ? <Link className="text-electric" href={`/o/${slug}/machines/${r.machines.id}`}>{r.machines.name ?? r.machines.device_id}</Link> : "—"],
                [t.machines.location, r.locations?.name ?? "—"],
                [t.rentals.customer, r.customers?.email ?? "—"],
                [t.rentals.battery, r.battery_serial ? <span className="font-mono">{r.battery_serial}{r.slot_number ? ` · ${t.machines.slot} ${r.slot_number}` : ""}</span> : "—"],
                [t.rentals.started, formatDateTime(r.started_at, locale, tz)],
                [t.rentals.returnedAt, formatDateTime(r.returned_at, locale, tz)],
                [t.rentals.duration, r.started_at ? formatDuration(mins, locale) : "—"],
                [t.rentals.authorized, formatMoney(r.authorized_cents, r.currency, locale)],
                [t.rentals.amount, <span key="a" className="tabular">{formatMoney(r.amount_cents, r.currency, locale)}{r.status === "active" && live ? ` (${t.customer.currentCharge}: ${formatMoney(live.total, r.currency, locale)})` : ""}</span>],
                [t.rentals.payment, <StatusBadge key="p" status={r.payment_status} t={t} />],
                [t.rentals.refundStatus, <StatusBadge key="rf" status={r.refund_status} t={t} />],
                [t.rentals.unlockAttempts, r.unlock_attempts],
                [t.rentals.stripeRef, <span key="s" className="font-mono text-xs">{r.stripe_payment_intent_id ?? "—"}</span>],
              ]} />
            </CardContent>
          </Card>
          {isMgr && (
            <Card>
              <CardHeader><CardTitle>{t.nav.payments}</CardTitle></CardHeader>
              <Table>
                <THead><tr><TH>ID</TH><TH>{t.common.status}</TH><TH className="text-right">{t.payments.authorized}</TH><TH className="text-right">{t.payments.captured}</TH><TH className="text-right">{t.payments.refunded}</TH><TH /></tr></THead>
                <tbody>
                  {payments.map((pay) => (
                    <TR key={pay.id}>
                      <TD className="font-mono text-xs">{pay.stripe_payment_intent_id ?? pay.id.slice(0, 8)} {pay.provider === "simulated" ? <SimBadge t={t} /> : !pay.livemode ? <span className="text-[10px] uppercase text-warning">test</span> : null}</TD>
                      <TD><StatusBadge status={pay.status} t={t} /></TD>
                      <TD className="tabular text-right">{formatMoney(pay.amount_authorized_cents, pay.currency, locale)}</TD>
                      <TD className="tabular text-right">{formatMoney(pay.amount_captured_cents, pay.currency, locale)}</TD>
                      <TD className="tabular text-right">{formatMoney(pay.amount_refunded_cents, pay.currency, locale)}</TD>
                      <TD className="text-right">
                        {["succeeded", "partially_refunded"].includes(pay.status) && pay.amount_captured_cents > pay.amount_refunded_cents && (
                          <RefundDialog t={t} tenantId={ctx.tenant.id} paymentId={pay.id} refundable={pay.amount_captured_cents - pay.amount_refunded_cents} />
                        )}
                      </TD>
                    </TR>
                  ))}
                  {refunds.map((rf) => (
                    <TR key={rf.id} className="bg-canvas/40">
                      <TD className="pl-8 font-mono text-xs">↳ {rf.stripe_refund_id ?? rf.id.slice(0, 8)}</TD>
                      <TD><StatusBadge status={rf.status} t={t} /></TD>
                      <TD colSpan={2} className="text-xs text-muted">{rf.reason ?? ""}</TD>
                      <TD className="tabular text-right">−{formatMoney(rf.amount_cents, rf.currency, locale)}</TD>
                      <TD />
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t.rentals.timeline}</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-3 border-l border-line pl-5">
                {(events ?? []).map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${e.severity === "error" ? "bg-danger" : e.severity === "warning" ? "bg-warning" : "bg-electric"}`} />
                    <div className="text-sm font-medium">{e.event_type.replaceAll("_", " ")}</div>
                    <div className="text-xs text-muted">{formatDateTime(e.occurred_at, locale, tz)} · {e.source}</div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.rentals.pricingSnapshot}</CardTitle></CardHeader>
            <CardContent>
              <KeyValue items={[
                [t.settings.initialFee, formatMoney(p.initial_fee_cents, p.currency, locale)],
                [t.settings.freeMinutes, p.free_minutes],
                [t.settings.hourlyRate, formatMoney(p.hourly_rate_cents, p.currency, locale)],
                [t.settings.dailyRate, formatMoney(p.daily_rate_cents, p.currency, locale)],
                [t.settings.maxCharge, formatMoney(p.max_charge_cents, p.currency, locale)],
              ]} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

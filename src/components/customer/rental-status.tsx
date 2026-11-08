"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle, BatteryCharging, Clock, AlertTriangle } from "lucide-react";
import { fmt, type Dict } from "@/lib/i18n/format";
import { formatDuration, formatMoney } from "@/lib/utils";

type S = {
  id: string; status: string; paymentStatus: string; amount: number; refunded: number; authorized: number; currency: string;
  startedAt: string | null; returnedAt: string | null; slot: number | null; isSimulated: boolean; liveCharge: number | null; machineCode: string | null;
};

export function RentalStatusView({ t, token, initial, accent, locale, returnText }: { t: Dict; token: string; initial: S; accent: string; locale: string; returnText: string }) {
  const [s, setS] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const live = s.status === "pending" || s.status === "active";
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/rental/${token}`, { cache: "no-store" });
        if (res.ok) setS(await res.json());
      } catch {
        /* offline: keep last state */
      }
      setNow(Date.now());
    }, s.status === "pending" ? 2500 : 15000);
    return () => clearInterval(iv);
  }, [token, live, s.status]);

  const money = (c: number) => formatMoney(c, s.currency, locale);
  const elapsed = s.startedAt ? ((s.returnedAt ? new Date(s.returnedAt).getTime() : now) - new Date(s.startedAt).getTime()) / 60000 : 0;
  let icon = <Loader2 className="size-10 animate-spin" style={{ color: accent }} />;
  let title = t.customer.statusPending;
  let body: string | null = null;
  if (s.status === "pending" && s.paymentStatus === "authorized") title = t.customer.statusUnlocking;
  if (s.status === "active") {
    icon = <BatteryCharging className="size-10" style={{ color: accent }} />;
    title = t.customer.statusActive;
    body = fmt(t.customer.statusActiveBody, { slot: s.slot ?? "—", time: new Date(s.startedAt!).toLocaleTimeString(locale === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" }) });
  } else if (s.status === "returned") {
    icon = <CheckCircle2 className="size-10 text-success" />;
    title = t.customer.statusReturned;
    body = fmt(t.customer.statusReturnedBody, { amount: money(s.amount - s.refunded) });
  } else if (s.status === "failed") {
    icon = <XCircle className="size-10 text-danger" />;
    title = t.customer.statusFailed;
    body = t.customer.statusFailedBody;
  } else if (s.status === "cancelled") {
    icon = <XCircle className="size-10 text-muted" />;
    title = t.customer.statusCancelled;
  } else if (s.status === "overdue") {
    icon = <AlertTriangle className="size-10 text-warning" />;
    title = t.customer.statusOverdue;
    body = t.customer.statusOverdueBody;
  }
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 text-center shadow-[var(--shadow-pop)]">
        <div className="mx-auto grid size-16 place-items-center">{icon}</div>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        {body && <p className="mt-1 text-sm text-muted">{body}</p>}
        {s.status === "active" && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-canvas p-3"><div className="flex items-center justify-center gap-1 text-xs text-muted"><Clock className="size-3" />{t.customer.elapsed}</div><div className="tabular mt-1 text-lg font-semibold">{formatDuration(elapsed, locale)}</div></div>
            <div className="rounded-xl bg-canvas p-3"><div className="text-xs text-muted">{t.customer.currentCharge}</div><div className="tabular mt-1 text-lg font-semibold">{money(s.liveCharge ?? 0)}</div></div>
          </div>
        )}
      </div>
      {(s.status === "active" || s.status === "overdue") && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">{t.customer.returnTitle}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{returnText}</p>
        </div>
      )}
      <div className="text-center font-mono text-xs text-muted">{t.customer.rentalId}: {s.id.slice(0, 8)}</div>
    </div>
  );
}

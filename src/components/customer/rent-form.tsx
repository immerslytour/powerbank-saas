"use client";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useFormStatus } from "react-dom";
import { ActionForm } from "@/components/ui/form";
import { startRentalAction } from "@/lib/actions/customer";
import type { Dict } from "@/lib/i18n/format";

function PayButton({ label, disabled, accent, sim }: { label: string; disabled: boolean; accent: string; sim?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold shadow-lg transition active:scale-[0.99] disabled:opacity-40 ${sim ? "border-2 border-dashed border-[#c89b3c] bg-[#fff7e6] text-[#7a5200] shadow-none" : "text-white"}`}
      style={sim ? undefined : { background: accent }}
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : !sim && <Lock className="size-4" />}
      {label}
    </button>
  );
}

export function RentForm({ t, code, accent, canRent, allowStripe, allowSim }: { t: Dict; code: string; accent: string; canRent: boolean; allowStripe: boolean; allowSim: boolean }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <ActionForm action={startRentalAction} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <label className="block">
        <span className="text-[13px] font-medium">{t.customer.email}</span>
        <input name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@email.com" className="mt-1.5 h-12 w-full rounded-xl border border-line bg-white px-4 text-base outline-none focus:border-[var(--brand-accent)] focus:ring-4 focus:ring-black/5" />
      </label>
      <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm shadow-sm">
        <input type="checkbox" name="accept" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand-accent)]" />
        <span>{t.customer.acceptTerms}</span>
      </label>
      <div className="space-y-2.5">
        {allowStripe && (
          <div>
            <input type="hidden" name="method" value="stripe" />
            <PayButton label={t.customer.payAndRent} disabled={!canRent || !accepted} accent={accent} />
          </div>
        )}
      </div>
      {allowSim && !allowStripe && <input type="hidden" name="method" value="simulated" />}
      {allowSim && !allowStripe && <PayButton sim label={t.customer.payAndRentSim} disabled={!canRent || !accepted} accent={accent} />}
    </ActionForm>
  );
}

/** When both are possible (simulated station with Stripe connected), render two separate forms. */
export function DualRentForms(props: { t: Dict; code: string; accent: string; canRent: boolean }) {
  return (
    <div className="space-y-6">
      <RentForm {...props} allowStripe allowSim={false} />
      <div className="text-center text-xs uppercase tracking-wide text-muted">— {props.t.common.simulated} —</div>
      <RentForm {...props} allowStripe={false} allowSim />
    </div>
  );
}

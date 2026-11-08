import { z } from "zod";

/**
 * Rental pricing. All amounts are integer minor units (cents).
 * The same function is used to display price examples to customers and to
 * compute the final capture on the server, so customers are never charged
 * differently from what they were shown.
 */
export const pricingSchema = z
  .object({
    currency: z.string().regex(/^[a-z]{3}$/),
    initial_fee_cents: z.number().int().min(0).max(100_000),
    free_minutes: z.number().int().min(0).max(1440),
    hourly_rate_cents: z.number().int().min(0).max(100_000),
    daily_rate_cents: z.number().int().min(0).max(1_000_000),
    max_charge_cents: z.number().int().min(50).max(1_000_000),
    late_fee_cents: z.number().int().min(0).max(100_000),
    late_after_hours: z.number().int().min(1).max(720).nullable(),
    overdue_after_hours: z.number().int().min(1).max(160),
    refund_window_days: z.number().int().min(0).max(180),
    refund_policy: z.string().max(4000).nullable().optional(),
    terms_text: z.string().max(10000).nullable().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.initial_fee_cents > p.max_charge_cents)
      ctx.addIssue({ code: "custom", path: ["initial_fee_cents"], message: "initial_fee_exceeds_max" });
    if (p.daily_rate_cents > p.max_charge_cents)
      ctx.addIssue({ code: "custom", path: ["daily_rate_cents"], message: "daily_exceeds_max" });
    if (p.daily_rate_cents > 0 && p.hourly_rate_cents > p.daily_rate_cents)
      ctx.addIssue({ code: "custom", path: ["hourly_rate_cents"], message: "hourly_exceeds_daily" });
  });

export type Pricing = z.infer<typeof pricingSchema>;

export type ChargeBreakdown = {
  minutes: number;
  billableMinutes: number;
  initialFee: number;
  timeCharge: number;
  lateFee: number;
  capped: boolean;
  total: number;
};

const MINUTE = 60_000;

export function rentalMinutes(startedAt: Date | string, endedAt: Date | string): number {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  // Bill per started minute, ignoring sub-second clock noise between systems.
  const seconds = Math.floor(ms / 1000);
  return Math.ceil((seconds * 1000) / MINUTE);
}

/**
 * Charge rules:
 *  - Returned within the free period => 0.
 *  - Otherwise: initial fee + time charge for minutes beyond the free period.
 *  - Time charge: each started hour costs hourly_rate, but a calendar-free 24h
 *    block never costs more than daily_rate (daily cap). Full days cost daily_rate.
 *  - Optional late fee once the rental exceeds late_after_hours.
 *  - The total never exceeds max_charge (the amount pre-authorized up front).
 */
export function computeCharge(p: Pick<Pricing,
  "initial_fee_cents" | "free_minutes" | "hourly_rate_cents" | "daily_rate_cents" |
  "max_charge_cents" | "late_fee_cents" | "late_after_hours">, minutes: number): ChargeBreakdown {
  const m = Math.max(0, Math.ceil(minutes));
  if (m <= p.free_minutes) {
    return { minutes: m, billableMinutes: 0, initialFee: 0, timeCharge: 0, lateFee: 0, capped: false, total: 0 };
  }
  const billable = m - p.free_minutes;
  const days = Math.floor(billable / 1440);
  const remainder = billable % 1440;
  const hourlyPart = Math.ceil(remainder / 60) * p.hourly_rate_cents;
  const dailyCap = p.daily_rate_cents > 0 ? p.daily_rate_cents : Number.POSITIVE_INFINITY;
  const dayRate = p.daily_rate_cents > 0 ? p.daily_rate_cents : 24 * p.hourly_rate_cents;
  const timeCharge = days * dayRate + Math.min(hourlyPart, dailyCap);
  const lateFee =
    p.late_after_hours != null && p.late_fee_cents > 0 && m > p.late_after_hours * 60 ? p.late_fee_cents : 0;
  const raw = p.initial_fee_cents + timeCharge + lateFee;
  const total = Math.min(raw, p.max_charge_cents);
  return {
    minutes: m,
    billableMinutes: billable,
    initialFee: p.initial_fee_cents,
    timeCharge,
    lateFee,
    capped: raw > p.max_charge_cents,
    total,
  };
}

/** Example prices displayed before payment (1h, 3h, 24h). */
export function priceExamples(p: Parameters<typeof computeCharge>[0]) {
  return [60, 180, 1440].map((minutes) => ({ minutes, total: computeCharge(p, minutes).total }));
}

/** Parse a user-entered money string like "2.50" into cents. */
export function parseMoneyToCents(input: FormDataEntryValue | null | undefined): number {
  const s = String(input ?? "").trim().replace(/[^0-9.,-]/g, "").replace(",", ".");
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid_amount");
  return Math.round(n * 100);
}

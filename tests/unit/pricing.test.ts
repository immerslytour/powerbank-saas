import { describe, it, expect } from "vitest";
import { computeCharge, rentalMinutes, pricingSchema, parseMoneyToCents, priceExamples } from "@/lib/pricing";

const P = { initial_fee_cents: 100, free_minutes: 5, hourly_rate_cents: 150, daily_rate_cents: 800, max_charge_cents: 3000, late_fee_cents: 0, late_after_hours: null };

describe("pricing", () => {
  it("free period charges nothing", () => {
    expect(computeCharge(P, 0).total).toBe(0);
    expect(computeCharge(P, 5).total).toBe(0);
  });
  it("charges initial fee + started hours after the free period", () => {
    expect(computeCharge(P, 6).total).toBe(250); // 1 billable minute -> 1 hour
    expect(computeCharge(P, 65).total).toBe(250); // 60 billable -> 1 hour
    expect(computeCharge(P, 66).total).toBe(400); // 61 billable -> 2 hours
  });
  it("applies the daily cap within a 24h block", () => {
    expect(computeCharge(P, 5 + 10 * 60).total).toBe(100 + 800); // 10h would be 1500, capped at 800
  });
  it("charges full days at the daily rate plus remainder", () => {
    // 1 day + 2h billable: 100 + 800 + 300
    expect(computeCharge(P, 5 + 1440 + 120).total).toBe(1200);
  });
  it("never exceeds the maximum charge (the authorized hold)", () => {
    const r = computeCharge(P, 10 * 1440);
    expect(r.total).toBe(3000);
    expect(r.capped).toBe(true);
  });
  it("applies late fee only after the threshold", () => {
    const p = { ...P, late_fee_cents: 500, late_after_hours: 24 };
    expect(computeCharge(p, 23 * 60).lateFee).toBe(0);
    expect(computeCharge(p, 25 * 60).lateFee).toBe(500);
  });
  it("works without a daily cap", () => {
    const p = { ...P, daily_rate_cents: 0, max_charge_cents: 100000 };
    expect(computeCharge(p, 5 + 30 * 60).total).toBe(100 + 30 * 150);
  });
  it("rounds rental minutes up per started minute but ignores sub-second noise", () => {
    const s = new Date("2026-01-01T00:00:00Z");
    expect(rentalMinutes(s, new Date(s.getTime() + 60_000 + 400))).toBe(1);
    expect(rentalMinutes(s, new Date(s.getTime() + 61_000))).toBe(2);
    expect(rentalMinutes(s, s)).toBe(0);
    expect(rentalMinutes(s, new Date(s.getTime() - 5000))).toBe(0);
  });
  it("price examples are computed with the same engine", () => {
    expect(priceExamples(P).map((e) => e.total)).toEqual([250, 550, 900]);
  });
  it("validates pricing server-side", () => {
    const base = { currency: "usd", ...P, overdue_after_hours: 72, refund_window_days: 30 };
    expect(pricingSchema.safeParse(base).success).toBe(true);
    expect(pricingSchema.safeParse({ ...base, initial_fee_cents: 5000 }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...base, hourly_rate_cents: 900 }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...base, currency: "US" }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...base, free_minutes: -1 }).success).toBe(false);
  });
  it("parses money input safely", () => {
    expect(parseMoneyToCents("2.50")).toBe(250);
    expect(parseMoneyToCents("2,5")).toBe(250);
    expect(parseMoneyToCents("$10")).toBe(1000);
    expect(parseMoneyToCents("")).toBe(0);
  });
});

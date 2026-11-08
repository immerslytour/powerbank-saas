import { describe, it, expect, beforeAll } from "vitest";
import Stripe from "stripe";
import { mapAccount } from "@/lib/stripe/connect-status";
import { mapSubscription } from "@/lib/stripe/subscription-sync";
import { encryptJson, decryptJson, sha256Hex, safeEqual } from "@/lib/crypto";
import { randomBytes } from "node:crypto";

const acct = (o: Partial<Stripe.Account>) =>
  ({ charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements: { currently_due: [], past_due: [], disabled_reason: null }, business_profile: { name: "X" }, country: "US", default_currency: "usd", controller: { stripe_dashboard: { type: "full" } }, ...o }) as unknown as Stripe.Account;

describe("Stripe Connect onboarding state", () => {
  it("incomplete onboarding", () => {
    expect(mapAccount(acct({ details_submitted: false })).status).toBe("onboarding_incomplete");
  });
  it("fully active", () => {
    const r = mapAccount(acct({ details_submitted: true, charges_enabled: true, payouts_enabled: true }));
    expect(r.status).toBe("active");
    expect(r.details.charges_enabled).toBe(true);
  });
  it("restricted when requirements are due or charges disabled", () => {
    expect(mapAccount(acct({ details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: null } as never })).status).toBe("restricted");
    const r = mapAccount(acct({ details_submitted: true, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: [], past_due: ["individual.verification.document"], disabled_reason: "requirements.past_due" } as never }));
    expect(r.status).toBe("restricted");
    expect(r.details.disabled_reason).toBe("requirements.past_due");
  });
});

describe("Stripe Billing subscription mapping", () => {
  it("maps status, price, trial and period end (item-level period)", () => {
    const sub = {
      id: "sub_1", status: "trialing", customer: "cus_1", cancel_at_period_end: false, canceled_at: null,
      trial_end: 1800000000, metadata: { tenant_id: "t1" },
      items: { data: [{ price: { id: "price_growth" }, current_period_end: 1800000000 }] },
    } as unknown as Stripe.Subscription;
    const m = mapSubscription(sub);
    expect(m).toMatchObject({ status: "trialing", stripe_price_id: "price_growth", stripe_customer_id: "cus_1", tenant_id: "t1", cancel_at_period_end: false });
    expect(m.trial_ends_at).toBe(new Date(1800000000 * 1000).toISOString());
    expect(m.current_period_end).toBe(new Date(1800000000 * 1000).toISOString());
  });
});

describe("Stripe webhook signature verification", () => {
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "account.updated", data: { object: {} } });
  it("accepts a correctly signed payload", async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const ev = await stripe.webhooks.constructEventAsync(payload, header, secret);
    expect(ev.id).toBe("evt_1");
  });
  it("rejects tampered payloads and wrong secrets", async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    await expect(stripe.webhooks.constructEventAsync(payload.replace("evt_1", "evt_2"), header, secret)).rejects.toThrow();
    await expect(stripe.webhooks.constructEventAsync(payload, header, "whsec_other")).rejects.toThrow();
  });
});

describe("secrets", () => {
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  it("encrypts provider credentials with AES-GCM and detects tampering", () => {
    const c = encryptJson({ apiKey: "secret" });
    expect(c.startsWith("v1.")).toBe(true);
    expect(decryptJson(c)).toEqual({ apiKey: "secret" });
    const parts = c.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });
  it("hashes tokens and compares in constant time", () => {
    expect(sha256Hex("abc")).toHaveLength(64);
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

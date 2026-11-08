import "server-only";
import Stripe from "stripe";
import { serverEnv } from "../env";

let cached: Stripe | null = null;

/** Platform Stripe client. Connected-account calls pass { stripeAccount } per request. */
export function getStripe(): Stripe {
  const key = serverEnv().stripeSecretKey;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!cached) {
    cached = new Stripe(key, {
      appInfo: { name: "Voltaje Power Bank SaaS", version: "1.0.0" },
      maxNetworkRetries: 2,
    });
  }
  return cached;
}

export function stripeMode(): "test" | "live" | null {
  const key = serverEnv().stripeSecretKey;
  if (!key) return null;
  return key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test";
}

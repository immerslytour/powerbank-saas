import type Stripe from "stripe";

export type LocalSubStatus =
  | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

/** Pure mapping from a Stripe Subscription to our subscriptions row (unit tested). */
export function mapSubscription(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const periodEnd =
    (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return {
    status: sub.status as LocalSubStatus,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    stripe_price_id: priceId,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    tenant_id: (sub.metadata?.tenant_id as string | undefined) ?? null,
  };
}

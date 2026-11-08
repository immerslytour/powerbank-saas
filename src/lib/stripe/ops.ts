import type Stripe from "stripe";
import type { StripeOps } from "../rentals/engine";

/** Direct-charge operations executed ON the operator's connected account. */
export function createStripeOps(stripe: Stripe): StripeOps {
  return {
    async capture({ paymentIntentId, account, amount, applicationFee, idempotencyKey }) {
      const pi = await stripe.paymentIntents.capture(
        paymentIntentId,
        { amount_to_capture: amount, ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}) },
        { stripeAccount: account, idempotencyKey },
      );
      const charge = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
      return { chargeId: charge };
    },
    async cancel({ paymentIntentId, account, idempotencyKey }) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: account });
      if (pi.status === "canceled" || pi.status === "succeeded") return;
      await stripe.paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: account, idempotencyKey });
    },
    async refund({ paymentIntentId, account, amount, idempotencyKey, reason }) {
      const r = await stripe.refunds.create(
        { payment_intent: paymentIntentId, amount, metadata: reason ? { reason: reason.slice(0, 450) } : undefined },
        { stripeAccount: account, idempotencyKey },
      );
      return { refundId: r.id, status: r.status ?? "pending" };
    },
  };
}

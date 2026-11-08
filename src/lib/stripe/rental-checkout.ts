import "server-only";
import { getStripe } from "./client";
import { adminRpc } from "../rentals/deps";
import { rpcOrThrow } from "../rpc";

/**
 * Hosted Checkout on the OPERATOR's connected account (direct charge) that
 * pre-authorizes the maximum charge (manual capture). The final amount is
 * captured only after the hardware confirms the return.
 */
export async function createRentalCheckout(opts: {
  rentalId: string;
  tenantId: string;
  account: string;
  amount: number;
  currency: string;
  operatorName: string;
  machineCode: string;
  locale: "en" | "es";
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  const description =
    opts.locale === "es"
      ? `Retención temporal. Solo se cobra el tiempo de uso al devolver el power bank. Estación ${opts.machineCode}.`
      : `Temporary hold. You're only charged for the time used when you return the power bank. Station ${opts.machineCode}.`;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: opts.currency,
            unit_amount: opts.amount,
            product_data: {
              name: opts.locale === "es" ? `Renta de power bank — ${opts.operatorName}` : `Power bank rental — ${opts.operatorName}`,
              description,
            },
          },
        },
      ],
      payment_intent_data: {
        capture_method: "manual",
        description,
        metadata: { rental_id: opts.rentalId, tenant_id: opts.tenantId },
      },
      metadata: { rental_id: opts.rentalId, tenant_id: opts.tenantId },
      client_reference_id: opts.rentalId,
      customer_email: opts.email ?? undefined,
      customer_creation: "always",
      locale: opts.locale,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    },
    { stripeAccount: opts.account, idempotencyKey: `rental-checkout-${opts.rentalId}` },
  );
  await rpcOrThrow(adminRpc(), "rental_attach_checkout", { p_rental: opts.rentalId, p_session_id: session.id });
  return session.url!;
}

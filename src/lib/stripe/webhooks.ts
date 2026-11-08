/**
 * Stripe webhook handlers.
 *
 *  - Platform endpoint  (/api/webhooks/stripe):          SaaS subscription billing (operator -> platform)
 *  - Connect endpoint   (/api/webhooks/stripe-connect):  customer rental payments on operators' accounts
 *
 * Signatures are verified by the route handlers before these run. Each event is
 * claimed atomically (webhook_claim) so retries and concurrent deliveries are
 * processed at most once successfully.
 */
import type Stripe from "stripe";
import type { RpcClient } from "../rpc";
import { rpcOrThrow } from "../rpc";
import { getContext, onPaymentAuthorized, type EngineDeps } from "../rentals/engine";
import { mapAccount } from "./connect-status";
import { mapSubscription } from "./subscription-sync";

export type WebhookDeps = { db: RpcClient; stripe: Stripe; engine: EngineDeps };
type Source = "stripe_platform" | "stripe_connect";

export async function processEvent(
  source: Source,
  event: Stripe.Event,
  deps: WebhookDeps,
): Promise<{ status: "processed" | "ignored" | "skipped"; tenantId?: string | null }> {
  const claim = await rpcOrThrow<string>(deps.db, "webhook_claim", {
    p_source: source,
    p_external_id: event.id,
    p_type: event.type,
    p_account: event.account ?? null,
    p_livemode: event.livemode,
    p_payload: event as unknown as Record<string, unknown>,
  });
  if (claim !== "process") return { status: "skipped" };
  try {
    const out = source === "stripe_connect" ? await handleConnectEvent(event, deps) : await handlePlatformEvent(event, deps);
    await rpcOrThrow(deps.db, "webhook_finish", {
      p_source: source,
      p_external_id: event.id,
      p_status: out.handled ? "processed" : "ignored",
      p_error: null,
      p_tenant: out.tenantId ?? null,
    });
    return { status: out.handled ? "processed" : "ignored", tenantId: out.tenantId };
  } catch (e) {
    await rpcOrThrow(deps.db, "webhook_finish", {
      p_source: source,
      p_external_id: event.id,
      p_status: "failed",
      p_error: (e as Error).message,
      p_tenant: null,
    });
    throw e;
  }
}

type Outcome = { handled: boolean; tenantId?: string | null };

/**
 * Verify a rental's payment directly with Stripe (never trust the browser) and
 * advance the rental. Used by webhooks AND the customer success page.
 */
export async function verifyRentalCheckout(
  deps: WebhookDeps,
  rentalId: string,
  account: string,
  sessionOrIntent: { sessionId?: string; paymentIntentId?: string },
): Promise<Outcome> {
  const ctx = await getContext(deps.db, rentalId);
  // Tenant safety: the event's connected account must own this rental.
  if (!ctx.rental.stripe_account_id || ctx.rental.stripe_account_id !== account) {
    throw new Error(`ACCOUNT_MISMATCH for rental ${rentalId}`);
  }
  let piId = sessionOrIntent.paymentIntentId ?? null;
  let email: string | null = null;
  let customer: string | null = null;
  if (sessionOrIntent.sessionId) {
    const session = await deps.stripe.checkout.sessions.retrieve(sessionOrIntent.sessionId, {}, { stripeAccount: account });
    if (session.metadata?.rental_id !== rentalId) throw new Error("SESSION_RENTAL_MISMATCH");
    piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    email = session.customer_details?.email ?? null;
    customer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  }
  if (!piId) return { handled: false, tenantId: ctx.tenant.id };
  const pi = await deps.stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: account });
  if (pi.metadata?.rental_id && pi.metadata.rental_id !== rentalId) throw new Error("INTENT_RENTAL_MISMATCH");
  if (pi.status !== "requires_capture") {
    return { handled: false, tenantId: ctx.tenant.id };
  }
  await onPaymentAuthorized(deps.engine, {
    rentalId,
    provider: "stripe",
    paymentIntentId: pi.id,
    amount: pi.amount_capturable,
    currency: pi.currency,
    livemode: pi.livemode,
    email: email ?? pi.receipt_email ?? null,
    stripeCustomerId: customer ?? (typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null),
    chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null,
  });
  return { handled: true, tenantId: ctx.tenant.id };
}

export async function handleConnectEvent(event: Stripe.Event, deps: WebhookDeps): Promise<Outcome> {
  const account = event.account;
  if (!account) return { handled: false };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const rentalId = s.metadata?.rental_id;
      if (!rentalId || s.mode !== "payment") return { handled: false };
      return verifyRentalCheckout(deps, rentalId, account, { sessionId: s.id });
    }
    case "payment_intent.amount_capturable_updated": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const rentalId = pi.metadata?.rental_id;
      if (!rentalId) return { handled: false };
      return verifyRentalCheckout(deps, rentalId, account, { paymentIntentId: pi.id });
    }
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const rentalId = s.metadata?.rental_id;
      if (!rentalId) return { handled: false };
      const ctx = await getContext(deps.db, rentalId);
      if (ctx.rental.stripe_account_id !== account) throw new Error("ACCOUNT_MISMATCH");
      await rpcOrThrow(deps.db, "rental_checkout_expired", { p_rental: rentalId });
      return { handled: true, tenantId: ctx.tenant.id };
    }
    case "payment_intent.payment_failed": {
      // Card declined during checkout: the rental simply stays unpaid (customer can retry).
      const pi = event.data.object as Stripe.PaymentIntent;
      return { handled: !!pi.metadata?.rental_id, tenantId: pi.metadata?.tenant_id ?? null };
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const r = event.data.object as Stripe.Refund;
      await rpcOrThrow(deps.db, "refund_update_by_stripe_id", { p_stripe_refund: r.id, p_status: r.status ?? "pending" });
      return { handled: true };
    }
    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      for (const r of ch.refunds?.data ?? []) {
        await rpcOrThrow(deps.db, "refund_update_by_stripe_id", { p_stripe_refund: r.id, p_status: r.status ?? "pending" });
      }
      return { handled: true };
    }
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      const { status, details } = mapAccount(acct);
      const tenantId = await rpcOrThrow<string | null>(deps.db, "integration_sync_stripe", {
        p_account: acct.id,
        p_status: status,
        p_details: details,
        p_livemode: event.livemode,
      });
      return { handled: !!tenantId, tenantId };
    }
    case "account.application.deauthorized": {
      const tenantId = await rpcOrThrow<string | null>(deps.db, "integration_stripe_deauthorized", { p_account: account });
      return { handled: !!tenantId, tenantId };
    }
    default:
      return { handled: false };
  }
}

export async function handlePlatformEvent(event: Stripe.Event, deps: WebhookDeps): Promise<Outcome> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "subscription" || !s.subscription) return { handled: false };
      const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
      const sub = await deps.stripe.subscriptions.retrieve(subId);
      return syncSubscription(deps, sub, s.metadata?.tenant_id ?? null);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      return syncSubscription(deps, sub, null);
    }
    case "invoice.payment_failed":
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (!customer) return { handled: false };
      const tenantId = await rpcOrThrow<string | null>(deps.db, "subscription_payment_event", {
        p_customer: customer,
        p_failed: event.type === "invoice.payment_failed",
        p_message: event.type === "invoice.payment_failed" ? "invoice_payment_failed" : null,
      });
      return { handled: !!tenantId, tenantId };
    }
    default:
      return { handled: false };
  }
}

export async function syncSubscription(deps: { db: RpcClient }, sub: Stripe.Subscription, tenantHint: string | null) {
  const m = mapSubscription(sub);
  const tenantId = await rpcOrThrow<string | null>(deps.db, "subscription_sync", {
    p_tenant: tenantHint ?? m.tenant_id,
    p_customer: m.stripe_customer_id,
    p_subscription: m.stripe_subscription_id,
    p_status: m.status,
    p_price: m.stripe_price_id,
    p_trial_end: m.trial_ends_at,
    p_period_end: m.current_period_end,
    p_cancel_at_period_end: m.cancel_at_period_end,
    p_canceled_at: m.canceled_at,
  });
  return { handled: !!tenantId, tenantId };
}

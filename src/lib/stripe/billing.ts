import "server-only";
import { getStripe } from "./client";
import { syncSubscription } from "./webhooks";
import { adminRpc } from "../rentals/deps";
import { rpcOrThrow } from "../rpc";
import { createAdminClient } from "../supabase/admin";
import { publicEnv } from "../env";

/**
 * Stripe Billing on the PLATFORM account: operators pay the platform a SaaS
 * subscription. Completely separate from customer rental payments, which are
 * direct charges on each operator's connected account.
 */
export async function ensureBillingCustomer(tenant: { id: string; name: string }, email: string) {
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("tenant_id", tenant.id).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;
  const customer = await getStripe().customers.create(
    { email, name: tenant.name, metadata: { tenant_id: tenant.id } },
    { idempotencyKey: `billing-customer-${tenant.id}` },
  );
  await rpcOrThrow(adminRpc(), "subscription_set_customer", { p_tenant: tenant.id, p_customer: customer.id });
  return customer.id;
}

export async function subscriptionCheckoutUrl(opts: {
  tenant: { id: string; name: string; slug: string };
  email: string;
  priceId: string;
  planId: string;
  trialEndsAt: string | null;
}) {
  const customer = await ensureBillingCustomer(opts.tenant, opts.email);
  const trialEnd = opts.trialEndsAt ? Math.floor(new Date(opts.trialEndsAt).getTime() / 1000) : null;
  const keepTrial = trialEnd && trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600 ? trialEnd : undefined;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    subscription_data: {
      metadata: { tenant_id: opts.tenant.id, plan_id: opts.planId },
      ...(keepTrial ? { trial_end: keepTrial } : {}),
    },
    metadata: { tenant_id: opts.tenant.id, plan_id: opts.planId },
    allow_promotion_codes: true,
    success_url: `${publicEnv.appUrl}/o/${opts.tenant.slug}/subscription?success=1`,
    cancel_url: `${publicEnv.appUrl}/o/${opts.tenant.slug}/subscription`,
  });
  return session.url!;
}

export async function changeSubscriptionPrice(stripeSubscriptionId: string, priceId: string) {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const item = sub.items.data[0];
  const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
  });
  await syncSubscription({ db: adminRpc() }, updated, null);
}

export async function setCancelAtPeriodEnd(stripeSubscriptionId: string, cancel: boolean) {
  const updated = await getStripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: cancel });
  await syncSubscription({ db: adminRpc() }, updated, null);
}

export async function billingPortalUrl(customer: string, slug: string) {
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${publicEnv.appUrl}/o/${slug}/subscription`,
  });
  return session.url;
}

/** Super admin: create/refresh the Stripe Product + Price for a plan. Prices are immutable, so a new Price is created when the amount changes. */
export async function syncPlanToStripe(plan: {
  id: string; code: string; name: string; description: string | null; price_cents: number; currency: string;
  billing_interval: string; stripe_product_id: string | null; stripe_price_id: string | null;
}) {
  const stripe = getStripe();
  let productId = plan.stripe_product_id;
  if (productId) {
    await stripe.products.update(productId, { name: plan.name, description: plan.description ?? undefined });
  } else {
    const product = await stripe.products.create({ name: plan.name, description: plan.description ?? undefined, metadata: { plan_id: plan.id, plan_code: plan.code } });
    productId = product.id;
  }
  let priceId = plan.stripe_price_id;
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId);
    const same =
      existing.unit_amount === plan.price_cents &&
      existing.currency === plan.currency &&
      existing.recurring?.interval === plan.billing_interval &&
      existing.product === productId;
    if (!same) priceId = null;
  }
  if (!priceId) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price_cents,
      currency: plan.currency,
      recurring: { interval: plan.billing_interval as "month" | "year" },
      metadata: { plan_id: plan.id },
    });
    priceId = price.id;
    await stripe.products.update(productId, { default_price: priceId });
  }
  return { productId, priceId };
}

import "server-only";
import { getStripe, stripeMode } from "./client";
import { mapAccount } from "./connect-status";
import { adminRpc } from "../rentals/deps";
import { rpcOrThrow } from "../rpc";
import { publicEnv } from "../env";
import { createAdminClient } from "../supabase/admin";

/**
 * Stripe Connect for operators (direct charges).
 * Accounts are created with controller properties equivalent to Standard:
 * the operator owns their Stripe account (full dashboard), pays Stripe's fees
 * and Stripe is responsible for losses. Customer rental payments are DIRECT
 * charges on that account — the platform never holds rental revenue.
 */
export async function ensureConnectedAccount(tenant: { id: string; name: string; slug: string }, email: string) {
  const admin = createAdminClient();
  const { data: integ } = await admin
    .from("integrations")
    .select("stripe_account_id, status")
    .eq("tenant_id", tenant.id)
    .eq("kind", "stripe_connect")
    .maybeSingle();
  const stripe = getStripe();
  if (integ?.stripe_account_id) {
    try {
      const acct = await stripe.accounts.retrieve(integ.stripe_account_id);
      await rpcOrThrow(adminRpc(), "integration_link_stripe", { p_tenant: tenant.id, p_account: acct.id, p_livemode: stripeMode() === "live" });
      await syncAccount(acct.id);
      return acct.id;
    } catch {
      // account deauthorized/deleted → create a new one below
    }
  }
  const { data: brand } = await admin.from("brands").select("website, support_email").eq("tenant_id", tenant.id).maybeSingle();
  const account = await stripe.accounts.create(
    {
      controller: {
        stripe_dashboard: { type: "full" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      email,
      business_profile: {
        name: tenant.name,
        url: brand?.website ?? undefined,
        support_email: brand?.support_email ?? undefined,
        product_description: "Portable power bank rentals",
      },
      metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
    },
    { idempotencyKey: `connect-account-${tenant.id}-${integ?.stripe_account_id ?? "new"}` },
  );
  await rpcOrThrow(adminRpc(), "integration_link_stripe", { p_tenant: tenant.id, p_account: account.id, p_livemode: stripeMode() === "live" });
  return account.id;
}

export async function onboardingLink(accountId: string, tenantSlug: string) {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${publicEnv.appUrl}/api/stripe/connect/refresh?tenant=${encodeURIComponent(tenantSlug)}`,
    return_url: `${publicEnv.appUrl}/api/stripe/connect/return?tenant=${encodeURIComponent(tenantSlug)}`,
    collection_options: { fields: "eventually_due" },
  });
  return link.url;
}

export async function syncAccount(accountId: string) {
  const acct = await getStripe().accounts.retrieve(accountId);
  const { status, details } = mapAccount(acct);
  await rpcOrThrow(adminRpc(), "integration_sync_stripe", {
    p_account: acct.id,
    p_status: status,
    p_details: details,
    p_livemode: stripeMode() === "live",
  });
  return { status, details };
}

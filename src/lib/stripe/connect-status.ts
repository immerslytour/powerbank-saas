import type Stripe from "stripe";

export type ConnectStatus = "onboarding_incomplete" | "restricted" | "active";

export type ConnectDetails = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due: string[];
  past_due: string[];
  disabled_reason: string | null;
  business_name: string | null;
  country: string | null;
  default_currency: string | null;
  dashboard: string | null;
};

/** Pure mapping from a Stripe Account to our integration status (unit tested). */
export function mapAccount(account: Pick<Stripe.Account,
  "charges_enabled" | "payouts_enabled" | "details_submitted" | "requirements" | "business_profile" | "country" |
  "default_currency" | "controller">): { status: ConnectStatus; details: ConnectDetails } {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const details: ConnectDetails = {
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    details_submitted: !!account.details_submitted,
    requirements_due: currentlyDue,
    past_due: pastDue,
    disabled_reason: account.requirements?.disabled_reason ?? null,
    business_name: account.business_profile?.name ?? null,
    country: account.country ?? null,
    default_currency: account.default_currency ?? null,
    dashboard: account.controller?.stripe_dashboard?.type ?? null,
  };
  let status: ConnectStatus;
  if (!account.details_submitted) status = "onboarding_incomplete";
  else if (account.charges_enabled && account.payouts_enabled && currentlyDue.length === 0 && pastDue.length === 0)
    status = "active";
  else status = "restricted";
  return { status, details };
}

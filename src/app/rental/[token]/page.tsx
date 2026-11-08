import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { publicEnv, isServiceRoleConfigured, isStripeConfigured } from "@/lib/env";
import { loadRentalStatus, publicView } from "@/lib/rental-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantForRequestHost } from "@/lib/public-rental";
import { verifyRentalCheckout } from "@/lib/stripe/webhooks";
import { adminRpc, getEngineDeps } from "@/lib/rentals/deps";
import { getStripe } from "@/lib/stripe/client";
import { CustomerShell } from "@/components/customer/shell";
import { RentalStatusView } from "@/components/customer/rental-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your rental", robots: { index: false } };

export default async function RentalPage(props: PageProps<"/rental/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  if (!isServiceRoleConfigured()) notFound();
  const { t, locale } = await getI18n();
  let status = await loadRentalStatus(token);
  if (!status) notFound();
  const hostTenant = await tenantForRequestHost();
  if (hostTenant && hostTenant.tenantId !== status.tenantId) notFound();

  // Returning from Stripe Checkout: verify server-side with Stripe (never trust the redirect alone).
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  if (sessionId && status.status === "pending" && status.paymentStatus === "requires_payment" && isStripeConfigured() && status.stripeAccountId && sessionId === status.checkoutSessionId) {
    try {
      await verifyRentalCheckout({ db: adminRpc(), stripe: getStripe(), engine: await getEngineDeps() }, status.id, status.stripeAccountId, { sessionId });
      status = (await loadRentalStatus(token))!;
    } catch (e) {
      console.error("[rental page] verify failed", (e as Error).message);
    }
  }
  const { data: brand } = await createAdminClient().from("brands").select("display_name, logo_path, primary_color, secondary_color, accent_color, support_email, support_phone, website, return_instructions").eq("tenant_id", status.tenantId).single();
  return (
    <CustomerShell brand={brand!} t={t} locale={locale} platformName={publicEnv.platformName}>
      {status.isSimulated && (
        <div className="-mx-4 mb-4 bg-[repeating-linear-gradient(135deg,#fff3d6,#fff3d6_10px,#ffe8b3_10px,#ffe8b3_20px)] px-5 py-2.5 text-center text-xs font-semibold text-[#7a5200]">{t.customer.simBanner}</div>
      )}
      <div className="pt-6">
        <RentalStatusView t={t} token={token} initial={publicView(status)} accent={brand!.accent_color} locale={locale} returnText={brand!.return_instructions || t.customer.returnDefault} />
      </div>
    </CustomerShell>
  );
}

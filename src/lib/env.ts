/** Centralized environment access. Server-only secrets are never prefixed NEXT_PUBLIC_. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, ""),
  platformName: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Voltaje",
  rootDomain: (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase(),
};

export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",
    cronSecret: process.env.CRON_SECRET ?? "",
    allowSimulatedPayments: (process.env.ALLOW_SIMULATED_PAYMENTS ?? "true") !== "false",
  };
}

export const isSupabaseConfigured = () => !!publicEnv.supabaseUrl && !!publicEnv.supabaseAnonKey;
export const isServiceRoleConfigured = () => !!serverEnv().serviceRoleKey;
export const isStripeConfigured = () => !!serverEnv().stripeSecretKey;

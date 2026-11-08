import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAccount } from "@/lib/stripe/connect";
import { publicEnv } from "@/lib/env";

/** Stripe returns here after onboarding. State is re-read from Stripe (never trusted from the URL). */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("tenant") ?? "";
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("id, slug").eq("slug", slug).maybeSingle();
  if (!tenant) return NextResponse.redirect(new URL("/app", publicEnv.appUrl));
  const { data: integ } = await supabase.from("integrations").select("stripe_account_id").eq("tenant_id", tenant.id).eq("kind", "stripe_connect").maybeSingle();
  if (integ?.stripe_account_id) {
    try {
      await syncAccount(integ.stripe_account_id);
    } catch (e) {
      console.error("[stripe return] sync failed", (e as Error).message);
    }
  }
  return NextResponse.redirect(new URL(`/o/${tenant.slug}/integrations?stripe=returned`, publicEnv.appUrl));
}

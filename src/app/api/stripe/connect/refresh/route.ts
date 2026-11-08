import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeTenant } from "@/lib/auth";
import { onboardingLink } from "@/lib/stripe/connect";
import { publicEnv } from "@/lib/env";

/** Account Link expired / revisited: mint a fresh link for an authenticated owner. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("tenant") ?? "";
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) return NextResponse.redirect(new URL(`/login?next=/o/${encodeURIComponent(slug)}/integrations`, publicEnv.appUrl));
  try {
    const ctx = await authorizeTenant(tenant.id, "owner");
    const { data: integ } = await ctx.supabase.from("integrations").select("stripe_account_id").eq("tenant_id", tenant.id).eq("kind", "stripe_connect").maybeSingle();
    if (!integ?.stripe_account_id) throw new Error("no account");
    return NextResponse.redirect(await onboardingLink(integ.stripe_account_id, ctx.tenant.slug));
  } catch {
    return NextResponse.redirect(new URL(`/o/${encodeURIComponent(slug)}/integrations`, publicEnv.appUrl));
  }
}

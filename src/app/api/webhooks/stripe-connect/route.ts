import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { serverEnv } from "@/lib/env";
import { processEvent } from "@/lib/stripe/webhooks";
import { adminRpc, getEngineDeps } from "@/lib/rentals/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connected account events: customer rental payments + account status. */
export async function POST(req: Request) {
  const secret = serverEnv().stripeConnectWebhookSecret;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const body = await req.text();
  const stripe = getStripe();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (!event.account) return NextResponse.json({ received: true, ignored: "not a connect event" });
  try {
    const out = await processEvent("stripe_connect", event, { db: adminRpc(), stripe, engine: await getEngineDeps() });
    return NextResponse.json({ received: true, ...out });
  } catch (e) {
    console.error("[stripe connect webhook] processing failed", event.type, event.id, (e as Error).message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

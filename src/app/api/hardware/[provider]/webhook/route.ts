import { NextResponse } from "next/server";
import { isKnownProvider, getProvider } from "@/lib/hardware/registry";
import { ProviderNotConfiguredError } from "@/lib/hardware/types";
import { adminRpc, getEngineDeps } from "@/lib/rentals/deps";
import { handleDeviceEvent } from "@/lib/rentals/engine";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound events from a manufacturer cloud (release/return/connectivity).
 * The adapter verifies the signature and normalizes the payload. The simulator
 * does not accept HTTP events (it is driven from the operator dashboard).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/hardware/[provider]/webhook">) {
  const { provider } = await ctx.params;
  if (!isKnownProvider(provider) || provider === "simulator") {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  if (!(await rateLimit(`hw:${provider}`, 600, 60))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const adapter = getProvider(provider, adminRpc());
  if (!adapter.parseWebhook) return NextResponse.json({ error: "webhooks not supported" }, { status: 501 });
  const raw = await req.text();
  let events;
  try {
    events = await adapter.parseWebhook(raw, req.headers);
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: "provider not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 });
  }
  const deps = await getEngineDeps();
  const results = [];
  for (const ev of events) {
    try {
      results.push(await handleDeviceEvent(deps, provider, ev));
    } catch (e) {
      console.error("[hardware webhook]", provider, ev.type, (e as Error).message);
      return NextResponse.json({ error: "processing failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: events.length, results });
}

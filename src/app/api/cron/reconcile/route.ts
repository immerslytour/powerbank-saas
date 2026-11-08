import { NextResponse } from "next/server";
import { serverEnv, isServiceRoleConfigured } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { getEngineDeps } from "@/lib/rentals/deps";
import { reconcile } from "@/lib/rentals/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron: expire abandoned checkouts, resolve stuck unlocks, capture overdue rentals. */
export async function GET(req: Request) {
  const secret = serverEnv().cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const summary = await reconcile(await getEngineDeps());
  return NextResponse.json({ ok: true, ...summary });
}

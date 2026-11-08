import { NextResponse } from "next/server";
import { loadRentalStatus, publicView } from "@/lib/rental-status";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/public/rental/[token]">) {
  const { token } = await ctx.params;
  if (!(await rateLimit("rental-status", 120, 60))) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const s = await loadRentalStatus(token);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(publicView(s), { headers: { "cache-control": "no-store" } });
}

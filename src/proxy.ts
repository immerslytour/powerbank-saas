import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { classifyHost, isTenantPath } from "@/lib/domains";
import { publicEnv } from "@/lib/env";

/**
 * 1) Operator subdomains / custom domains → customer-facing pages only.
 * 2) Platform host → refresh Supabase auth session cookies.
 * Authorization is NOT done here (it's enforced by RLS + server checks).
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const kind = classifyHost(host, { appUrl: publicEnv.appUrl, rootDomain: publicEnv.rootDomain });

  if (kind.kind === "tenant") {
    if (!isTenantPath(url.pathname)) {
      return NextResponse.redirect(new URL(url.pathname + url.search, publicEnv.appUrl));
    }
    const headers = new Headers(request.headers);
    headers.set("x-tenant-host", kind.host);
    if (url.pathname === "/") {
      const rewrite = url.clone();
      rewrite.pathname = `/site/${kind.host}`;
      return NextResponse.rewrite(rewrite, { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
  }

  const headers = new Headers(request.headers);
  headers.delete("x-tenant-host"); // never trust a client-supplied value
  const response = NextResponse.next({ request: { headers } });
  const { response: res } = await updateSession(request, response);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/hardware|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};

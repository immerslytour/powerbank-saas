/**
 * Host → tenant routing rules (pure; used by proxy.ts and unit tests).
 * The actual domain → tenant lookup happens server-side against tenant_domains
 * (verified domains only), never in the browser.
 */
export type HostKind = { kind: "platform" } | { kind: "tenant"; host: string };

const PLATFORM_SUBDOMAINS = new Set(["www", "app", "admin", "api"]);

export function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().trim().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function classifyHost(rawHost: string, opts: { appUrl: string; rootDomain: string }): HostKind {
  const host = normalizeHost(rawHost);
  if (!host) return { kind: "platform" };
  let appHost = "";
  try {
    appHost = normalizeHost(new URL(opts.appUrl).host);
  } catch {
    appHost = "";
  }
  const root = normalizeHost(opts.rootDomain);
  if (host === appHost || host === root || host === "localhost" || host === "127.0.0.1") return { kind: "platform" };
  if (host.endsWith(".vercel.app") || host.endsWith(".localhost")) return { kind: "platform" };
  if (root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes(".") || PLATFORM_SUBDOMAINS.has(sub)) return { kind: "platform" };
    return { kind: "tenant", host };
  }
  // Any other host is a potential operator custom domain (validated against the DB).
  return { kind: "tenant", host };
}

/** Paths a tenant (customer-facing) domain may serve. Everything else redirects to the platform. */
export function isTenantPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/rental/") ||
    pathname.startsWith("/site/") ||
    pathname.startsWith("/api/public/")
  );
}

export function isValidDomain(d: string) {
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
}

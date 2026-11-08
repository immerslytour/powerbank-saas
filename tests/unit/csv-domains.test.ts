import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";
import { exportRentals } from "@/lib/exports";
import { classifyHost, isTenantPath, isValidDomain, normalizeHost } from "@/lib/domains";
import { subscriptionOk } from "@/lib/subscription";
import { parseRange, rangeBounds } from "@/lib/ranges";
import { fmt } from "@/lib/i18n/format";
import en from "@/lib/i18n/en";
import es from "@/lib/i18n/es";

describe("CSV export", () => {
  it("escapes quotes, commas and newlines", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: "line1\nline2" }], [
      { header: "a", value: (r) => r.a },
      { header: "b", value: (r) => r.b },
    ]);
    expect(csv).toBe('a,b\r\n"He said ""hi"", ok","line1\nline2"\r\n');
  });
  it("neutralizes spreadsheet formula injection", () => {
    const csv = toCsv([{ v: "=HYPERLINK(\"http://evil\")" }, { v: "+1" }, { v: "@cmd" }], [{ header: "v", value: (r) => r.v }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@cmd");
  });
  it("exports rentals with decimal money and simulated flag", () => {
    const csv = exportRentals([{
      id: "r1", status: "returned", payment_status: "succeeded", refund_status: "partial", amount_cents: 550, refunded_cents: 100,
      currency: "usd", started_at: "2026-01-01T00:00:00Z", returned_at: "2026-01-01T02:00:00Z", created_at: "2026-01-01T00:00:00Z",
      is_simulated: true, battery_serial: "B1", stripe_payment_intent_id: null, machine: "M", location: "L", customer: "a@b.co",
    }]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header.split(",")).toContain("net");
    expect(row).toContain("5.50,1.00,4.50,USD");
    expect(row.endsWith("yes")).toBe(true);
  });
});

describe("domain → tenant routing", () => {
  const opts = { appUrl: "https://app.voltaje.app", rootDomain: "voltaje.app" };
  it("treats platform hosts as platform", () => {
    for (const h of ["app.voltaje.app", "voltaje.app", "www.voltaje.app", "localhost:3000", "x-git-main.vercel.app"]) {
      expect(classifyHost(h, opts).kind).toBe("platform");
    }
  });
  it("detects operator subdomains and custom domains", () => {
    expect(classifyHost("cafevolt.voltaje.app", opts)).toEqual({ kind: "tenant", host: "cafevolt.voltaje.app" });
    expect(classifyHost("Rent.CafeVolt.com:443", opts)).toEqual({ kind: "tenant", host: "rent.cafevolt.com" });
    expect(classifyHost("a.b.voltaje.app", opts).kind).toBe("platform");
  });
  it("only allows customer paths on tenant hosts", () => {
    expect(isTenantPath("/r/ABC123")).toBe(true);
    expect(isTenantPath("/rental/x")).toBe(true);
    expect(isTenantPath("/o/demo")).toBe(false);
    expect(isTenantPath("/admin")).toBe(false);
  });
  it("validates domains", () => {
    expect(isValidDomain("rent.cafe.com")).toBe(true);
    expect(isValidDomain("localhost")).toBe(false);
    expect(isValidDomain("bad_domain.com")).toBe(false);
    expect(normalizeHost("EXAMPLE.com.")).toBe("example.com");
  });
});

describe("subscription status mirror", () => {
  it("matches SQL tenant_subscription_ok", () => {
    expect(subscriptionOk({ status: "active", trial_ends_at: null }, "active")).toBe(true);
    expect(subscriptionOk({ status: "past_due", trial_ends_at: null }, "active")).toBe(true);
    expect(subscriptionOk({ status: "trialing", trial_ends_at: new Date(Date.now() + 1e6).toISOString() }, "active")).toBe(true);
    expect(subscriptionOk({ status: "trialing", trial_ends_at: new Date(Date.now() - 1e6).toISOString() }, "active")).toBe(false);
    expect(subscriptionOk({ status: "canceled", trial_ends_at: null }, "active")).toBe(false);
    expect(subscriptionOk({ status: "active", trial_ends_at: null }, "suspended")).toBe(false);
  });
});

describe("misc", () => {
  it("range bounds include today", () => {
    const now = new Date("2026-03-10T15:00:00Z");
    const { from, to } = rangeBounds(parseRange("7"), now);
    expect(to).toBe("2026-03-11T00:00:00.000Z");
    expect(from).toBe("2026-03-04T00:00:00.000Z");
    expect(parseRange("bogus")).toBe("30");
  });
  it("i18n dictionaries have identical keys", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(es).sort()).toEqual(keys(en).sort());
    expect(fmt(es.customer.available, { n: 3 })).toBe("3 disponibles");
  });
});

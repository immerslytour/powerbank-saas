import { NextResponse } from "next/server";
import { authorizeTenant, AuthError } from "@/lib/auth";
import { toCsv, centsToDecimal } from "@/lib/csv";
import { exportRentals, type RentalExportRow } from "@/lib/exports";
import { parseData, parseRange, rangeBounds } from "@/lib/ranges";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_ROWS = 50_000;

/** CSV exports. Authorization: manager+ of the tenant; data read through RLS. */
export async function GET(req: Request, ctx: RouteContext<"/api/export/[tenant]/[report]">) {
  const { tenant, report } = await ctx.params;
  let tc;
  try {
    tc = await authorizeTenant(tenant, "manager");
  } catch (e) {
    const status = e instanceof AuthError && e.code === "UNAUTHENTICATED" ? 401 : 403;
    return NextResponse.json({ error: "forbidden" }, { status });
  }
  if (!(await rateLimit("export", 30, 300, tc.user.id))) return NextResponse.json({ error: "rate limited" }, { status: 429 });
  const url = new URL(req.url);
  const s = tc.supabase;
  let csv = "";

  switch (report) {
    case "rentals": {
      const status = url.searchParams.get("status");
      let q = s
        .from("rentals")
        .select("id, status, payment_status, refund_status, amount_cents, refunded_cents, currency, started_at, returned_at, created_at, is_simulated, battery_serial, stripe_payment_intent_id, machines!rentals_machine_id_tenant_id_fkey(name, device_id), locations!rentals_location_id_tenant_id_fkey(name), customers!rentals_customer_id_tenant_id_fkey(email)")
        .eq("tenant_id", tc.tenant.id)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (status && status !== "all") q = q.eq("status", status as "active");
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });
      const rows: RentalExportRow[] = (data ?? []).map((r) => ({
        ...r,
        machine: r.machines?.name ?? r.machines?.device_id ?? null,
        location: r.locations?.name ?? null,
        customer: r.customers?.email ?? null,
      }));
      csv = exportRentals(rows);
      break;
    }
    case "payments": {
      const { data } = await s
        .from("payments")
        .select("id, rental_id, provider, status, amount_authorized_cents, amount_captured_cents, amount_refunded_cents, application_fee_cents, currency, livemode, is_simulated, stripe_payment_intent_id, stripe_charge_id, created_at")
        .eq("tenant_id", tc.tenant.id)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      csv = toCsv(data ?? [], [
        { header: "payment_id", value: (p) => p.id },
        { header: "created_at", value: (p) => p.created_at },
        { header: "rental_id", value: (p) => p.rental_id },
        { header: "provider", value: (p) => p.provider },
        { header: "status", value: (p) => p.status },
        { header: "authorized", value: (p) => centsToDecimal(p.amount_authorized_cents) },
        { header: "captured", value: (p) => centsToDecimal(p.amount_captured_cents) },
        { header: "refunded", value: (p) => centsToDecimal(p.amount_refunded_cents) },
        { header: "platform_fee", value: (p) => centsToDecimal(p.application_fee_cents) },
        { header: "currency", value: (p) => p.currency.toUpperCase() },
        { header: "mode", value: (p) => (p.is_simulated ? "simulated" : p.livemode ? "live" : "test") },
        { header: "stripe_payment_intent", value: (p) => p.stripe_payment_intent_id },
        { header: "stripe_charge", value: (p) => p.stripe_charge_id },
      ]);
      break;
    }
    case "customers": {
      const { data } = await s.from("customers").select("id, email, name, phone, rental_count, created_at").eq("tenant_id", tc.tenant.id).limit(MAX_ROWS);
      csv = toCsv(data ?? [], [
        { header: "customer_id", value: (c) => c.id },
        { header: "email", value: (c) => c.email },
        { header: "name", value: (c) => c.name },
        { header: "phone", value: (c) => c.phone },
        { header: "rentals", value: (c) => c.rental_count },
        { header: "first_seen", value: (c) => c.created_at },
      ]);
      break;
    }
    case "locations":
    case "machines":
    case "revenue": {
      const { from, to } = rangeBounds(parseRange(url.searchParams.get("range")));
      const data = parseData(url.searchParams.get("data"));
      if (report === "locations") {
        const { data: rows } = await s.rpc("analytics_location_performance", { p_tenant: tc.tenant.id, p_from: from, p_to: to, p_data: data });
        csv = toCsv(rows ?? [], [
          { header: "location", value: (r) => r.location_name },
          { header: "machines", value: (r) => r.machines },
          { header: "rentals", value: (r) => r.rentals },
          { header: "revenue", value: (r) => centsToDecimal(Number(r.revenue_cents)) },
          { header: "avg_per_rental", value: (r) => centsToDecimal(Number(r.avg_revenue_cents)) },
          { header: "commission_type", value: (r) => r.commission_type },
          { header: "commission_value", value: (r) => (r.commission_type === "percent" ? `${r.commission_value / 100}%` : centsToDecimal(r.commission_value)) },
          { header: "commission_due", value: (r) => centsToDecimal(Number(r.commission_due_cents)) },
        ]);
      } else if (report === "machines") {
        const { data: rows } = await s.rpc("analytics_machine_performance", { p_tenant: tc.tenant.id, p_from: from, p_to: to, p_data: data });
        csv = toCsv(rows ?? [], [
          { header: "machine", value: (r) => r.machine_name },
          { header: "device_id", value: (r) => r.device_id },
          { header: "location", value: (r) => r.location_name },
          { header: "simulated", value: (r) => (r.is_simulated ? "yes" : "no") },
          { header: "rentals", value: (r) => r.rentals },
          { header: "revenue", value: (r) => centsToDecimal(Number(r.revenue_cents)) },
          { header: "rental_minutes", value: (r) => r.rental_minutes },
          { header: "utilization_pct", value: (r) => r.utilization_pct },
          { header: "offline_minutes", value: (r) => r.offline_minutes },
        ]);
      } else {
        const bucket = ["day", "week", "month"].includes(url.searchParams.get("bucket") ?? "") ? url.searchParams.get("bucket")! : "day";
        const { data: rows } = await s.rpc("analytics_revenue_series", { p_tenant: tc.tenant.id, p_from: from, p_to: to, p_bucket: bucket, p_tz: tc.tenant.timezone, p_data: data });
        csv = toCsv(rows ?? [], [
          { header: "period_start", value: (r) => r.bucket_start },
          { header: "rentals", value: (r) => r.rentals },
          { header: "net_revenue", value: (r) => centsToDecimal(Number(r.revenue_cents)) },
          { header: "refunds", value: (r) => centsToDecimal(Number(r.refunds_cents)) },
        ]);
      }
      break;
    }
    default:
      return NextResponse.json({ error: "unknown report" }, { status: 404 });
  }

  const filename = `${tc.tenant.slug}-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

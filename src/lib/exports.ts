import { toCsv, centsToDecimal, type CsvColumn } from "./csv";

/** Column definitions for every CSV report (pure; unit tested). */
export type RentalExportRow = {
  id: string; status: string; payment_status: string; refund_status: string; amount_cents: number; refunded_cents: number;
  currency: string; started_at: string | null; returned_at: string | null; created_at: string; is_simulated: boolean;
  battery_serial: string | null; stripe_payment_intent_id: string | null;
  machine: string | null; location: string | null; customer: string | null;
};

export const rentalColumns: CsvColumn<RentalExportRow>[] = [
  { header: "rental_id", value: (r) => r.id },
  { header: "created_at", value: (r) => r.created_at },
  { header: "started_at", value: (r) => r.started_at },
  { header: "returned_at", value: (r) => r.returned_at },
  { header: "status", value: (r) => r.status },
  { header: "payment_status", value: (r) => r.payment_status },
  { header: "refund_status", value: (r) => r.refund_status },
  { header: "amount", value: (r) => centsToDecimal(r.amount_cents) },
  { header: "refunded", value: (r) => centsToDecimal(r.refunded_cents) },
  { header: "net", value: (r) => centsToDecimal(r.amount_cents - r.refunded_cents) },
  { header: "currency", value: (r) => r.currency.toUpperCase() },
  { header: "machine", value: (r) => r.machine },
  { header: "location", value: (r) => r.location },
  { header: "customer_email", value: (r) => r.customer },
  { header: "battery_serial", value: (r) => r.battery_serial },
  { header: "stripe_payment_intent", value: (r) => r.stripe_payment_intent_id },
  { header: "simulated", value: (r) => (r.is_simulated ? "yes" : "no") },
];

export const exportRentals = (rows: RentalExportRow[]) => toCsv(rows, rentalColumns);

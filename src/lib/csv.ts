/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralize formula injection (=, +, -, @, tab, CR) for text values.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(c.value(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export const centsToDecimal = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);

export type RangeKey = "7" | "30" | "90" | "month";
export type DataKey = "all" | "real" | "simulated";

export function parseRange(v: unknown): RangeKey {
  return v === "7" || v === "90" || v === "month" ? v : "30";
}
export function parseData(v: unknown): DataKey {
  return v === "real" || v === "simulated" ? v : "all";
}

/** Returns [from, to) for a range key, ending tomorrow 00:00 UTC so "today" is included. */
export function rangeBounds(key: RangeKey, now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  let from: Date;
  if (key === "month") from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  else from = new Date(to.getTime() - Number(key) * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

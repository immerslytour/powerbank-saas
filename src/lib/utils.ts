import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number | null | undefined, currency = "usd", locale = "en") {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string | Date | null | undefined, locale = "en", tz?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined, locale = "en", tz?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeZone: tz }).format(
    new Date(value),
  );
}

export function formatDuration(minutes: number, locale = "en") {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}${locale === "es" ? "d" : "d"}`);
  if (h) parts.push(`${h}h`);
  if (mm || parts.length === 0) parts.push(`${mm}m`);
  return parts.join(" ");
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function centsToInput(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toFixed(2);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Extract our SQL error codes like MACHINE_LIMIT_REACHED from a Postgres error message. */
export function dbErrorCode(e: unknown): string | null {
  const m = errorMessage(e).match(/\b([A-Z][A-Z_]{3,})\b/);
  return m ? m[1] : null;
}

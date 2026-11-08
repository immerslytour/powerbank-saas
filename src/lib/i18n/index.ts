import "server-only";
import { cookies, headers } from "next/headers";
import en, { type Dict } from "./en";
import es from "./es";

export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];
export const LOCALE_COOKIE = "locale";

const dictionaries: Record<Locale, Dict> = { en, es };

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (c === "en" || c === "es") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^es\b/i.test(accept.trim()) ? "es" : "en";
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] ?? en;
}

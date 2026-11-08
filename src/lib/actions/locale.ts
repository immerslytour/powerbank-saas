"use server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "../i18n";
import { createClient } from "../supabase/server";

export async function setLocale(locale: string) {
  const value = locale === "es" ? "es" : "en";
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from("profiles").update({ locale: value }).eq("id", data.user.id);
  } catch {
    /* anonymous visitors */
  }
}

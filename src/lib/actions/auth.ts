"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../supabase/server";
import { getI18n } from "../i18n";
import { rateLimit } from "../rate-limit";
import { publicEnv, isServiceRoleConfigured } from "../env";
import { getPlatformSetting } from "../rentals/deps";
import type { ActionState } from "../action-result";

function safeNext(next: FormDataEntryValue | null, fallback = "/app") {
  const s = String(next ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

const credentials = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128) });

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: t.auth.invalidCredentials };
  if (!(await rateLimit("signin", 10, 300, parsed.data.email))) return { ok: false, error: t.auth.rateLimited };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: t.auth.invalidCredentials };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t, locale } = await getI18n();
  const schema = credentials.extend({ fullName: z.string().trim().min(2).max(120) });
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.path[0] === "password" ? t.auth.passwordHint : t.errors.VALIDATION;
    return { ok: false, error: t.errors.VALIDATION, fieldErrors: fe };
  }
  if (!(await rateLimit("signup", 5, 600))) return { ok: false, error: t.auth.rateLimited };
  if (isServiceRoleConfigured()) {
    const signups = await getPlatformSetting<{ self_serve_enabled?: boolean }>("signups");
    if (signups && signups.self_serve_enabled === false) return { ok: false, error: t.auth.signupsDisabled };
  }
  const next = safeNext(formData.get("next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, locale },
      emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { ok: false, error: error.message };
  if (data.session) redirect(next);
  return { ok: true, message: t.auth.checkEmail };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (email.success && (await rateLimit("reset", 5, 600, email.data))) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password`,
    });
  }
  return { ok: true, message: t.auth.resetSent };
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getI18n();
  const pw = z.string().min(8).max(128).safeParse(formData.get("password"));
  if (!pw.success) return { ok: false, error: t.auth.passwordHint };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { ok: false, error: error.message };
  redirect("/app");
}

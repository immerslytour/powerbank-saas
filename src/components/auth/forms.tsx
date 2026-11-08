"use client";
import Link from "next/link";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { signIn, signUp, requestPasswordReset, updatePassword } from "@/lib/actions/auth";
import type { Dict } from "@/lib/i18n/format";

export function LoginForm({ t, next }: { t: Dict; next?: string }) {
  return (
    <ActionForm action={signIn} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/app"} />
      <Field label={t.common.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label={
          <span className="flex w-full items-center justify-between">
            {t.auth.password}
            <Link href="/forgot-password" className="text-xs font-normal text-electric hover:underline">{t.auth.forgot}</Link>
          </span>
        }
        htmlFor="password"
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" size="lg">{t.auth.signIn}</SubmitButton>
    </ActionForm>
  );
}

export function SignupForm({ t, next }: { t: Dict; next?: string }) {
  return (
    <ActionForm action={signUp} className="space-y-4">
      {(state) => (
        <>
          <input type="hidden" name="next" value={next ?? "/onboarding"} />
          <Field label={t.auth.fullName} htmlFor="fullName" error={fieldError(state, "fullName")}>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
          <Field label={t.common.email} htmlFor="email" error={fieldError(state, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={t.auth.password} hint={t.auth.passwordHint} htmlFor="password" error={fieldError(state, "password")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <SubmitButton className="w-full" size="lg">{t.auth.signUp}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ForgotForm({ t }: { t: Dict }) {
  return (
    <ActionForm action={requestPasswordReset} className="space-y-4">
      <Field label={t.common.email} htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <SubmitButton className="w-full" size="lg">{t.auth.sendReset}</SubmitButton>
    </ActionForm>
  );
}

export function ResetForm({ t }: { t: Dict }) {
  return (
    <ActionForm action={updatePassword} className="space-y-4">
      <Field label={t.auth.newPassword} hint={t.auth.passwordHint} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" size="lg">{t.auth.updatePassword}</SubmitButton>
    </ActionForm>
  );
}

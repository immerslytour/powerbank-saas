"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/form";
import { Field, Input, Select } from "@/components/ui/input";
import { createBusiness } from "@/lib/actions/onboarding";
import { slugify } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";

export function CreateBusinessForm({ t, plans, appHost }: { t: Dict; plans: { code: string; label: string }[]; appHost: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <ActionForm action={createBusiness} className="space-y-4">
      {(state) => (
        <>
          <Field label={t.auth.businessName} htmlFor="name" error={fieldError(state, "name")}>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!touched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label={t.onboarding.slug} hint={`${appHost}/o/${slug || "your-business"}`} htmlFor="slug" error={fieldError(state, "slug")}>
            <Input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
              value={slug}
              onChange={(e) => {
                setTouched(true);
                setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label={t.onboarding.plan} htmlFor="plan">
            <Select id="plan" name="plan" defaultValue={plans[0]?.code}>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <SubmitButton className="w-full" size="lg">{t.onboarding.create}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

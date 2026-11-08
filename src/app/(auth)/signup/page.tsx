import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signUpTitle}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.auth.signUpSubtitle}</p>
      <SignupForm t={t} next={next} />
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.haveAccount}{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-electric hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </>
  );
}

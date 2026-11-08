import Link from "next/link";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/misc";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  if (await getSessionUser()) redirect(next ?? "/app");
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signInTitle}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.auth.signInSubtitle}</p>
      {sp.error && <Alert tone="danger" className="mb-4">{t.common.error}</Alert>}
      <LoginForm t={t} next={next} />
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.noAccount}{" "}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-electric hover:underline">
          {t.auth.signUp}
        </Link>
      </p>
    </>
  );
}

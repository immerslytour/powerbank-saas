import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { ForgotForm } from "@/components/auth/forms";

export default async function ForgotPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.auth.resetTitle}</h1>
      <ForgotForm t={t} />
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-electric hover:underline">{t.common.back}</Link></p>
    </>
  );
}

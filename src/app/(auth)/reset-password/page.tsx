import { getI18n } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { ResetForm } from "@/components/auth/forms";

export default async function ResetPage() {
  await requireUser("/reset-password");
  const { t } = await getI18n();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.auth.updatePassword}</h1>
      <ResetForm t={t} />
    </>
  );
}

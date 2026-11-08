import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { CreateOperatorForm } from "@/components/admin/admin-forms";

export default async function NewOperator() {
  await requireSuperAdmin();
  const { t } = await getI18n();
  const { data: plans } = await (await createClient()).from("plans").select("code, name").eq("is_active", true).order("sort_order");
  return (
    <>
      <PageHeader title={t.admin.newOperator} />
      <Card className="max-w-3xl"><CardContent className="p-6"><CreateOperatorForm t={t} plans={plans ?? []} /></CardContent></Card>
    </>
  );
}

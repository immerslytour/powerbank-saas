import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <div>
        <div className="font-mono text-6xl font-semibold text-electric">404</div>
        <p className="mt-3 text-muted">{t.common.notFound}</p>
        <Button asChild className="mt-6" variant="secondary"><Link href="/">{t.common.back}</Link></Button>
      </div>
    </div>
  );
}

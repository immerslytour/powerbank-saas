import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n/format";

export function Pagination({ t, page, hasNext, href }: { t: Dict; page: number; hasNext: boolean; href: (p: number) => string }) {
  if (page <= 1 && !hasNext) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>{t.common.page} {page}</span>
      <div className="flex gap-2">
        {page > 1 ? <Button asChild size="sm" variant="secondary"><Link href={href(page - 1)}>{t.common.previous}</Link></Button> : <Button size="sm" variant="secondary" disabled>{t.common.previous}</Button>}
        {hasNext ? <Button asChild size="sm" variant="secondary"><Link href={href(page + 1)}>{t.common.next}</Link></Button> : <Button size="sm" variant="secondary" disabled>{t.common.next}</Button>}
      </div>
    </div>
  );
}

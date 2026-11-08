import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Dict } from "@/lib/i18n/format";
import type { DataKey, RangeKey } from "@/lib/ranges";

function Seg({ items, active, href }: { items: [string, string][]; active: string; href: (k: string) => string }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs shadow-sm">
      {items.map(([k, label]) => (
        <Link
          key={k}
          href={href(k)}
          scroll={false}
          className={cn("rounded-md px-2.5 py-1.5 font-medium", active === k ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export function RangeFilters({ t, base, range, data, extra = {} }: { t: Dict; base: string; range: RangeKey; data: DataKey; extra?: Record<string, string> }) {
  const q = (o: Record<string, string>) => `${base}?${new URLSearchParams({ range, data, ...extra, ...o }).toString()}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Seg
        active={range}
        href={(k) => q({ range: k })}
        items={[["7", t.common.last7], ["30", t.common.last30], ["90", t.common.last90], ["month", t.common.thisMonth]]}
      />
      <Seg
        active={data}
        href={(k) => q({ data: k })}
        items={[["all", t.common.dataAll], ["real", t.common.dataReal], ["simulated", t.common.dataSimulated]]}
      />
    </div>
  );
}

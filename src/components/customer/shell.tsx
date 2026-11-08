import { Mail, Phone, Globe } from "lucide-react";
import { brandAssetUrl } from "@/lib/storage";
import { fmt, type Dict } from "@/lib/i18n/format";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export type BrandLite = {
  display_name: string; logo_path: string | null; primary_color: string; secondary_color: string; accent_color: string;
  support_email: string | null; support_phone: string | null; website: string | null;
};

/** Operator-branded mobile shell. Colors come from the operator's brand (validated hex in DB). */
export function CustomerShell({ brand, t, locale, platformName, children }: { brand: BrandLite; t: Dict; locale: "en" | "es"; platformName: string; children: React.ReactNode }) {
  const logo = brandAssetUrl(brand.logo_path);
  return (
    <div
      className="min-h-dvh"
      style={{ ["--brand" as string]: brand.primary_color, ["--brand-accent" as string]: brand.accent_color, background: brand.secondary_color }}
    >
      <header className="text-white" style={{ background: brand.primary_color }}>
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={brand.display_name} className="size-9 rounded-lg bg-white object-contain p-1" />
            ) : (
              <div className="grid size-9 place-items-center rounded-lg bg-white/15 text-base font-semibold">{brand.display_name.slice(0, 1)}</div>
            )}
            <span className="font-semibold">{brand.display_name}</span>
          </div>
          <LanguageSwitcher locale={locale} dark />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-10">{children}</main>
      <footer className="mx-auto max-w-md px-5 pb-10 text-center text-xs text-muted">
        <div className="font-medium text-ink/80">{fmt(t.customer.operatedBy, { name: brand.display_name })}</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {brand.support_email && <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${brand.support_email}`}><Mail className="size-3" />{brand.support_email}</a>}
          {brand.support_phone && <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${brand.support_phone}`}><Phone className="size-3" />{brand.support_phone}</a>}
          {brand.website && <a className="inline-flex items-center gap-1 hover:underline" href={brand.website} target="_blank" rel="noreferrer"><Globe className="size-3" />{brand.website.replace(/^https?:\/\//, "")}</a>}
        </div>
        <div className="mt-4 opacity-60">{t.common.poweredBy} {platformName}</div>
      </footer>
    </div>
  );
}

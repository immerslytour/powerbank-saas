"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/lib/actions/locale";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ locale, dark = false, className }: { locale: "en" | "es"; dark?: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg p-0.5 text-xs",
        dark ? "bg-white/5 text-white/70" : "bg-ink/[0.04] text-muted",
        pending && "opacity-60",
        className,
      )}
    >
      <Languages className="ml-1.5 size-3.5" aria-hidden />
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => start(async () => { await setLocale(l); router.refresh(); })}
          className={cn(
            "rounded-md px-2 py-1 font-medium uppercase transition",
            locale === l ? (dark ? "bg-white/15 text-white" : "bg-white text-ink shadow-sm") : "hover:opacity-100",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

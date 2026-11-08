import { cn } from "@/lib/utils";

/** Platform mark: a charge bolt inside a rounded cell. Pure SVG. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d8fff" />
          <stop offset="1" stopColor="#1f63e0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lm)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="none" stroke="rgba(255,255,255,.25)" />
      <path d="M17.6 6.5 9.8 17.4h5.1l-1.4 8.1 7.9-11h-5.2z" fill="#fff" />
    </svg>
  );
}

export function Logo({ name, dark = false, className }: { name: string; dark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-[17px] font-semibold tracking-tight", dark ? "text-white" : "text-ink")}>{name}</span>
    </span>
  );
}

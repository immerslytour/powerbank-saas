import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", {
  variants: {
    tone: {
      neutral: "bg-ink/[0.04] text-ink/80 ring-ink/10",
      blue: "bg-electric-50 text-electric-600 ring-electric/20",
      green: "bg-success/10 text-success ring-success/20",
      amber: "bg-warning/10 text-warning ring-warning/25",
      red: "bg-danger/10 text-danger ring-danger/20",
      navy: "bg-navy-900 text-white ring-navy-900",
      sim: "bg-[repeating-linear-gradient(135deg,#fff7e6,#fff7e6_6px,#ffeccc_6px,#ffeccc_12px)] text-[#8a5a00] ring-[#f1c46b]",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, dot, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...p}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {p.children}
    </span>
  );
}

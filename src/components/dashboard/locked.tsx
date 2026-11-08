import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LockedCard({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-navy-900 text-white"><Lock className="size-4" /></span>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Button asChild size="sm" variant="secondary"><Link href={href}>{cta}</Link></Button>
    </div>
  );
}

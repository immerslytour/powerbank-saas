"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as D from "@radix-ui/react-dialog";
import {
  BarChart3, BatteryCharging, Building2, ChevronsUpDown, CreditCard, Gauge, LifeBuoy, LogOut, MapPin, Menu,
  Palette, Plug, ReceiptText, Settings, Shield, Users, UsersRound, Wallet, X, FileClock, Webhook, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: string };
const ICONS = {
  gauge: Gauge, battery: BatteryCharging, pin: MapPin, receipt: ReceiptText, users: UsersRound, card: CreditCard,
  chart: BarChart3, team: Users, palette: Palette, plug: Plug, wallet: Wallet, settings: Settings, shield: Shield,
  building: Building2, life: LifeBuoy, audit: FileClock, webhook: Webhook, layers: Layers,
};

type Props = {
  platformName: string;
  title: string;
  subtitle?: string;
  nav: NavItem[];
  footerNav?: NavItem[];
  locale: "en" | "es";
  userEmail: string;
  signOutLabel: string;
  menuLabel: string;
  switchHref?: string;
  switchLabel?: string;
  signOutAction: () => Promise<void>;
};

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || (item.href.split("/").length > 3 && pathname.startsWith(item.href + "/"));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("size-4", active ? "text-[#6aa2ff]" : "text-white/40 group-hover:text-white/70")} />
              <span className="flex-1">{item.label}</span>
              {item.badge && <span className="rounded-full bg-[#2f7bff]/20 px-1.5 text-[10px] text-[#9fc2ff]">{item.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody(p: Props & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-navy-950 bg-grid text-white">
      <div className="px-5 pb-4 pt-5">
        <Logo name={p.platformName} dark />
      </div>
      <div className="mx-3 mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{p.title}</div>
            {p.subtitle && <div className="truncate text-xs text-white/50">{p.subtitle}</div>}
          </div>
          {p.switchHref && (
            <Link href={p.switchHref} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white" title={p.switchLabel}>
              <ChevronsUpDown className="size-4" />
            </Link>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList items={p.nav} onNavigate={p.onNavigate} />
        {p.footerNav && p.footerNav.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <NavList items={p.footerNav} onNavigate={p.onNavigate} />
          </div>
        )}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-2 truncate text-xs text-white/50">{p.userEmail}</div>
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitcher locale={p.locale} dark />
          <form action={p.signOutAction}>
            <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white">
              <LogOut className="size-3.5" />
              {p.signOutLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppShell(props: Props & { children: React.ReactNode; banner?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarBody {...props} />
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-navy-950 px-4 text-white lg:hidden">
        <Logo name={props.platformName} dark />
        <D.Root open={open} onOpenChange={setOpen}>
          <D.Trigger className="rounded-md p-2 hover:bg-white/10" aria-label={props.menuLabel}>
            <Menu className="size-5" />
          </D.Trigger>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
            <D.Content className="fixed inset-y-0 left-0 z-50 w-[82%] max-w-xs shadow-2xl">
              <D.Title className="sr-only">{props.menuLabel}</D.Title>
              <D.Description className="sr-only">{props.title}</D.Description>
              <D.Close className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-white/70 hover:bg-white/10" aria-label="Close">
                <X className="size-5" />
              </D.Close>
              <SidebarBody {...props} onNavigate={() => setOpen(false)} />
            </D.Content>
          </D.Portal>
        </D.Root>
      </header>
      <div className="lg:pl-64">
        {props.banner}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{props.children}</main>
      </div>
    </div>
  );
}

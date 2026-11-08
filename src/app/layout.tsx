import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getLocale } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: publicEnv.platformName, template: `%s · ${publicEnv.platformName}` },
  description: "White-label power bank rental platform: stations, rentals, payments and analytics under your brand.",
  metadataBase: new URL(publicEnv.appUrl),
};

export const viewport: Viewport = {
  themeColor: "#050b1a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

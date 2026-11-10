import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { GooFilters, Logo } from "@/components/goo";
import { NavLinks, NavList } from "@/components/nav-links";
import { AccountMenu } from "@/components/account-menu";
import { ThemeSync, ThemeToggle } from "@/components/theme";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display-face", subsets: ["latin"], axes: ["opsz", "wdth"] });
const serif = Instrument_Serif({ variable: "--font-serif-face", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MilestonePay",
  description: "Pay for outcomes, not promises: milestone payments held in PayPal and released only for AI-verified work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script below sets data-theme and the "dark" class before React hydrates.
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`dark ${display.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <GooFilters />
        <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur">
          <div className="mx-auto flex min-h-14 w-full max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-0 px-5 sm:gap-x-8">
          <Link href="/" className="flex items-center gap-2.5 py-3" aria-label="MilestonePay home">
            <Logo />
            <span className="cond text-[22px] font-extrabold">milestone/pay</span>
          </Link>
          <Suspense fallback={<NavList path="" />}>
            <NavLinks />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ThemeSync />
            <Suspense fallback={<span className="w-10" />}>
              <AccountMenu />
            </Suspense>
          </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 pb-16 pt-8">{children}</main>
        <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-3 border-t border-line-soft px-5 py-6 text-[13px] text-subtle">
          <span>© 2026 MilestonePay</span>
          <span>PayPal sandbox · no real money moves</span>
        </footer>
      </body>
    </html>
  );
}

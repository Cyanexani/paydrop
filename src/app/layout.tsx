import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { GooFilters, Logo } from "@/components/goo";
import { NavLinks, NavList } from "@/components/nav-links";
import { PersonaSwitcher } from "@/components/persona-switcher";
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
    <html lang="en" className={`dark ${display.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <GooFilters />
        <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-2 pt-5">
          <Link href="/" className="flex items-center gap-3 py-1.5" aria-label="MilestonePay home">
            <Logo />
            <span className="cond text-[26px] font-extrabold">milestone/pay</span>
          </Link>
          <Suspense fallback={<NavList path="" />}>
            <NavLinks />
          </Suspense>
          <PersonaSwitcher />
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 pb-16 pt-6">{children}</main>
        <footer className="label mx-auto flex w-full max-w-[1240px] flex-wrap justify-between gap-3 border-t border-line px-5 pb-9 pt-8 text-subtle">
          <span>milestone/pay — PayPal AI Hackathon</span>
          <span>Sandbox · PayPal Orders v2 + Payouts</span>
          <span>No real money moves</span>
        </footer>
      </body>
    </html>
  );
}

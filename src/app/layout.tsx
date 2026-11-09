import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import { NavLinks } from "@/components/nav-links";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { GooFilters, Logo } from "@/components/goo";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MilestonePay",
  description: "Pay for outcomes, not promises: milestone payments held in PayPal and released only for AI-verified work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-zinc-100">
        <GooFilters />
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 rounded-[1.75rem] border border-white/10 bg-plum-900/60 py-2 pl-4 pr-2 shadow-[0_10px_40px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl lg:rounded-full">
            <Link href="/" className="flex items-center gap-2 rounded-full py-1 pr-2" aria-label="MilestonePay home">
              <Logo />
              <span className="font-display text-lg font-bold tracking-tight">
                Milestone<span className="text-magenta">Pay</span>
              </span>
            </Link>
            <NavLinks />
            <div className="ml-auto">
              <PersonaSwitcher />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-8 pt-4 text-xs text-zinc-500">
          <span>MilestonePay · PayPal AI Hackathon</span>
          <span>Sandbox demo. No real money moves.</span>
        </footer>
      </body>
    </html>
  );
}

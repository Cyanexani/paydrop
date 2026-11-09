"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/new", label: "New project" },
  { href: "/contracts", label: "Contracts" },
  { href: "/ledger", label: "Ledger" },
  { href: "/fairness", label: "Fairness" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="order-last -mx-2 flex w-[calc(100%+1rem)] items-center gap-1 overflow-x-auto text-sm lg:order-none lg:mx-0 lg:w-auto">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
              active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {active && <span aria-hidden className="absolute left-1/2 top-0.5 size-1 -translate-x-1/2 rounded-full bg-magenta" />}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

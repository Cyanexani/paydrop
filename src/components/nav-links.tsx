"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/new", label: "New project" },
  { href: "/contracts", label: "Contracts" },
  { href: "/ledger", label: "Ledger" },
  { href: "/fairness", label: "Fairness" },
];

/** Highlights the current page. Reads the URL, so the layout renders it inside <Suspense>. */
export function NavLinks() {
  return <NavList path={usePathname()} />;
}

/** The nav itself; with an empty path (the Suspense fallback) nothing is highlighted. */
export function NavList({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="order-last -mx-3 flex w-[calc(100%+1.5rem)] overflow-x-auto lg:order-none lg:mx-0 lg:w-auto">
      {LINKS.map((l, i) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`label whitespace-nowrap px-3 py-3.5 transition-colors hover:text-butter ${active ? "text-paper underline decoration-magenta decoration-2 underline-offset-[6px]" : "text-muted"}`}
          >
            <span className="text-magenta">0{i + 1}</span> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

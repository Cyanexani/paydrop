"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

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

interface Ink {
  left: number;
  right: number;
  on: boolean;
  /** 1 when the bar last moved right, -1 when it moved left: the leading edge moves first. */
  dir: 1 | -1;
}

/**
 * The nav itself. A magenta ink bar sits under the current page; pointing at another link
 * stretches the bar toward it like liquid, and it snaps back when the pointer leaves.
 * With an empty path (the Suspense fallback) nothing is highlighted.
 */
export function NavList({ path }: { path: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<Ink | null>(null);
  const active = LINKS.findIndex((l) => path === l.href || path.startsWith(`${l.href}/`));

  const place = useCallback((index: number) => {
    const el = row.current;
    const a = el?.querySelectorAll("a")[index];
    if (!el || !a) return setInk((prev) => (prev ? { ...prev, on: false } : null));
    const left = a.offsetLeft + 12;
    const right = el.offsetWidth - a.offsetLeft - a.offsetWidth + 12;
    setInk((prev) => ({ left, right, on: true, dir: prev && left < prev.left ? -1 : 1 }));
  }, []);

  // Measure once laid out, and again whenever the row resizes (fonts loading, rotation).
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => place(active));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, place]);

  return (
    <nav aria-label="Main" className="order-last -mx-3 w-[calc(100%+1.5rem)] overflow-x-auto md:order-none md:mx-0 md:w-auto">
      <div ref={row} className="relative inline-flex" onPointerLeave={() => place(active)}>
        {LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={i === active ? "page" : undefined}
            onPointerEnter={(e) => e.pointerType === "mouse" && place(i)}
            className={`whitespace-nowrap px-3 py-4 text-sm font-medium transition-colors hover:text-paper ${i === active ? "text-paper" : "text-muted"}`}
          >
            {l.label}
          </Link>
        ))}
        <span
          aria-hidden
          className="nav-ink"
          style={
            {
              left: ink?.left ?? "50%",
              right: ink?.right ?? "50%",
              opacity: ink?.on ? 1 : 0,
              "--tl": ink?.dir === 1 ? "0.5s" : "0.22s",
              "--tr": ink?.dir === 1 ? "0.22s" : "0.5s",
            } as CSSProperties
          }
        />
      </div>
    </nav>
  );
}

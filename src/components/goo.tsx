import type { CSSProperties } from "react";

/** SVG filters that make overlapping dots melt together. Rendered once in the root layout. */
export function GooFilters() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <filter id="goo-sm">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
        </filter>
      </defs>
    </svg>
  );
}

/** Gooey dots loader: three dots orbit a core, merging and splitting like liquid. */
export function GooLoader({ size = 40, label = "Loading", className = "" }: { size?: number; label?: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-3 ${className}`}>
      <span className="goo-loader" style={{ "--size": `${size}px` } as CSSProperties} aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className={size >= 32 ? "text-sm text-zinc-400" : "sr-only"}>{label}…</span>
    </span>
  );
}

/** Full-width loading block for pages and panels. */
export function GooBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <GooLoader size={56} label={label} />
    </div>
  );
}

/** The mark: two dots pulling apart, merged by the goo filter. */
export function Logo() {
  return (
    <span className="goo-sm relative block size-8" aria-hidden>
      <span className="absolute left-1 top-2.5 size-3.5 rounded-full bg-magenta" />
      <span className="logo-dot absolute left-3 top-2 size-3 rounded-full bg-peach" />
      <span className="absolute left-4 top-4 size-2.5 rounded-full bg-butter" />
    </span>
  );
}

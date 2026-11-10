import type { CSSProperties } from "react";

/** SVG filters that make overlapping dots melt together. Rendered once in the root layout. */
export function GooFilters() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <filter id="goo-lg">
          <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <filter id="goo-sm">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
        </filter>
        <filter id="goo-md">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
      </defs>
    </svg>
  );
}

type Kind = "glide" | "orbit" | "drip";

/**
 * Gooey dots loader. glide: scoping and general loading; orbit: the checker at work;
 * drip: waiting for PayPal. `size` is the dot diameter in px.
 */
export function GooLoader({ kind = "glide", size = 18, label = "Loading", showLabel = true, className = "" }: {
  kind?: Kind;
  size?: number;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const cls = { glide: "gl", orbit: "go", drip: "gd" }[kind];
  const dots = kind === "glide" ? 4 : 3;
  return (
    <span role="status" className={`inline-flex items-center gap-3 ${className}`}>
      <span className={cls} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden>
        {Array.from({ length: dots }, (_, i) => <span key={i} />)}
      </span>
      <span className={showLabel ? "label text-subtle" : "sr-only"}>{label}…</span>
    </span>
  );
}

/** Full-width loading block for pages and panels. */
export function GooBlock({ label = "Loading", kind = "glide" }: { label?: string; kind?: Kind }) {
  return (
    <div className="flex min-h-56 items-center justify-center">
      <GooLoader kind={kind} size={22} label={label} />
    </div>
  );
}

/** The mark: three dots, one drifting in and out of the others. */
export function Logo() {
  return (
    <span className="goo-md relative block h-7 w-10" aria-hidden>
      <span className="absolute left-0.5 top-1.5 size-[18px] rounded-full bg-magenta" />
      <span className="logo-dot absolute left-3.5 top-0.5 size-3.5 rounded-full bg-peach" />
      <span className="absolute left-[22px] top-3 size-3 rounded-full bg-butter" />
    </span>
  );
}

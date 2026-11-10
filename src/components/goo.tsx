import type { CSSProperties } from "react";

type Kind = "glide" | "orbit" | "drip";

/** Spinner with a label. `kind` is accepted for older call sites and ignored. */
export function GooLoader({ size = 18, label = "Loading", showLabel = true, className = "" }: {
  kind?: Kind;
  size?: number;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span role="status" className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="spin" style={{ "--s": `${Math.max(14, Math.min(size, 22))}px` } as CSSProperties} aria-hidden />
      <span className={showLabel ? "text-sm text-subtle" : "sr-only"}>{label}…</span>
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

/** The mark: a tick inside a rounded square. */
export function Logo() {
  return (
    <span className="grid size-7 place-items-center rounded-lg bg-butter text-plum" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  );
}

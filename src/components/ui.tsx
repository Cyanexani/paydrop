import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary:
      "bg-butter text-plum-800 shadow-[0_8px_24px_-10px_rgb(255_247_173/0.6)] hover:-translate-y-px hover:bg-white disabled:translate-y-0 disabled:bg-butter/40 disabled:text-plum-800/60 disabled:shadow-none",
    secondary: "border border-white/15 bg-white/5 text-zinc-100 hover:border-white/30 hover:bg-white/10",
    danger: "border border-[#ff8a8a]/40 text-[#ffb0b0] hover:bg-[#ff8a8a]/10",
  }[variant];
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-plum-900/55 p-6 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.7)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

type Tone = "neutral" | "info" | "good" | "warn" | "bad";

const STATUS: Record<string, { label: string; tone: Tone; live?: boolean }> = {
  offered: { label: "Offered", tone: "neutral" },
  accepted: { label: "Accepted · not funded", tone: "neutral" },
  funding: { label: "Waiting for PayPal", tone: "info", live: true },
  funded: { label: "Funded · held in PayPal", tone: "info" },
  submitted: { label: "Checking", tone: "info", live: true },
  changes_requested: { label: "Changes requested", tone: "warn" },
  needs_review: { label: "Client review", tone: "warn" },
  verified: { label: "Verified", tone: "good" },
  releasing: { label: "Releasing", tone: "info", live: true },
  release_pending: { label: "Release pending at PayPal", tone: "info", live: true },
  release_failed: { label: "Release failed · re-fund", tone: "bad" },
  released: { label: "Released", tone: "good" },
  payout_pending: { label: "Payout pending", tone: "info", live: true },
  paid_out: { label: "Paid out", tone: "good" },
  disputed: { label: "Disputed", tone: "bad" },
  voided: { label: "Voided", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  active: { label: "Active", tone: "info" },
  completed: { label: "Completed", tone: "good" },
};

/** Dot colour per tone; shared with timelines so a milestone's dot matches its pill. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: "#b48ea9",
  info: "#ff49c1",
  good: "#fff7ad",
  warn: "#ffb3ae",
  bad: "#ff6b6b",
};

export function statusTone(status: string): Tone {
  return STATUS[status]?.tone ?? "neutral";
}

/** A glass chip with a coloured dot, like a swatch on a palette card. */
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.07] py-1 pl-1.5 pr-3 text-xs font-medium text-zinc-100 backdrop-blur">
      <span
        aria-hidden
        className={`size-3.5 rounded-full ring-2 ring-white/15 ${s.live ? "dot-live" : ""}`}
        style={{ background: TONE_DOT[s.tone] }}
      />
      {s.label}
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-3 rounded-2xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 px-4 py-3 text-sm text-[#ffd0d0]">
      <span aria-hidden className="mt-1 size-2.5 flex-none rounded-full bg-[#ff6b6b]" />
      {error}
    </p>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="animate-rise space-y-2">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-peach">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      {children && <div className="max-w-2xl text-zinc-400">{children}</div>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-white/10 bg-plum-950/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-magenta/70 focus:outline-none focus:ring-4 focus:ring-magenta/15";

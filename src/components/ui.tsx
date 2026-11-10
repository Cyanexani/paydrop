import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-butter text-plum hover:bg-white disabled:bg-butter/40 disabled:text-plum/60",
    secondary: "border border-paper/35 text-paper hover:border-paper/70",
    danger: "border border-danger/50 text-[#ffc2c2] hover:bg-danger/10",
  }[variant];
  return (
    <button
      className={`jelly inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full px-6 py-2 text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-line-soft bg-raised p-6 ${className}`}>{children}</div>;
}

type Tone = "neutral" | "held" | "checking" | "paid" | "warn" | "bad";

const STATUS: Record<string, { label: string; tone: Tone; live?: boolean }> = {
  offered: { label: "Offered", tone: "neutral" },
  accepted: { label: "Accepted · not funded", tone: "neutral" },
  funding: { label: "Waiting for PayPal", tone: "held", live: true },
  funded: { label: "Funded · held", tone: "held" },
  submitted: { label: "Checking", tone: "checking", live: true },
  changes_requested: { label: "Changes requested", tone: "warn" },
  needs_review: { label: "Your call", tone: "checking" },
  verified: { label: "Verified", tone: "checking" },
  releasing: { label: "Releasing", tone: "paid", live: true },
  release_pending: { label: "Release pending", tone: "paid", live: true },
  release_failed: { label: "Release failed · re-fund", tone: "bad" },
  released: { label: "Released", tone: "paid" },
  payout_pending: { label: "Payout pending", tone: "paid", live: true },
  paid_out: { label: "Paid out", tone: "paid" },
  disputed: { label: "Disputed", tone: "bad" },
  voided: { label: "Voided", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  active: { label: "Active", tone: "held" },
  completed: { label: "Completed", tone: "paid" },
};

/** Swatch colour per tone; the contract's money drops use the same colours. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--tone-neutral)",
  held: "var(--tone-held)",
  checking: "var(--tone-check)",
  paid: "var(--tone-paid)",
  warn: "var(--tone-check)",
  bad: "var(--tone-bad)",
};

/** Text colour per tone: the swatch colour on dark, a darker shade of it on light. */
export const TONE_INK: Record<Tone, string> = {
  neutral: "var(--color-muted)",
  held: "var(--ink-held)",
  checking: "var(--ink-check)",
  paid: "var(--ink-paid)",
  warn: "var(--ink-check)",
  bad: "var(--ink-bad)",
};

export function statusTone(status: string): Tone {
  return STATUS[status]?.tone ?? "neutral";
}

/** A swatch chip, like the colour chips on a palette card. */
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className="chip">
      <span key={status} aria-hidden className={`sw pop-in ${s.live ? "sw-live" : ""}`} style={{ background: TONE_COLOR[s.tone] }} />
      {s.label}
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-[15px] text-[#ffd6d6]">
      <span aria-hidden className="mt-1.5 size-2.5 flex-none rounded-full bg-danger" />
      {error}
    </p>
  );
}

/** Poster-style page title: mono eyebrow, huge condensed headline, optional aside. */
export function PageHeader({ eyebrow, title, aside, children }: { eyebrow?: string; title: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-6 border-b border-line pb-7">
      <div className="flex min-w-0 flex-col gap-3">
        {eyebrow && <span className="label text-peach">{eyebrow}</span>}
        <h1 className="cond text-[clamp(56px,8.5vw,120px)] font-extrabold leading-[0.84]">{title}</h1>
      </div>
      {(aside || children) && <div className="max-w-sm text-base leading-relaxed text-muted">{aside ?? children}</div>}
    </div>
  );
}

/** Section heading with a hairline under it. */
export function SectionHead({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
      <h2 className="cond text-[40px] font-extrabold leading-none">{title}</h2>
      {note && <span className="label text-subtle">{note}</span>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-[var(--c-input)] px-4 py-3 text-[15px] text-paper placeholder:text-subtle/70 transition-colors focus:border-magenta focus:outline-none focus:ring-4 focus:ring-magenta/15";

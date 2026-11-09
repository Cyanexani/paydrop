import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50",
    secondary:
      "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
    danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad" }> = {
  offered: { label: "Offered", tone: "neutral" },
  accepted: { label: "Accepted · not funded", tone: "neutral" },
  funding: { label: "Waiting for PayPal", tone: "info" },
  funded: { label: "Funded · held in PayPal", tone: "info" },
  submitted: { label: "Checking", tone: "info" },
  changes_requested: { label: "Changes requested", tone: "warn" },
  needs_review: { label: "Client review", tone: "warn" },
  verified: { label: "Verified", tone: "good" },
  releasing: { label: "Releasing", tone: "info" },
  release_pending: { label: "Release pending at PayPal", tone: "info" },
  release_failed: { label: "Release failed · re-fund", tone: "bad" },
  released: { label: "Released", tone: "good" },
  payout_pending: { label: "Payout pending", tone: "info" },
  paid_out: { label: "Paid out", tone: "good" },
  disputed: { label: "Disputed", tone: "bad" },
  voided: { label: "Voided", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  active: { label: "Active", tone: "info" },
  completed: { label: "Completed", tone: "good" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  const tone = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  }[s.tone];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{s.label}</span>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {error}
    </p>
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

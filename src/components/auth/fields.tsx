"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { GooLoader } from "../goo";

const field =
  "min-h-12 w-full rounded-2xl border bg-[var(--c-input)] px-4 text-[15px] text-paper placeholder:text-subtle/60 transition-colors focus:outline-none focus:ring-4";
const ok = "border-line focus:border-magenta focus:ring-magenta/15";
const bad = "border-danger/70 focus:border-danger focus:ring-danger/15";

/** Split the API's "path: message; path: message" validation text into field errors. */
export function fieldErrors(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of message.split("; ")) {
    const i = part.indexOf(": ");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 2);
  }
  return out;
}

export function TextField({ label, error, hint, action, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {action}
      </div>
      <input
        id={id}
        className={`${field} ${error ? bad : ok}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${id}-err`} className="text-[13px] text-[#ffc2c2]">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** Rough strength from length and variety; the server's rules are what decide. */
export function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : pw.length >= 10 ? 1 : 0;
  if (kinds >= 3 && score > 0) score++;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ["Too short", "Okay", "Good", "Strong", "Very strong"][s] };
}

const METER = ["var(--tone-bad)", "var(--tone-check)", "var(--tone-paid)", "#9ff0c5", "#9ff0c5"];

export function PasswordField({ label, error, meter, action, value, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  error?: string;
  meter?: boolean;
  action?: ReactNode;
  value: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const s = strength(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {action}
      </div>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          className={`${field} pr-20 ${error ? bad : ok}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          value={value}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-pressed={shown}
          aria-controls={id}
          className="label absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-subtle hover:text-butter"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <div id={`${id}-help`}>
        {meter && value && (
          <div className="flex items-center gap-3 pt-1" aria-live="polite">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: s.score >= i ? METER[s.score] : "var(--color-line)" }} />
              ))}
            </div>
            <span className="label w-24 text-right text-subtle">{s.label}</span>
          </div>
        )}
        {error ? (
          <p className="pt-1 text-[13px] text-[#ffc2c2]">{error}</p>
        ) : meter ? (
          <p className="pt-1 text-[13px] text-subtle">At least 10 characters. A few unrelated words make a strong one.</p>
        ) : null}
      </div>
    </div>
  );
}

export function SubmitButton({ busy, children, busyLabel }: { busy: boolean; children: ReactNode; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="jelly inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full bg-butter px-6 text-[16px] font-bold text-plum hover:bg-white disabled:cursor-wait disabled:opacity-80"
    >
      {busy ? (
        <>
          <GooLoader kind="glide" size={9} label={busyLabel} showLabel={false} />
          {busyLabel}…
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Form-level message (wrong password, rate limited, server error). */
export function FormAlert({ message, tone = "error" }: { message: string | null; tone?: "error" | "info" }) {
  if (!message) return null;
  const color = tone === "error" ? "var(--tone-bad)" : "var(--tone-check)";
  return (
    <p role={tone === "error" ? "alert" : "status"} className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-[15px]" style={{ borderColor: `${color}66`, background: `${color}1a` }}>
      <span aria-hidden className="mt-1.5 size-2.5 flex-none rounded-full" style={{ background: color }} />
      {message}
    </p>
  );
}

/** Only same-site paths are allowed as a return address (no open redirects). */
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/^\/(login|signup|forgot-password|reset-password)(\/|\?|$)/.test(next)) return fallback;
  return next;
}

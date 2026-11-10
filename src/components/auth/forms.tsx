"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SKILL_LABELS } from "@/lib/pricing/config";
import { ApiError, api, type Session } from "../api";
import { GooLoader } from "../goo";
import { FormAlert, PasswordField, SubmitButton, TextField, fieldErrors, safeNext } from "./fields";

type SignedIn = { user: { id: string; name: string; role: "client" | "freelancer" } };

/** Full page load to `path`: signing in or out must drop the router's cache (it holds pages
 * prefetched while signed out, which redirect to sign-in) and every component's state. */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

/** After sign-in: back where they were going, else a sensible home for their role. */
function useLanding() {
  const params = useSearchParams();
  return (role: "client" | "freelancer", fresh = false) => {
    const fallback = role === "client" && fresh ? "/new" : "/contracts";
    hardNavigate(safeNext(params.get("next"), fallback));
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** onChange for a field: update its value and drop that field's error, which no longer applies. */
function editor(setFields: React.Dispatch<React.SetStateAction<Record<string, string>>>) {
  return (key: string, set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setFields((f) => {
      if (!(key in f)) return f;
      const rest = { ...f };
      delete rest[key];
      return rest;
    });
  };
}

/* ------------------------------------------------------------------ sign in */

export function LoginForm() {
  const params = useSearchParams();
  const land = useLanding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const next = params.get("next");
  const reset = params.get("reset") === "1";
  const edit = editor(setFields);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const { user } = await api<SignedIn>("/api/auth/login", { body: { email, password } });
      land(user.role);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_input") setFields(fieldErrors(err.message));
      else setError(message(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <SignedInNotice />
      {next && <FormAlert tone="info" message="Sign in to continue to that page." />}
      {reset && <FormAlert tone="info" message="Your password was changed. You're signed out everywhere else." />}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TextField label="Email" type="email" name="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={edit("email", setEmail)} error={fields.email} />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={edit("password", setPassword)}
          error={fields.password}
          action={<Link href="/forgot-password" className="text-[13px] text-peach hover:text-butter">Forgot password?</Link>}
        />
        <FormAlert message={error} />
        <SubmitButton busy={busy} busyLabel="Signing in">Sign in</SubmitButton>
      </form>
      <DemoAccounts />
    </div>
  );
}

/** Already signed in: say so, and offer to continue or switch. */
function SignedInNotice() {
  const [session, setSession] = useState<Session | null>(null);
  const land = useLanding();
  useEffect(() => {
    api<Session>("/api/session").then(setSession).catch(() => undefined);
  }, []);
  const v = session?.viewer;
  if (!v) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-well px-4 py-3 text-[15px]">
      <span>Signed in as <strong>{v.name}</strong></span>
      <button type="button" onClick={() => land(v.role)} className="label text-peach hover:text-butter">Continue →</button>
    </div>
  );
}

/* ------------------------------------------------------------------ demo accounts */

const DEMO_NOTES: Record<string, string> = {
  "client-jaya": "Client with contracts at every stage",
  "client-demo": "Client with a clean slate",
  "fl-ravi": "Freelancer, and BuildBot's owner",
  "fl-meera": "Expert freelancer, sends a counter-offer",
  "fl-asha": "New freelancer, no track record yet",
};

/** One-click demo accounts for judges. Hidden when the deployment turns demo sign-in off. */
function DemoAccounts() {
  const land = useLanding();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Session>("/api/session").then(setSession).catch(() => undefined);
  }, []);
  if (!session?.demoEnabled || session.personas.length === 0) return null;
  async function use(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { user } = await api<SignedIn>("/api/auth/demo", { body: { userId: id } });
      land(user.role);
    } catch (err) {
      setError(message(err));
      setBusy(null);
    }
  }
  return (
    <section aria-labelledby="demo-h" className="space-y-3 rounded-[24px] border border-dashed border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="demo-h" className="label text-peach">Explore with a demo account</h2>
        <span className="label text-subtle">No password</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {session.personas.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => use(p.id)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-2xl border border-line-soft bg-well px-3 py-2.5 text-left transition-colors hover:border-wine disabled:opacity-60"
            >
              <span aria-hidden className="grid size-9 flex-none place-items-center rounded-full text-sm font-bold text-plum" style={{ background: p.role === "client" ? "#fff7ad" : "#ffb3ae" }}>
                {busy === p.id ? <GooLoader kind="orbit" size={6} label="Signing in" showLabel={false} /> : initials(p.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-subtle">{DEMO_NOTES[p.id] ?? (p.role === "client" ? "Client" : "Freelancer")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <FormAlert message={error} />
    </section>
  );
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/* ------------------------------------------------------------------ create account */

const SKILLS = ["web_dev", "ui_design", "video_editing"] as const;

export function SignupForm() {
  const params = useSearchParams();
  const land = useLanding();
  const [role, setRole] = useState<"client" | "freelancer">(params.get("role") === "freelancer" ? "freelancer" : "client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [skills, setSkills] = useState<string[]>(["web_dev"]);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const edit = editor(setFields);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!terms) {
      setFields({ acceptTerms: "Accept the terms to create an account" });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = { name, email, password, role, acceptTerms: true, ...(role === "freelancer" ? { skills, paypalEmail } : {}) };
      const { user } = await api<SignedIn>("/api/auth/signup", { body });
      land(user.role, true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_input") setFields(fieldErrors(err.message));
      else setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">I&apos;m here to</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["client", "Hire", "Get work done, pay per milestone", "#fff7ad"],
              ["freelancer", "Work", "Get paid when the work passes", "#ffb3ae"],
            ] as const
          ).map(([value, title, sub, color]) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-magenta/25 ${role === value ? "border-magenta bg-magenta/10" : "border-line hover:border-wine"}`}
            >
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
              <span className="flex items-center gap-2 font-semibold"><span aria-hidden className="sw size-3.5" style={{ background: color }} />{title}</span>
              <span className="text-xs leading-snug text-subtle">{sub}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField label={role === "client" ? "Your name or business" : "Your name"} name="name" autoComplete={role === "client" ? "organization" : "name"} required value={name} onChange={edit("name", setName)} error={fields.name} />
      <TextField label="Email" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={edit("email", setEmail)} error={fields.email} />
      <PasswordField label="Password" name="new-password" autoComplete="new-password" required meter value={password} onChange={edit("password", setPassword)} error={fields.password} />

      {role === "freelancer" && (
        <div className="rise space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">What you do</legend>
            <div className="flex flex-wrap gap-2">
              {SKILLS.map((s) => {
                const on = skills.includes(s);
                return (
                  <label key={s} className={`chip cursor-pointer py-1.5 pl-1.5 pr-3.5 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-magenta ${on ? "border-magenta bg-magenta/15" : ""}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])} />
                    <span aria-hidden className="sw size-4" style={{ background: on ? "#ff49c1" : "#4a2a42" }} />
                    {SKILL_LABELS[s]}
                  </label>
                );
              })}
            </div>
            {fields.skills && <p className="pt-1.5 text-[13px] text-[#ffc2c2]">{fields.skills}</p>}
          </fieldset>
          <TextField
            label="PayPal email for payouts"
            type="email"
            name="paypal"
            autoComplete="off"
            placeholder={email || "Same as your email"}
            value={paypalEmail}
            onChange={edit("paypalEmail", setPaypalEmail)}
            error={fields.paypalEmail}
            hint="Where released milestones are paid. Leave empty to use your sign-in email."
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="flex items-start gap-3 text-sm leading-snug">
          <input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setFields((f) => { const rest = { ...f }; delete rest.acceptTerms; return rest; }); }} className="mt-0.5 size-5 flex-none accent-[#ff49c1]" aria-invalid={fields.acceptTerms ? true : undefined} />
          <span>I agree to the terms of use and privacy notice, and understand this is a sandbox: no real money moves.</span>
        </label>
        {fields.acceptTerms && <p className="pl-8 text-[13px] text-[#ffc2c2]">{fields.acceptTerms}</p>}
      </div>

      <FormAlert message={error} />
      <SubmitButton busy={busy} busyLabel="Creating your account">Create account</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------------ forgot password */

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "email" | "log" | "none">(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ delivery: "email" | "log" | "none" }>("/api/auth/forgot", { body: { email } });
      setSent(r.delivery);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_input" ? "Enter a valid email address" : message(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rise space-y-4" role="status">
        <FormAlert tone="info" message={`If an account uses ${email}, a reset link is on its way. It works once, for 30 minutes.`} />
        {sent === "log" && <p className="text-sm text-subtle">Development mode: email isn&apos;t set up, so the link is printed in the server log.</p>}
        {sent === "none" && <p className="text-sm text-subtle">Email delivery isn&apos;t set up on this deployment yet, so no link was sent. Contact the site&apos;s owner.</p>}
        <button type="button" onClick={() => setSent(null)} className="label text-peach hover:text-butter">Use a different email</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Email" type="email" name="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <FormAlert message={error} />
      <SubmitButton busy={busy} busyLabel="Sending">Send reset link</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------------ reset password */

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password ? "The passwords don't match" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api<SignedIn>("/api/auth/reset", { body: { token, password } });
      hardNavigate("/contracts");
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <FormAlert message="This page needs the link from your reset email." />
        <Link href="/forgot-password" className="label text-peach hover:text-butter">Ask for a new link →</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <PasswordField label="New password" name="new-password" autoComplete="new-password" required meter autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <PasswordField label="Confirm new password" name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch} />
      <FormAlert message={error} />
      {error && /expired|already used/.test(error) && <Link href="/forgot-password" className="label block text-peach hover:text-butter">Ask for a new link →</Link>}
      <SubmitButton busy={busy} busyLabel="Saving">Save password and sign in</SubmitButton>
    </form>
  );
}

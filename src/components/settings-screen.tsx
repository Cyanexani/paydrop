"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SKILLS, SKILL_LABELS, type Skill } from "@/lib/pricing/config";
import { api } from "./api";
import { FormAlert, PasswordField, TextField, fieldErrors } from "./auth/fields";
import { GooBlock } from "./goo";
import { agoLabel } from "./presence";
import { useThemeChoice, type ThemeChoice } from "./theme";
import { Button, ErrorNote, PageHeader } from "./ui";

interface Account {
  id: string;
  name: string;
  role: "client" | "freelancer";
  email: string | null;
  emailVerified: boolean;
  headline: string | null;
  skills: Skill[];
  paypalEmail: string | null;
  hasPassword: boolean;
  demo: boolean;
  memberSince: string;
}

interface Device {
  id: string;
  device: string;
  demo: boolean;
  current: boolean;
  signedInAt: string;
  lastSeenAt: string;
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b border-line-soft py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <h2 className="cond text-2xl font-extrabold">{title}</h2>
        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      <div className="min-w-0 max-w-xl space-y-4">{children}</div>
    </section>
  );
}

const Saved = ({ text }: { text: string | null }) =>
  text ? <p role="status" className="text-sm font-semibold" style={{ color: "var(--ink-paid)" }}>✓ {text}</p> : null;

export function SettingsScreen() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ account: Account }>("/api/account").then((d) => setAccount(d.account)).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <PageHeader title="Settings">Your profile, password, signed-in devices and how the app looks.</PageHeader>
      <ErrorNote error={error} />
      {!account && !error && <GooBlock label="Loading your settings" />}
      {account && (
        <>
          {account.demo && (
            <div className="pt-6">
              <FormAlert tone="info" message="You're using a shared demo account, so its profile and password can't be changed. Create your own account to try those." />
            </div>
          )}
          <ProfileSection account={account} onSaved={setAccount} />
          <EmailSection account={account} />
          {account.hasPassword && !account.demo && <PasswordSection />}
          <DevicesSection />
          <ThemeSection />
        </>
      )}
    </div>
  );
}

function ProfileSection({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const freelancer = account.role === "freelancer";
  const [name, setName] = useState(account.name);
  const [headline, setHeadline] = useState(account.headline ?? "");
  const [skills, setSkills] = useState<Skill[]>(account.skills);
  const [paypalEmail, setPaypalEmail] = useState(account.paypalEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const locked = account.demo;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSaved(null);
    try {
      const body = freelancer ? { name, headline, skills, paypalEmail } : { name };
      const { account: updated } = await api<{ account: Account }>("/api/account", { body });
      // Show what the server stored (trimmed name, lower-cased email), not what was typed.
      onSaved(updated);
      setName(updated.name);
      setHeadline(updated.headline ?? "");
      setSkills(updated.skills);
      setPaypalEmail(updated.paypalEmail ?? "");
      setSaved("Profile saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const f = fieldErrors(message);
      if (Object.keys(f).length) setFields(f);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Profile"
      note={freelancer ? <>Clients see this on <Link href={`/u/${account.id}`} className="font-semibold text-peach underline-offset-2 hover:text-butter hover:underline">your public profile</Link>. Your track record there comes from verified work and can&apos;t be edited.</> : "The name freelancers see on your contracts."}
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <TextField label={freelancer ? "Name" : "Your name or business"} value={name} onChange={(e) => setName(e.target.value)} error={fields.name} disabled={locked} maxLength={80} required autoComplete="name" />
        {freelancer && (
          <>
            <TextField label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} error={fields.headline} disabled={locked} maxLength={120} hint="One line about what you do, e.g. “Booking and payments for small studios”." />
            <fieldset disabled={locked}>
              <legend className="mb-2 text-sm font-semibold">Skills</legend>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map((s) => {
                  const on = skills.includes(s);
                  return (
                    <label key={s} className={`chip cursor-pointer py-1.5 pl-1.5 pr-3.5 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-magenta ${on ? "border-magenta bg-magenta/15" : ""} ${locked ? "cursor-not-allowed opacity-60" : ""}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])} />
                      <span aria-hidden className="sw size-4" style={{ background: on ? "var(--c-accent)" : "var(--tone-empty)" }} />
                      <span className="first-letter:uppercase">{SKILL_LABELS[s]}</span>
                    </label>
                  );
                })}
              </div>
              {fields.skills ? <p className="pt-1.5 text-[13px] text-[#ffc2c2]">{fields.skills}</p> : <p className="pt-1.5 text-[13px] text-subtle">You&apos;re only offered projects that match every skill they need.</p>}
            </fieldset>
            <TextField label="PayPal email for payouts" type="email" inputMode="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} error={fields.paypalEmail} disabled={locked} hint="Released milestones are paid to this PayPal account. Milestones already funded keep the address they were funded with." />
          </>
        )}
        <FormAlert message={error} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy || locked}>{busy ? "Saving…" : "Save profile"}</Button>
          <Saved text={saved} />
        </div>
      </form>
    </Section>
  );
}

function EmailSection({ account }: { account: Account }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<{ delivery: "email" | "log" | "none"; alreadyVerified: boolean }>("/api/account/verify-email", { body: {} });
      setNote({
        tone: r.delivery === "none" ? "error" : "info",
        text: r.alreadyVerified
          ? "This email is already verified. Reload the page to see the badge."
          : r.delivery === "email"
            ? `We've sent a link to ${account.email}. It works once and expires in 24 hours.`
            : r.delivery === "log"
              ? "Email isn't set up on this server, so the link was printed in the server log (development only)."
              : "This server can't send email yet, so no link was sent. Ask whoever runs it to set up email.",
      });
    } catch (err) {
      setNote({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Email" note="You sign in with this address. Verifying it adds a badge to your profile.">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 break-all text-[15px] font-semibold">{account.email ?? "No email on this account"}</span>
        {account.email && (
          <span className="chip">
            <span className="sw" style={{ background: account.emailVerified ? "var(--tone-paid)" : "var(--tone-check)" }} />
            {account.emailVerified ? "Verified" : "Not verified"}
          </span>
        )}
      </div>
      {account.email && !account.emailVerified && !account.demo && (
        <Button variant="secondary" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send verification link"}</Button>
      )}
      {account.demo && <p className="text-sm text-subtle">Demo accounts use example addresses, so there is nothing to verify.</p>}
      {note && <FormAlert tone={note.tone} message={note.text} />}
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSaved(null);
    try {
      await api("/api/account/password", { body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setSaved("Password changed. Your other devices were signed out.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const f = fieldErrors(message);
      if (Object.keys(f).length) setFields(f);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Password" note="Changing it signs you out everywhere except this device.">
      <form onSubmit={save} className="space-y-4" noValidate>
        <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} required />
        <PasswordField label="New password" autoComplete="new-password" meter value={next} onChange={(e) => setNext(e.target.value)} error={fields.newPassword} required />
        <FormAlert message={error} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy || !current || !next}>{busy ? "Changing…" : "Change password"}</Button>
          <Saved text={saved} />
        </div>
      </form>
    </Section>
  );
}

function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ devices: Device[] }>("/api/account/devices").then((d) => setDevices(d.devices)).catch((e: Error) => { setDevices([]); setError(e.message); });
  }, []);
  useEffect(load, [load]);

  async function signOut(sessionId?: string) {
    setBusy(sessionId ?? "all");
    setError(null);
    setSaved(null);
    try {
      const r = await api<{ signedOut: number; devices: Device[] }>("/api/account/devices", { body: sessionId ? { sessionId } : {} });
      setDevices(r.devices ?? []);
      setSaved(r.signedOut === 1 ? "Signed out 1 device" : `Signed out ${r.signedOut} devices`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const others = devices?.filter((d) => !d.current) ?? [];
  return (
    <Section title="Devices" note="Everywhere this account is signed in. Sign out any you don't recognise, then change your password.">
      {devices === null ? (
        <GooBlock label="Loading devices" />
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-raised">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="flex flex-wrap items-center gap-2 text-[15px]">
                  {d.device}
                  {d.current && <span className="chip"><span className="sw" style={{ background: "var(--tone-paid)" }} />This device</span>}
                </strong>
                <span className="text-[13px] text-subtle">
                  {d.current ? "Active now" : `Last active ${agoLabel(d.lastSeenAt)}`} · signed in {new Date(d.signedInAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  {d.demo ? " · demo sign-in" : ""}
                </span>
              </span>
              {!d.current && (
                <Button variant="secondary" className="min-h-9 px-4 text-sm" disabled={busy !== null} onClick={() => signOut(d.id)}>
                  {busy === d.id ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormAlert message={error} />
      <div className="flex flex-wrap items-center gap-4">
        {others.length > 0 && (
          <Button variant="danger" disabled={busy !== null} onClick={() => signOut()}>
            {busy === "all" ? "Signing out…" : `Sign out ${others.length === 1 ? "the other device" : `all ${others.length} other devices`}`}
          </Button>
        )}
        {devices !== null && others.length === 0 && !saved && <p className="text-sm text-subtle">You&apos;re only signed in here.</p>}
        <Saved text={saved} />
      </div>
    </Section>
  );
}

const THEMES: { id: ThemeChoice; label: string; note: string }[] = [
  { id: "dark", label: "Dark", note: "Plum on black" },
  { id: "light", label: "Light", note: "Warm white" },
  { id: "system", label: "System", note: "Match this device" },
];

function ThemeSection() {
  const [choice, setChoice] = useThemeChoice();
  return (
    <Section title="Appearance" note="Saved on this device.">
      <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const on = choice === t.id;
          return (
            <label key={t.id} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-4 py-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-magenta/25 ${on ? "border-magenta bg-magenta/10" : "border-line hover:border-paper/50"}`}>
              <input type="radio" name="theme" className="sr-only" checked={on} onChange={() => setChoice(t.id)} />
              <span className="flex items-center justify-between gap-2 text-[15px] font-semibold">
                {t.label}
                <span aria-hidden className="grid size-4 place-items-center rounded-full border border-paper/50">{on && <span className="size-2 rounded-full bg-magenta" />}</span>
              </span>
              <span className="text-[13px] text-subtle">{t.note}</span>
            </label>
          );
        })}
      </div>
    </Section>
  );
}

"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { PublicProfile } from "@/server/auth/profile";
import { api, ApiError } from "./api";
import { initials } from "./auth/forms";
import { GooBlock } from "./goo";
import { PresenceBadge } from "./presence";
import { Card, ErrorNote } from "./ui";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** A freelancer's or AI agent's public page: badges, verified stats and recent verified work. */
export function ProfileScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<{ missing: boolean; message: string } | null>(null);

  useEffect(() => {
    api<{ profile: PublicProfile }>(`/api/profiles/${encodeURIComponent(id)}`)
      .then((d) => setProfile(d.profile))
      .catch((e: Error) => setError({ missing: e instanceof ApiError && e.status === 404, message: e.message }));
  }, [id]);

  if (error?.missing) {
    return (
      <Card className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
        <h1 className="cond text-3xl font-extrabold">No profile here</h1>
        <p className="text-[15px] text-muted">Only freelancers and AI agents have public profiles.</p>
        <Link href="/" className="jelly mt-2 inline-flex min-h-10 items-center bg-butter px-5 text-[15px] font-bold text-plum hover:bg-white">Back to home</Link>
      </Card>
    );
  }
  if (error) return <ErrorNote error={error.message} />;
  if (!profile) return <GooBlock label="Loading profile" />;

  const p = profile;
  const agent = p.kind === "agent";
  const badges = [
    { on: p.badges.emailVerified, label: "Email verified", off: "Email not verified yet", show: !agent },
    { on: p.badges.payoutsReceived > 0, label: `${p.badges.payoutsReceived} PayPal payout${p.badges.payoutsReceived === 1 ? "" : "s"} received`, off: "No PayPal payouts yet", show: true },
    { on: p.badges.milestonesVerified > 0, label: `${p.badges.milestonesVerified} milestone${p.badges.milestonesVerified === 1 ? "" : "s"} passed the AI checker`, off: "No AI-checked milestones yet", show: true },
  ].filter((b) => b.show);
  const stats = [
    { label: "First-try pass rate", value: pct(p.stats.firstTryPassRate), note: "Passed the AI check on the first submission" },
    { label: "On-time rate", value: pct(p.stats.onTimeRate), note: "Delivered by the agreed due date" },
    { label: "Client rating", value: p.stats.stars === null ? "—" : `${p.stats.stars.toFixed(1)} ★`, note: p.stats.ratings ? `From ${p.stats.ratings} rating${p.stats.ratings === 1 ? "" : "s"}` : "Not rated yet" },
    { label: "Tier", value: p.tier, note: `Reputation ${p.reputation}/100` },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start gap-5 border-b border-line pb-7">
        <span aria-hidden className="grid size-20 flex-none place-items-center rounded-full text-2xl font-extrabold text-plum" style={{ background: agent ? "#e6b9f8" : "#ffb3ae" }}>{initials(p.name)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="cond text-4xl font-extrabold sm:text-5xl">{p.name}</h1>
            <PresenceBadge presence={p.presence} kind={p.kind} />
          </div>
          {p.headline && <p className="text-lg text-muted">{p.headline}</p>}
          <p className="text-sm text-subtle">
            {agent ? "AI agent" : "Freelancer"}
            {p.owner && <> · registered to <Link href={`/u/${p.owner.id}`} className="font-semibold text-peach underline-offset-2 hover:text-butter hover:underline">{p.owner.name}</Link></>}
            {" · "}Member since {new Date(p.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </p>
          {p.skills.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1" aria-label="Skills">
              {p.skills.map((s) => <li key={s.id} className="chip px-3 first-letter:uppercase">{s.label}</li>)}
            </ul>
          )}
        </div>
      </section>

      <section aria-label="Verified badges" className="grid gap-3 sm:grid-cols-3">
        {badges.map((b) => (
          <div key={b.label} className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${b.on ? "border-line bg-raised" : "border-dashed border-line-soft"}`}>
            <span aria-hidden className="grid size-8 flex-none place-items-center rounded-full" style={{ background: b.on ? "var(--tone-paid)" : "var(--tone-empty)", color: "#22071d" }}>
              {b.on && <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </span>
            <span className={`text-[15px] ${b.on ? "font-semibold" : "text-subtle"}`}>{b.on ? b.label : b.off}</span>
          </div>
        ))}
      </section>

      <section aria-label="Track record" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted">{s.label}</span>
            <span className="money text-4xl leading-none text-butter">{s.value}</span>
            <span className="text-[13px] text-subtle">{s.note}</span>
          </Card>
        ))}
      </section>
      <p className="text-[13px] text-subtle">
        These figures come from {p.stats.completed} completed milestone{p.stats.completed === 1 ? "" : "s"} on MilestonePay: checker results, due dates and PayPal payouts. Freelancers can&apos;t edit them.
      </p>

      <section className="space-y-4">
        <h2 className="cond text-[28px] font-extrabold">Recent verified work</h2>
        {p.recentWork.length === 0 ? (
          <Card className="text-[15px] text-muted">No verified milestones yet. {agent ? "This agent" : p.name.split(" ")[0]} starts at the base rate, with no premium.</Card>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-raised">
            {p.recentWork.map((w, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="truncate text-[15px] first-letter:uppercase">{w.title}</strong>
                  <span className="text-[13px] text-subtle">
                    {w.project ? `${w.project} · ` : ""}{new Date(w.completedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="chip"><span className="sw" style={{ background: w.firstPass ? "var(--tone-paid)" : "var(--tone-check)" }} />{w.firstPass ? "Passed first try" : "Passed after changes"}</span>
                  <span className="chip"><span className="sw" style={{ background: w.onTime ? "var(--tone-paid)" : "var(--tone-bad)" }} />{w.onTime ? "On time" : "Late"}</span>
                  {w.stars !== null && <span className="chip px-3">{w.stars} ★</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

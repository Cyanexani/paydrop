"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { SKILL_LABELS, TIERS, type Skill } from "@/lib/pricing/config";
import type { FairnessRow } from "@/server/ledger";

export interface TierRate {
  name: string;
  premium: number;
  /** Average base pay per expected hour in this tier, or null when no one in it has priced work yet. */
  baseMinor: number | null;
  count: number;
}

const rupees = (minor: number) => formatMoney(Math.round(minor / 100) * 100);
const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

/** Per-tier base rate for one skill, lowest tier first, from human-priced milestones only. */
export function tierRates(rows: readonly FairnessRow[], skill: string): { tiers: TierRate[]; baseMinor: number | null; spreadMinor: number | null } {
  const human = rows.filter((r) => r.workerKind === "human" && r.skill === skill);
  const tiers = [...TIERS].reverse().map((t) => {
    const mine = human.filter((r) => r.tier === t.name);
    return { name: t.name, premium: t.premium, baseMinor: mine.length ? avg(mine.map((r) => r.baseRatePerHourMinor)) : null, count: mine.length };
  });
  const priced = tiers.flatMap((t) => (t.baseMinor === null ? [] : [t.baseMinor]));
  return {
    tiers,
    baseMinor: human.length ? avg(human.map((r) => r.baseRatePerHourMinor)) : null,
    spreadMinor: priced.length > 1 ? Math.max(...priced) - Math.min(...priced) : null,
  };
}

export function skillsOf(rows: readonly FairnessRow[]): string[] {
  return [...new Set(rows.filter((r) => r.workerKind === "human").map((r) => r.skill))];
}

export const skillLabel = (s: string) => SKILL_LABELS[s as Skill] ?? s.replaceAll("_", " ");

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/**
 * Same work, same base: one bar per tier, base rate per hour plus the tier's premium on top.
 * The base segments line up on a dashed guide; only the premium (shown separately) differs.
 */
export function FairnessChart({ tiers, baseMinor }: { tiers: TierRate[]; baseMinor: number }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const maxPremium = Math.max(...tiers.map((t) => t.premium));
  const scale = baseMinor * (1 + maxPremium);
  const basePct = (baseMinor / scale) * 100;

  const show = (e: React.MouseEvent | React.FocusEvent, t: TierRate, part: "base" | "premium") => {
    const box = (e.currentTarget.closest("[data-chart]") as HTMLElement).getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const base = t.baseMinor ?? baseMinor;
    setTip({
      x: ("clientX" in e ? e.clientX : r.left + r.width / 2) - box.left,
      y: r.top - box.top,
      title: `${t.name} tier`,
      lines:
        part === "base"
          ? [`Base ${rupees(base)}/hr`, t.count ? `Average of ${t.count} milestone${t.count === 1 ? "" : "s"}` : "No milestones yet: same formula"]
          : [`Premium +${Math.round(t.premium * 100)}% = ${rupees(base * t.premium)}/hr`, "Earned with verified, on-time work"],
    });
  };

  return (
    <div data-chart className="relative" onMouseLeave={() => setTip(null)}>
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-5 rounded-[3px] bg-[var(--chart-base)]" />Base rate per hour</span>
        <span className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-5 rounded-[3px] bg-[var(--chart-premium)]" />Track-record premium</span>
        <span className="flex items-center gap-2"><span aria-hidden className="h-3 w-0 border-l-2 border-dashed border-paper/50" />Same base in every tier</span>
      </div>
      <div className="relative">
        {/* The guide sits on the end of every base segment */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[96px] right-0 sm:left-[120px] sm:right-[200px]">
          <div className="absolute inset-y-[-10px] border-l-2 border-dashed border-paper/40" style={{ left: `calc(${basePct}% - 1px)` }} />
        </div>
        <ol className="relative space-y-3">
          {tiers.map((t, i) => {
            const base = t.baseMinor ?? baseMinor;
            const prem = base * t.premium;
            const empty = t.count === 0;
            return (
              <li
                key={t.name}
                className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-0 gap-y-1 sm:grid-cols-[120px_minmax(0,1fr)_200px]"
                aria-label={`${t.name} tier: base ${rupees(base)} per hour plus ${Math.round(t.premium * 100)}% premium, ${rupees(base + prem)} per hour${empty ? ", no milestones yet" : `, ${t.count} milestones`}`}
              >
                <span className="flex flex-col pr-3">
                  <strong className="text-[15px]">{t.name}</strong>
                  <span className="label text-subtle">{empty ? "none yet" : `${t.count} priced`}</span>
                </span>
                <span className="flex h-7 items-center">
                  <span
                    tabIndex={0}
                    onMouseMove={(e) => show(e, t, "base")}
                    onFocus={(e) => show(e, t, "base")}
                    onBlur={() => setTip(null)}
                    className={`bar-grow h-full outline-none focus-visible:ring-2 focus-visible:ring-paper ${t.premium ? "" : "rounded-r-[4px]"} ${empty ? "border-2 border-dashed border-[var(--chart-base)] bg-[var(--chart-base)]/15" : "bg-[var(--chart-base)]"}`}
                    style={{ width: `${(base / scale) * 100}%`, animationDelay: `${i * 90}ms` }}
                  />
                  {t.premium > 0 && (
                    <span
                      tabIndex={0}
                      onMouseMove={(e) => show(e, t, "premium")}
                      onFocus={(e) => show(e, t, "premium")}
                      onBlur={() => setTip(null)}
                      className={`bar-grow ml-[2px] h-full rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-paper ${empty ? "border-2 border-dashed border-[var(--chart-premium)] bg-[var(--chart-premium)]/15" : "bg-[var(--chart-premium)]"}`}
                      style={{ width: `calc(${(prem / scale) * 100}% - 2px)`, animationDelay: `${i * 90 + 250}ms` }}
                    />
                  )}
                </span>
                <span className="col-start-2 flex items-baseline gap-2 sm:col-start-auto sm:pl-4">
                  <span className="money text-[22px] leading-none">{rupees(base + prem)}</span>
                  <span className="label text-subtle">/hr{t.premium ? ` · +${Math.round(t.premium * 100)}%` : " · base"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-44 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-raised px-3 py-2 text-sm shadow-lg"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          <div className="font-semibold">{tip.title}</div>
          {tip.lines.map((l) => <div key={l} className="text-muted">{l}</div>)}
        </div>
      )}
    </div>
  );
}

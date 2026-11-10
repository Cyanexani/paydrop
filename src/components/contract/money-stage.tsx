import type { CSSProperties } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { CountUp } from "../motion";

type Milestone = ContractView["milestones"][number];

/** Where each milestone's money is, by status. */
export const UNFUNDED = ["offered", "accepted", "funding", "release_failed"];
export const HELD = ["funded", "submitted", "changes_requested", "needs_review", "verified", "disputed"];
export const PAID = ["releasing", "release_pending", "released", "payout_pending", "paid_out"];

export function sumWhere(ms: Milestone[], statuses: string[]) {
  return ms.filter((m) => statuses.includes(m.status)).reduce((a, m) => a + m.priceMinor, 0);
}

const ZONE = { client: 16, held: 50, paid: 82 } as const;
/** A size designed in px at desktop width, shrunk on narrow screens. */
const fit = (px: number) => `max(${Math.min(px, 30)}px, min(${px}px, ${(px * 0.115).toFixed(2)}vw))`;
const SPREAD = { client: 7, held: 7.5, paid: 0 } as const;
const CHECKING = ["submitted", "needs_review", "verified"];

/**
 * "Where the money is": every milestone is a gooey drop sized by its price. Unfunded drops wait on
 * the client's side, funded ones sit in PayPal's ring, and paid ones merge into the freelancer's pool.
 * Drops are keyed by milestone, so when a status changes the drop slides to its new zone, the pool
 * swells and a ring bursts from it. Each drop's chip opens its milestone.
 */
export function MoneyStage({ view, heldMinor, paidMinor, toFundMinor, onPick }: {
  view: ContractView;
  heldMinor: number;
  paidMinor: number;
  toFundMinor: number;
  onPick: (milestoneId: string) => void;
}) {
  const live = view.milestones.filter((m) => m.status !== "voided" && m.status !== "cancelled");
  const max = Math.max(1, ...live.map((m) => m.priceMinor));
  const total = Math.max(1, view.contract.subtotalMinor);
  const zoneOf = (m: Milestone) => (PAID.includes(m.status) ? "paid" : HELD.includes(m.status) ? "held" : "client");
  const byZone = { client: live.filter((m) => zoneOf(m) === "client"), held: live.filter((m) => zoneOf(m) === "held"), paid: live.filter((m) => zoneOf(m) === "paid") };
  const poolSize = paidMinor > 0 ? 96 + 110 * Math.sqrt(paidMinor / total) : 0;
  const freelancer = view.freelancer?.name.split(" ")[0] ?? "Freelancer";

  const drops = live.map((m, i) => {
    const zone = zoneOf(m);
    const peers = byZone[zone];
    const k = peers.indexOf(m);
    const left = ZONE[zone] + (k - (peers.length - 1) / 2) * SPREAD[zone];
    const size = 40 + 58 * Math.sqrt(m.priceMinor / max);
    const color = zone === "paid" ? "#fff7ad" : zone === "client" ? "#6a4560" : CHECKING.includes(m.status) ? "#ffb3ae" : "#ff49c1";
    // First value delays the entrance pop; the second desynchronises the bobbing of held drops.
    const animationDelay = zone === "held" ? `${i * 0.09}s, ${-m.position * 0.7}s` : `${i * 0.09}s`;
    return { m, zone, left, size, color, above: k % 2 === 1, animationDelay };
  });

  return (
    <section className="poster poster-money" aria-label="Where the money is">
      <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-6 sm:px-9">
        <span>Where the money is<br /><span className="opacity-75">Live</span></span>
        <span className="text-right">Stops<br /><span className="opacity-75">{live.length}</span></span>
      </div>
      <div className="relative h-[300px] overflow-hidden sm:h-[380px]">
        <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path className="flow-dash" vectorEffect="non-scaling-stroke" d="M16 50 C 26 40, 34 40, 41 50 M59 50 C 66 60, 72 60, 76 50" />
        </svg>
        <span aria-hidden className="money-ring" style={{ width: fit(270), height: fit(270) }} />
        <span aria-hidden className="absolute left-[82%] top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/30" style={{ width: fit(110), height: fit(110) }} />
        {poolSize > 0 && (
          <>
            <span key={`a${paidMinor}`} aria-hidden className="pool-ripple" style={{ width: fit(poolSize), height: fit(poolSize) }} />
            <span key={`b${paidMinor}`} aria-hidden className="pool-ripple" style={{ width: fit(poolSize), height: fit(poolSize) }} />
          </>
        )}
        <div aria-hidden className="goo-lg absolute inset-0 max-sm:[filter:url(#goo-md)]">
          {poolSize > 0 && <span className="money-drop" style={{ left: `${ZONE.paid}%`, width: fit(poolSize), height: fit(poolSize), background: "#fff7ad" }} />}
          {drops.map((d) => (
            <span
              key={d.m.id}
              className={`money-drop ${d.zone === "held" ? "money-bob" : ""}`}
              style={{ left: `${d.left}%`, width: fit(d.size), height: fit(d.size), background: d.color, animationDelay: d.animationDelay } as CSSProperties}
            />
          ))}
        </div>
        {drops
          .filter((d) => d.zone !== "paid")
          .map((d) => (
            <button
              key={d.m.id}
              type="button"
              onClick={() => onPick(d.m.id)}
              aria-label={`Open milestone ${d.m.position + 1}: ${d.m.draft.title}, ${formatMoney(d.m.priceMinor)}`}
              className={`chip chip-glass stage-chip absolute -translate-x-1/2 max-sm:text-[10px] ${d.zone === "client" ? "max-sm:hidden" : ""}`}
              style={{ left: `${d.left}%`, top: d.above ? `calc(50% - ${fit(d.size / 2)} - 44px)` : `calc(50% + ${fit(d.size / 2)} + 12px)` }}
            >
              <span className="sw transition-colors duration-700" style={{ background: d.color }} />#{String(d.m.position + 1).padStart(2, "0")} {formatMoney(d.m.priceMinor)}
            </button>
          ))}
        <span className="chip chip-glass absolute left-[82%] -translate-x-1/2 transition-[top] duration-1000" style={{ top: `calc(50% + ${fit(Math.max(poolSize, 110) / 2)} + 14px)` }}>
          <span className="sw" style={{ background: "#fff7ad" }} />
          <CountUp minor={paidMinor} /> paid
        </span>
      </div>
      <div className="label grid grid-cols-3 gap-4 border-t border-paper/20 px-6 pb-6 pt-4 sm:px-9">
        <span>Client<br /><span className="opacity-75">{toFundMinor > 0 ? `${formatMoney(toFundMinor)} to fund` : "Nothing left to fund"}</span></span>
        <span className="text-center">Held at PayPal<br /><span className="opacity-75">{formatMoney(heldMinor)} · not taken</span></span>
        <span className="text-right">{freelancer}&apos;s payout<br /><span className="opacity-75">{formatMoney(paidMinor)}</span></span>
      </div>
    </section>
  );
}

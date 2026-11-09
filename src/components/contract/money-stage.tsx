import type { CSSProperties } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";

type Milestone = ContractView["milestones"][number];

/** Where each milestone's money is, by status. */
export const UNFUNDED = ["offered", "accepted", "funding", "release_failed"];
export const HELD = ["funded", "submitted", "changes_requested", "needs_review", "verified", "disputed"];
export const PAID = ["releasing", "release_pending", "released", "payout_pending", "paid_out"];

export function sumWhere(ms: Milestone[], statuses: string[]) {
  return ms.filter((m) => statuses.includes(m.status)).reduce((a, m) => a + m.priceMinor, 0);
}

const ZONE = { client: 16, held: 50, paid: 82 } as const;
const SPREAD = { client: 7, held: 7.5, paid: 0 } as const;
const CHECKING = ["submitted", "needs_review", "verified"];

/**
 * "Where the money is": every milestone is a gooey drop sized by its price. Unfunded drops wait on
 * the client's side, funded ones sit in PayPal's ring, and paid ones merge into the freelancer's pool.
 * Drops are keyed by milestone, so when a status changes the drop slides to its new zone.
 */
export function MoneyStage({ view, heldMinor, paidMinor, toFundMinor }: { view: ContractView; heldMinor: number; paidMinor: number; toFundMinor: number }) {
  const live = view.milestones.filter((m) => m.status !== "voided" && m.status !== "cancelled");
  const max = Math.max(1, ...live.map((m) => m.priceMinor));
  const total = Math.max(1, view.contract.subtotalMinor);
  const zoneOf = (m: Milestone) => (PAID.includes(m.status) ? "paid" : HELD.includes(m.status) ? "held" : "client");
  const byZone = { client: live.filter((m) => zoneOf(m) === "client"), held: live.filter((m) => zoneOf(m) === "held"), paid: live.filter((m) => zoneOf(m) === "paid") };
  const poolSize = paidMinor > 0 ? 96 + 110 * Math.sqrt(paidMinor / total) : 0;
  const freelancer = view.freelancer?.name.split(" ")[0] ?? "Freelancer";

  const drops = live.map((m) => {
    const zone = zoneOf(m);
    const peers = byZone[zone];
    const k = peers.indexOf(m);
    const left = ZONE[zone] + (k - (peers.length - 1) / 2) * SPREAD[zone];
    const size = 40 + 58 * Math.sqrt(m.priceMinor / max);
    const color = zone === "paid" ? "#fff7ad" : zone === "client" ? "#6a4560" : CHECKING.includes(m.status) ? "#ffb3ae" : "#ff49c1";
    return { m, zone, left, size, color, above: k % 2 === 1 };
  });

  return (
    <section className="poster poster-money" aria-label="Where the money is">
      <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-6 sm:px-9">
        <span>Where the money is<br /><span className="opacity-75">Live</span></span>
        <span className="text-right">Stops<br /><span className="opacity-75">{live.length}</span></span>
      </div>
      <div className="relative h-[380px] overflow-hidden">
        <span aria-hidden className="money-ring size-[270px]" />
        <span aria-hidden className="absolute left-[82%] top-1/2 size-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/30" />
        <div aria-hidden className="goo-lg absolute inset-0">
          {poolSize > 0 && <span className="money-drop" style={{ left: `${ZONE.paid}%`, width: poolSize, height: poolSize, background: "#fff7ad" }} />}
          {drops.map((d) => (
            <span
              key={d.m.id}
              className={`money-drop ${d.zone === "held" ? "money-bob" : ""}`}
              style={{ left: `${d.left}%`, width: d.size, height: d.size, background: d.color, animationDelay: `${-d.m.position * 0.7}s` } as CSSProperties}
            />
          ))}
        </div>
        {drops
          .filter((d) => d.zone !== "paid")
          .map((d) => (
            <span
              key={d.m.id}
              className="chip chip-glass absolute -translate-x-1/2 transition-[left] duration-[1500ms]"
              style={{ left: `${d.left}%`, top: d.above ? `calc(50% - ${d.size / 2 + 44}px)` : `calc(50% + ${d.size / 2 + 12}px)` }}
            >
              <span className="sw" style={{ background: d.color }} />#{String(d.m.position + 1).padStart(2, "0")} {formatMoney(d.m.priceMinor)}
            </span>
          ))}
        <span className="chip chip-glass absolute left-[82%] -translate-x-1/2" style={{ top: `calc(50% + ${Math.max(poolSize, 110) / 2 + 14}px)` }}>
          <span className="sw" style={{ background: "#fff7ad" }} />
          {formatMoney(paidMinor)} paid
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

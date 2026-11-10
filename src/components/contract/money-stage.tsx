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

const CHECKING = ["submitted", "needs_review", "verified"];

/**
 * "Where the money is": three columns (to fund, held at PayPal, paid out) with the amount in each
 * and the milestones that make it up. A bar above shows the same split by value. Each milestone
 * chip opens its card.
 */
export function MoneyStage({ view, heldMinor, paidMinor, toFundMinor, onPick }: {
  view: ContractView;
  heldMinor: number;
  paidMinor: number;
  toFundMinor: number;
  onPick: (milestoneId: string) => void;
}) {
  const live = view.milestones.filter((m) => m.status !== "voided" && m.status !== "cancelled");
  const total = Math.max(1, toFundMinor + heldMinor + paidMinor);
  const freelancer = view.freelancer?.name.split(" ")[0] ?? "Freelancer";
  const zones = [
    { key: "client", label: "To fund", note: toFundMinor > 0 ? "Not yet at PayPal" : "Nothing left to fund", minor: toFundMinor, color: "var(--tone-neutral)", items: live.filter((m) => UNFUNDED.includes(m.status)) },
    { key: "held", label: "Held at PayPal", note: "Authorised, not taken", minor: heldMinor, color: "var(--tone-held)", items: live.filter((m) => HELD.includes(m.status)) },
    { key: "paid", label: `Paid to ${freelancer}`, note: "Released after the check passed", minor: paidMinor, color: "var(--tone-paid)", items: live.filter((m) => PAID.includes(m.status)) },
  ];

  return (
    <section className="poster" aria-label="Where the money is">
      <div className="flex items-center justify-between gap-4 px-5 pt-4">
        <h2 className="text-sm font-semibold">Where the money is</h2>
        <span className="text-xs text-subtle">{live.length} milestones</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden px-5 pt-3" role="img" aria-label={`${formatMoney(paidMinor)} paid, ${formatMoney(heldMinor)} held, ${formatMoney(toFundMinor)} to fund`}>
        {[zones[2], zones[1], zones[0]].filter((z) => z.minor > 0).map((z) => (
          <span key={z.key} className="h-2 rounded-full transition-[flex-grow] duration-700" style={{ flexGrow: z.minor / total, background: z.color }} />
        ))}
      </div>
      <div className="grid gap-px pt-4 sm:grid-cols-3 sm:divide-x sm:divide-line-soft">
        {zones.map((z) => (
          <div key={z.key} className="flex flex-col gap-2 border-t border-line-soft px-5 py-4">
            <span className="flex items-center gap-2 text-[13px] font-medium text-muted"><span className="sw" style={{ background: z.color }} />{z.label}</span>
            <span className="money text-2xl"><CountUp minor={z.minor} /></span>
            <span className="text-xs text-subtle">{z.note}</span>
            {z.items.length > 0 && (
              <span className="flex flex-wrap gap-1.5 pt-1">
                {z.items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onPick(m.id)}
                    aria-label={`Open milestone ${m.position + 1}: ${m.draft.title}, ${formatMoney(m.priceMinor)}`}
                    className="chip chip-glass cursor-pointer hover:border-magenta"
                  >
                    <span className={`sw ${CHECKING.includes(m.status) ? "sw-live" : ""}`} style={{ background: CHECKING.includes(m.status) ? "var(--tone-check)" : z.color }} />
                    #{m.position + 1} · {formatMoney(m.priceMinor)}
                  </button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

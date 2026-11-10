import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";

type Milestone = ContractView["milestones"][number];

export interface NextMove {
  /** The milestone the move is about; it opens by default. Null when nothing is left to do. */
  milestone: Milestone | null;
  /** True when the viewer is the one who has to act. */
  yours: boolean;
  text: string;
}

export const stopNo = (m: { position: number }) => `#${String(m.position + 1).padStart(2, "0")}`;

const FUNDABLE = ["accepted", "funding", "release_failed"];
const SETTLED = ["released", "payout_pending", "paid_out", "voided", "cancelled"];

/** What happens next on this contract, and whose turn it is, from the viewer's side. */
export function nextMove(view: ContractView): NextMove {
  const { contract, role, milestones: ms } = view;
  const isClient = role === "client";
  const worker = view.freelancer?.name.split(" ")[0] ?? "the freelancer";
  const find = (...statuses: string[]) => ms.find((m) => statuses.includes(m.status));
  const changeOrder = ms.find((m) => m.status === "offered" && m.kind === "change_order");
  const move = (milestone: Milestone | null | undefined, yours: boolean, text: string): NextMove => ({ milestone: milestone ?? null, yours, text });

  if (contract.status === "cancelled") return move(null, false, "This contract was cancelled");
  if (contract.status === "offered") {
    return move(ms[0], !isClient, isClient ? `Waiting for ${worker} to accept the offer` : "Review the milestones, then accept the contract");
  }

  let m: Milestone | undefined;
  if (isClient) {
    if ((m = find("verified"))) return move(m, true, `Approve ${stopNo(m)} to release ${formatMoney(m.priceMinor)}`);
    if ((m = find("needs_review"))) return move(m, true, `Review ${stopNo(m)}: the checker couldn't verify everything`);
    if ((m = ms.find((x) => FUNDABLE.includes(x.status) && x.canFundNow))) return move(m, true, `Fund ${stopNo(m)} so ${worker} can start`);
  } else {
    if ((m = find("changes_requested"))) return move(m, true, `Fix ${stopNo(m)} and submit it again`);
    if ((m = find("funded"))) return move(m, true, role === "agent_owner" ? `Run BuildBot on ${stopNo(m)}` : `Deliver ${stopNo(m)} and submit it for checking`);
    if (changeOrder) return move(changeOrder, true, `Accept change order ${stopNo(changeOrder)}?`);
  }

  if ((m = find("submitted"))) return move(m, false, `The checker is testing ${stopNo(m)}`);
  if ((m = find("releasing", "release_pending"))) return move(m, false, `PayPal is releasing ${stopNo(m)}`);
  if ((m = find("disputed"))) return move(m, false, `${stopNo(m)} is in dispute`);
  if (isClient) {
    if ((m = find("funded", "changes_requested"))) return move(m, false, `${worker} is working on ${stopNo(m)}`);
    if (changeOrder) return move(changeOrder, false, `Waiting for ${worker} to accept change order ${stopNo(changeOrder)}`);
  } else {
    if ((m = find("verified", "needs_review"))) return move(m, false, `Waiting for the client to approve ${stopNo(m)}`);
    if ((m = ms.find((x) => FUNDABLE.includes(x.status) && x.canFundNow))) return move(m, false, `Waiting for the client to fund ${stopNo(m)}. Don't start yet`);
  }

  const open = ms.find((x) => !SETTLED.includes(x.status));
  return open ? move(open, false, `${stopNo(open)} is next`) : move(null, false, "Every milestone is paid");
}

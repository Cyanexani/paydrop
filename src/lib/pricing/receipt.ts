import { formatMoney, roundToStep, type CurrencyCode, type Minor } from "@/lib/money";
import { COMPLEXITY, PRICING, type Tier } from "./config";
import type { FreelancerStanding, PricedMilestone } from "./engine";

export interface ReceiptLine {
  text: string;
  amountMinor: Minor | null;
}

export interface Receipt {
  title: string;
  priceMinor: Minor;
  lines: ReceiptLine[];
  fairBand: string;
}

/** A price receipt: every multiplier that moved the price, in order, with its reason. */
export function buildReceipt(
  m: PricedMilestone,
  tier: Tier,
  standing: FreelancerStanding | null,
  currency: CurrencyCode = PRICING.currency,
): Receipt {
  const money = (minor: Minor) => formatMoney(minor, currency);
  const e = m.estimate;
  const lines: ReceiptLine[] = [
    {
      text:
        `${m.expectedHours.toFixed(2)} hrs (PERT ${e.optimistic}/${e.likely}/${e.pessimistic}) × ${multiplier(m.complexity)} ` +
        `(${COMPLEXITY[m.complexityTag].label}) × ${money(m.baseRateMinor)}/hr`,
      amountMinor: m.taskValueMinor,
    },
  ];
  if (m.floorApplied) {
    lines.push({ text: `Raised to the ${money(PRICING.floorRateMinorPerHour)}/hr floor`, amountMinor: m.taskValueMinor });
  }
  if (m.minimumApplied) {
    lines.push({ text: `Raised to the ${money(PRICING.minMilestoneMinor)} minimum milestone`, amountMinor: m.taskValueMinor });
  }
  if (m.urgency !== 1) {
    const afterUrgency =
      m.premium > 0 ? roundToStep(m.taskValueMinor * m.urgency, PRICING.priceStepMinor) : m.priceMinor;
    lines.push({
      text: `× ${m.urgency.toFixed(2)} urgency (deadline tighter than a ${PRICING.productiveHoursPerDay} hr/day pace)`,
      amountMinor: afterUrgency,
    });
  }
  if (m.premium > 0) {
    const who = standing ? ` (VRS ${standing.vrs}, ${standing.verifiedMilestones} verified milestones)` : "";
    lines.push({ text: `× ${(1 + m.premium).toFixed(2)} ${tier.name} tier${who}`, amountMinor: m.priceMinor });
  }
  return {
    title: `${m.title} — ${money(m.priceMinor)}`,
    priceMinor: m.priceMinor,
    lines,
    fairBand: `Fair band: ${money(m.fairBand.lowMinor)} – ${money(m.fairBand.highMinor)}`,
  };
}

/** 1 → "1.0", 1.2 → "1.2", 1.15 → "1.15". */
function multiplier(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function receiptText(r: Receipt, currency: CurrencyCode = PRICING.currency): string {
  const body = r.lines.map((l) => `  ${l.text}${l.amountMinor === null ? "" : ` = ${formatMoney(l.amountMinor, currency)}`}`);
  return [r.title, ...body, `  ${r.fairBand}`].join("\n");
}

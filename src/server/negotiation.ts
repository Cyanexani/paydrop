import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { contracts, milestones, negotiations } from "@/db/schema";
import { reestimateHours } from "@/lib/ai/reestimate";
import { toChargeMinor, inrPerUsd } from "@/lib/fx";
import { formatMoney, roundToStep, type Minor } from "@/lib/money";
import { PRICING } from "@/lib/pricing/config";
import { pertHours, taskValue, type PricedMilestone } from "@/lib/pricing/engine";
import type { Receipt } from "@/lib/pricing/receipt";
import { loadContractFor } from "./contracts";
import { AppError, badRequest, forbidden, newId, notFound } from "./errors";
import { fromStored, toStored } from "./milestone-store";
import type { Viewer } from "./session";

export const CounterRequest = z.object({
  priceMinor: z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});

/** The fair band is in base pay; scale it by the urgency and tier premium already in the price. */
export function adjustedBand(p: PricedMilestone): { lowMinor: Minor; highMinor: Minor } {
  const factor = p.urgency * (1 + p.premium);
  return {
    lowMinor: roundToStep(p.fairBand.lowMinor * factor, PRICING.priceStepMinor),
    highMinor: roundToStep(p.fairBand.highMinor * factor, PRICING.priceStepMinor),
  };
}

export async function counterOffer(db: Db, viewer: Viewer, milestoneId: string, input: z.infer<typeof CounterRequest>) {
  const [m] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!m) throw notFound("Milestone");
  const { contract, role } = await loadContractFor(db, viewer, m.contractId);
  if (role === "client") throw forbidden("Only the freelancer can counter-offer");
  if (contract.status !== "offered") throw badRequest("Counter-offers are only possible before the contract is accepted");

  const history = await db.select().from(negotiations).where(eq(negotiations.milestoneId, milestoneId));
  if (history.some((n) => n.status === "open")) throw badRequest("Wait for the client to answer your last counter-offer");
  if (history.length >= PRICING.negotiationMaxRounds) {
    throw new AppError(409, "max_rounds", `At most ${PRICING.negotiationMaxRounds} counter-offers per milestone`);
  }

  const band = adjustedBand(m.pricing);
  const fair = input.priceMinor >= band.lowMinor && input.priceMinor <= band.highMinor;
  let aiEstimate: (typeof negotiations.$inferInsert)["aiEstimate"] = null;
  if (!fair) {
    if (!input.reason) {
      throw badRequest(
        `${formatMoney(input.priceMinor)} is outside the fair band (${formatMoney(band.lowMinor)}–${formatMoney(band.highMinor)}); add a written reason`,
        "reason_required",
      );
    }
    const est = await reestimateHours(m.draft, input.reason);
    const expected = pertHours(est);
    const base = taskValue(expected, m.pricing.complexity, m.pricing.baseRateMinor).valueMinor;
    const suggestedMinor = roundToStep(base * m.pricing.urgency * (1 + m.pricing.premium), PRICING.priceStepMinor);
    aiEstimate = { ...est, suggestedMinor };
  }

  const row = {
    id: newId("ng"),
    contractId: contract.id,
    milestoneId,
    round: history.length + 1,
    priceMinor: input.priceMinor,
    reason: input.reason ?? null,
    fair,
    aiEstimate,
    status: "open" as const,
  };
  await db.insert(negotiations).values(row);
  return row;
}

export async function respondToCounter(db: Db, viewer: Viewer, negotiationId: string, accept: boolean) {
  const [n] = await db.select().from(negotiations).where(eq(negotiations.id, negotiationId));
  if (!n) throw notFound("Counter-offer");
  const { contract, role } = await loadContractFor(db, viewer, n.contractId);
  if (role !== "client") throw forbidden("Only the client answers counter-offers");
  if (n.status !== "open") throw badRequest(`This counter-offer is already ${n.status}`);
  if (contract.status !== "offered") throw badRequest("The contract has already been accepted");

  await db.transaction(async (tx) => {
    await tx.update(negotiations).set({ status: accept ? "accepted" : "rejected", decidedAt: new Date() }).where(eq(negotiations.id, n.id));
    if (!accept) return;
    const [m] = await tx.select().from(milestones).where(eq(milestones.id, n.milestoneId));
    const state = fromStored(m.state);
    const feeMinor = Math.round(n.priceMinor * PRICING.platformFeeRate);
    const pricing: PricedMilestone = { ...m.pricing, priceMinor: n.priceMinor, feeMinor };
    const receipt: Receipt = {
      ...m.receipt,
      title: `${m.draft.title} — ${formatMoney(n.priceMinor)}`,
      priceMinor: n.priceMinor,
      lines: [...m.receipt.lines, { text: `Negotiated in round ${n.round}${n.fair ? " (inside the fair band)" : " (AI re-estimated)"}`, amountMinor: n.priceMinor }],
    };
    const rate = inrPerUsd();
    const next = {
      ...state,
      fundMinor: toChargeMinor(n.priceMinor + feeMinor, state.currency, rate),
      payoutMinor: toChargeMinor(n.priceMinor, state.currency, rate),
    };
    const updated = await tx
      .update(milestones)
      .set({ priceMinor: n.priceMinor, pricing, receipt, state: toStored(next), updatedAt: new Date() })
      .where(and(eq(milestones.id, m.id), eq(milestones.version, m.version)))
      .returning({ id: milestones.id });
    if (updated.length === 0) throw new AppError(409, "conflict", "The milestone changed; try again");

    const all = await tx.select().from(milestones).where(eq(milestones.contractId, contract.id)).orderBy(asc(milestones.position));
    const subtotalMinor = all.reduce((a, x) => a + x.pricing.priceMinor, 0);
    const fee = all.reduce((a, x) => a + x.pricing.feeMinor, 0);
    await tx.update(contracts).set({ subtotalMinor, feeMinor: fee, totalMinor: subtotalMinor + fee }).where(eq(contracts.id, contract.id));
  });
  return { ok: true };
}

export async function openCounterCount(db: Db, contractId: string): Promise<number> {
  const rows = await db.select({ id: negotiations.id }).from(negotiations).where(and(eq(negotiations.contractId, contractId), eq(negotiations.status, "open")));
  return rows.length;
}

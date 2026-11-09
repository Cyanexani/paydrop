import { inArray, or, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contracts, milestones, payouts, users } from "@/db/schema";
import { fromStored } from "./milestone-store";
import type { Viewer } from "./session";

const HELD = ["funded", "submitted", "changes_requested", "needs_review", "verified", "releasing", "release_pending", "disputed"];
const RELEASED = ["released", "payout_pending", "paid_out"];

export interface LedgerRow {
  contractId: string;
  milestoneId: string;
  client: string;
  project: string;
  milestone: string;
  kind: "original" | "change_order";
  status: string;
  freelancer: string;
  priceMinor: number;
  feeMinor: number;
  heldMinor: number;
  releasedMinor: number;
  paidOutMinor: number;
  payoutStatus: string;
  dueAt: string | null;
  rating: number | null;
}

/** Every milestone the viewer is party to, with where its money is right now (in ₹). */
export async function ledgerRows(db: Db, viewer: Viewer): Promise<LedgerRow[]> {
  const owned = await db.select({ id: users.id }).from(users).where(eq(users.ownerId, viewer.id));
  const ids = [viewer.id, ...owned.map((o) => o.id)];
  const cs = await db.select().from(contracts).where(or(eq(contracts.clientId, viewer.id), inArray(contracts.freelancerId, ids)));
  if (cs.length === 0) return [];
  const ms = await db.select().from(milestones).where(inArray(milestones.contractId, cs.map((c) => c.id)));
  const people = await db.select().from(users).where(inArray(users.id, [...new Set(cs.flatMap((c) => [c.clientId, c.freelancerId]))]));
  const pos = ms.length ? await db.select().from(payouts).where(inArray(payouts.milestoneId, ms.map((m) => m.id))) : [];
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return ms
    .sort((a, b) => a.contractId.localeCompare(b.contractId) || a.position - b.position)
    .map((m) => {
      const c = cs.find((x) => x.id === m.contractId)!;
      const s = fromStored(m.state);
      const total = m.pricing.priceMinor + m.pricing.feeMinor;
      const items = pos.filter((p) => p.milestoneId === m.id);
      const worker = people.find((p) => p.id === c.freelancerId);
      return {
        contractId: c.id,
        milestoneId: m.id,
        client: name(c.clientId),
        project: c.title,
        milestone: `${m.position + 1}. ${m.draft.title}`,
        kind: m.kind,
        status: s.status,
        freelancer: name(c.freelancerId),
        priceMinor: m.pricing.priceMinor,
        feeMinor: m.pricing.feeMinor,
        heldMinor: HELD.includes(s.status) ? total : 0,
        releasedMinor: RELEASED.includes(s.status) ? total : 0,
        paidOutMinor: s.status === "paid_out" ? m.pricing.priceMinor : 0,
        payoutStatus: items.length === 0 ? "—" : items.every((p) => p.status === "succeeded") ? "paid" : items.some((p) => p.status === "failed") ? "failed" : "in progress",
        dueAt: m.dueAt?.toISOString() ?? null,
        rating: worker?.outcomes.find((o) => o.milestoneId === m.id)?.stars ?? null,
      };
    });
}

export interface FairnessRow {
  milestone: string;
  skill: string;
  complexity: string;
  expectedHours: number;
  baseMinor: number;
  baseRatePerHourMinor: number;
  tier: string;
  premiumPct: number;
  priceMinor: number;
  workerKind: "human" | "agent";
  actualHours: number | null;
  estimateErrorPct: number | null;
}

/**
 * Platform-wide pricing transparency: base pay per expected hour is the same whoever does
 * the work; only the tier premium differs. Also: how far estimates were from reported hours.
 */
export async function fairnessRows(db: Db): Promise<FairnessRow[]> {
  const ms = await db.select().from(milestones);
  if (ms.length === 0) return [];
  const cs = await db.select().from(contracts).where(inArray(contracts.id, [...new Set(ms.map((m) => m.contractId))]));
  const workers = await db.select({ id: users.id, kind: users.kind }).from(users).where(inArray(users.id, [...new Set(cs.map((c) => c.freelancerId))]));
  return ms.map((m) => {
    const c = cs.find((x) => x.id === m.contractId)!;
    const p = m.pricing;
    const expected = p.expectedHours;
    return {
      milestone: m.draft.title,
      skill: m.draft.skill,
      complexity: `${p.complexityTag} ×${p.complexity}`,
      expectedHours: Math.round(expected * 100) / 100,
      baseMinor: p.taskValueMinor,
      baseRatePerHourMinor: Math.round(p.taskValueMinor / expected / p.complexity),
      tier: c.tier.name,
      premiumPct: Math.round(p.premium * 100),
      priceMinor: p.priceMinor,
      workerKind: workers.find((w) => w.id === c.freelancerId)?.kind ?? "human",
      actualHours: m.actualHours,
      estimateErrorPct: m.actualHours ? Math.round(((m.actualHours - expected) / expected) * 1000) / 10 : null,
    };
  });
}

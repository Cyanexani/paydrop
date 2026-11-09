import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contracts, milestones, payouts, users, type LockedShare } from "@/db/schema";
import type { MilestoneEvent, MilestoneState } from "@/lib/milestones/state-machine";
import { allocateSplit } from "@/lib/pricing/splits";
import { newId } from "./errors";
import type { StoredOutcome } from "./reputation";

type MilestoneRow = typeof milestones.$inferSelect;

const TERMINAL = ["paid_out", "voided", "cancelled"];

/**
 * Runs inside the same transaction as the state change, so a milestone can't be
 * released without its outcome and payout rows being recorded.
 */
export async function afterTransition(tx: Db, row: MilestoneRow, before: MilestoneState, after: MilestoneState, event: MilestoneEvent) {
  if (before.status === after.status) return;
  const [contract] = await tx.select().from(contracts).where(eq(contracts.id, row.contractId));
  if (!contract) return;

  // Funded: lock the payout split as it stands now.
  if (after.status === "funded" && !row.split) {
    const split: LockedShare[] = [
      { payeeKey: contract.freelancerId, name: "Lead freelancer", bps: 10_000 - contract.collaborators.reduce((a, c) => a + c.bps, 0), lead: true },
      ...contract.collaborators.map((c) => ({ payeeKey: `collab:${c.id}`, name: c.name, bps: c.bps, lead: false })),
    ];
    await tx.update(milestones).set({ split }).where(eq(milestones.id, row.id));
  }

  // Released: record the verified outcome and queue one payout per payee.
  if (after.status === "released") {
    await recordOutcome(tx, row, contract, after, event.at);
    await queuePayouts(tx, row, contract, after);
  }

  if (TERMINAL.includes(after.status)) {
    const siblings = await tx.select({ id: milestones.id, status: milestones.status }).from(milestones).where(eq(milestones.contractId, contract.id));
    const statuses = siblings.map((s) => (s.id === row.id ? after.status : s.status));
    if (statuses.every((s) => TERMINAL.includes(s)) && contract.status === "active") {
      await tx.update(contracts).set({ status: "completed" }).where(eq(contracts.id, contract.id));
    }
  }
}

async function recordOutcome(tx: Db, row: MilestoneRow, contract: typeof contracts.$inferSelect, state: MilestoneState, at: Date) {
  const [worker] = await tx.select().from(users).where(eq(users.id, contract.freelancerId));
  if (!worker || worker.outcomes.some((o) => o.milestoneId === row.id)) return;
  const delivered = state.submissions.at(-1)?.at ?? at;
  const outcome: StoredOutcome = {
    milestoneId: row.id,
    skill: row.draft.skill,
    firstPass: state.firstPass === true,
    verified: true,
    onTime: row.dueAt ? delivered <= row.dueAt : true,
    stars: null,
    completedAt: at.toISOString(),
  };
  await tx.update(users).set({ outcomes: [...worker.outcomes, outcome] }).where(eq(users.id, worker.id));
}

async function queuePayouts(tx: Db, row: MilestoneRow, contract: typeof contracts.$inferSelect, state: MilestoneState) {
  const existing = await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.milestoneId, row.id));
  if (existing.length) return;
  const split = row.split ?? [{ payeeKey: contract.freelancerId, name: "Lead freelancer", bps: 10_000, lead: true }];
  const parts = allocateSplit(
    state.payoutMinor,
    split.map((s) => ({ payeeId: s.payeeKey, bps: s.bps, lead: s.lead })),
  );
  const workerIds = split.filter((s) => !s.payeeKey.startsWith("collab:")).map((s) => s.payeeKey);
  const people = workerIds.length ? await tx.select().from(users).where(inArray(users.id, workerIds)) : [];
  const rows = await Promise.all(
    parts.map(async (p) => {
      const share = split.find((s) => s.payeeKey === p.payeeId)!;
      let email: string | null = null;
      let name = share.name;
      if (p.payeeId.startsWith("collab:")) {
        const collab = contract.collaborators.find((c) => `collab:${c.id}` === p.payeeId);
        email = collab?.paypalEmail ?? null;
        name = collab?.name ?? name;
      } else {
        const person = people.find((u) => u.id === p.payeeId);
        // An AI agent's payout goes to its registered human owner.
        const payee = person?.ownerId ? (await tx.select().from(users).where(eq(users.id, person.ownerId)))[0] : person;
        email = payee?.paypalEmail ?? null;
        name = payee?.name ?? name;
      }
      return {
        id: newId("po"),
        milestoneId: row.id,
        payeeKey: p.payeeId,
        name,
        email: process.env.DEMO_PAYOUT_EMAIL || email || "missing-email@invalid",
        amountMinor: p.amountMinor,
        currency: state.currency,
        status: "queued" as const,
      };
    }),
  );
  await tx.insert(payouts).values(rows);
}

/** Payout rows that still need to go out for a milestone. */
export async function pendingPayouts(db: Db, milestoneId: string) {
  return db
    .select()
    .from(payouts)
    .where(and(eq(payouts.milestoneId, milestoneId), inArray(payouts.status, ["queued", "failed"])));
}

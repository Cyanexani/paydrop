import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  changeRequests,
  checkRuns,
  contracts,
  materials,
  messages,
  milestoneEvents,
  milestones,
  negotiations,
  payouts,
  users,
  type Collaborator,
} from "@/db/schema";
import type { MilestoneEvent } from "@/lib/milestones/state-machine";
import { loadContractFor, loadMilestoneFor } from "./contracts";
import { AppError, badRequest, forbidden, newId } from "./errors";
import { runEffects } from "./effects";
import { applyMilestoneEvent, fromStored } from "./milestone-store";
import type { Viewer } from "./session";

export const CollaboratorsRequest = z.object({
  collaborators: z
    .array(z.object({ name: z.string().trim().min(1).max(80), paypalEmail: z.string().email(), bps: z.number().int().min(1).max(9_900) }))
    .max(5),
});

/** Freelancer sets collaborators; each milestone locks the split when it's funded. */
export async function setCollaborators(db: Db, viewer: Viewer, contractId: string, input: z.infer<typeof CollaboratorsRequest>) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  if (role === "client") throw forbidden("Only the freelancer sets collaborators");
  if (contract.status === "completed" || contract.status === "cancelled") throw badRequest(`The contract is ${contract.status}`);
  const total = input.collaborators.reduce((a, c) => a + c.bps, 0);
  if (total >= 10_000) throw badRequest("Collaborators must leave the lead freelancer a share");
  const collaborators: Collaborator[] = input.collaborators.map((c) => ({ ...c, id: newId("cb") }));
  await db.update(contracts).set({ collaborators }).where(eq(contracts.id, contractId));
  return { collaborators, leadBps: 10_000 - total };
}

export const RatingRequest = z.object({ stars: z.number().int().min(1).max(5) });

/** Only the client of a released, paid milestone can rate it, once. */
export async function rateMilestone(db: Db, viewer: Viewer, milestoneId: string, stars: number) {
  const { row, state, contract, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client") throw forbidden("Only the client rates delivered work");
  if (!["released", "payout_pending", "paid_out"].includes(state.status)) throw badRequest("Rate a milestone after it's released");
  const [worker] = await db.select().from(users).where(eq(users.id, contract.freelancerId));
  const outcome = worker.outcomes.find((o) => o.milestoneId === row.id);
  if (!outcome) throw badRequest("No verified outcome to rate");
  if (outcome.stars !== null) throw new AppError(409, "already_rated", "You already rated this milestone");
  const outcomes = worker.outcomes.map((o) => (o.milestoneId === row.id ? { ...o, stars } : o));
  await db.update(users).set({ outcomes }).where(eq(users.id, worker.id));
  return { stars };
}

export const DisputeRequest = z.object({ reason: z.string().trim().min(5).max(1000) });

export async function openDispute(db: Db, viewer: Viewer, milestoneId: string, reason: string) {
  const { state, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client" && role !== "freelancer") throw forbidden();
  return apply(db, milestoneId, { type: "OPEN_DISPUTE", reason }, `dispute-${milestoneId}-v${state.version}`, { kind: role, id: viewer.id });
}

export const ResolveRequest = z.object({ outcome: z.enum(["release", "void", "reject_dispute"]) });

/** Platform staff resolve disputes (demo: protected by ADMIN_SECRET). */
export async function resolveDispute(db: Db, adminSecret: string | null, milestoneId: string, outcome: z.infer<typeof ResolveRequest>["outcome"]) {
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) throw forbidden("Admin only");
  const [row] = await db.select({ version: milestones.version }).from(milestones).where(eq(milestones.id, milestoneId));
  if (!row) throw badRequest("No such milestone");
  return apply(db, milestoneId, { type: "RESOLVE_DISPUTE", outcome }, `resolve-${milestoneId}-v${row.version}`, { kind: "system", id: "admin" });
}

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

async function apply(db: Db, milestoneId: string, body: Body, eventId: string, actor: MilestoneEvent["actor"]) {
  const r = await applyMilestoneEvent(db, milestoneId, { ...body, eventId, at: new Date(), actor } as MilestoneEvent);
  if (!r.ok) throw new AppError(409, r.code, r.message);
  if (r.effects.length) await runEffects(db, milestoneId, r.effects);
  return { status: r.state.status };
}

/**
 * Dispute pack: everything both sides agreed and did, in one timeline — criteria,
 * submissions, check results with replays, messages, change requests and money events.
 */
export async function disputePack(db: Db, viewer: Viewer, contractId: string) {
  const { contract } = await loadContractFor(db, viewer, contractId);
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contractId)).orderBy(asc(milestones.position));
  const ids = rows.map((r) => r.id);
  const none = ids.length === 0;
  const [events, runs, msgs, crs, ngs, pos, mats, parties] = await Promise.all([
    none ? [] : db.select().from(milestoneEvents).where(inArray(milestoneEvents.milestoneId, ids)).orderBy(asc(milestoneEvents.createdAt)),
    none ? [] : db.select().from(checkRuns).where(inArray(checkRuns.milestoneId, ids)).orderBy(asc(checkRuns.startedAt)),
    db.select().from(messages).where(eq(messages.contractId, contractId)).orderBy(asc(messages.createdAt)),
    db.select().from(changeRequests).where(eq(changeRequests.contractId, contractId)).orderBy(asc(changeRequests.createdAt)),
    db.select().from(negotiations).where(eq(negotiations.contractId, contractId)).orderBy(asc(negotiations.createdAt)),
    none ? [] : db.select().from(payouts).where(inArray(payouts.milestoneId, ids)),
    none ? [] : db.select().from(materials).where(inArray(materials.milestoneId, ids)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [contract.clientId, contract.freelancerId])),
  ]);

  type Entry = { at: string; kind: string; milestone: number | null; text: string; link?: string };
  const pos1 = (id: string) => (rows.find((r) => r.id === id)?.position ?? -1) + 1 || null;
  const timeline: Entry[] = [
    { at: contract.createdAt.toISOString(), kind: "contract", milestone: null, text: `Contract offered at ${contract.subtotalMinor / 100} INR + fee, ${contract.tier.name} tier` },
    ...events.map((e) => ({ at: e.createdAt.toISOString(), kind: "event", milestone: pos1(e.milestoneId), text: `${e.type} by ${e.actorKind}: ${e.fromStatus} → ${e.toStatus}` })),
    ...runs.map((r) => ({
      at: r.finishedAt.toISOString(),
      kind: "check",
      milestone: pos1(r.milestoneId),
      text: `Check attempt ${r.attempt} (${r.mode}) of ${r.evidenceUrl}${r.commitSha ? ` @ ${r.commitSha}` : ""}: ${r.results.map((x) => `${x.criterionId}=${x.outcome}`).join(", ")}`,
      link: r.replayUrl ?? undefined,
    })),
    ...msgs.map((m) => ({ at: m.createdAt.toISOString(), kind: "message", milestone: null, text: `${m.sender} (${m.channel}): ${m.body}${m.scope ? ` [scope: ${m.scope.verdict}]` : ""}` })),
    ...crs.map((c) => ({ at: c.createdAt.toISOString(), kind: "change_request", milestone: null, text: `Change request "${c.title}" (${c.source}): ${c.status}` })),
    ...ngs.map((n) => ({ at: n.createdAt.toISOString(), kind: "negotiation", milestone: pos1(n.milestoneId), text: `Counter-offer round ${n.round}: ${n.priceMinor / 100} INR, ${n.fair ? "fair" : "outside band"}, ${n.status}${n.reason ? ` — "${n.reason}"` : ""}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    generatedAt: new Date().toISOString(),
    contract: {
      id: contract.id,
      title: contract.title,
      parties: parties.map((p) => ({ id: p.id, name: p.name, role: p.id === contract.clientId ? "client" : "freelancer" })),
      deliveryOrigins: contract.contractedOrigins,
      tier: contract.tier,
      standing: contract.standing,
      totals: { subtotalMinor: contract.subtotalMinor, feeMinor: contract.feeMinor, totalMinor: contract.totalMinor, currency: "INR" },
    },
    milestones: rows.map((r) => {
      const s = fromStored(r.state);
      return {
        position: r.position + 1,
        title: r.draft.title,
        status: s.status,
        dueAt: r.dueAt?.toISOString() ?? null,
        criteria: r.draft.criteria.map((c, i) => ({ id: `c${i + 1}`, ...c })),
        receipt: r.receipt,
        submissions: s.submissions,
        lastCheck: s.lastCheck,
        payouts: pos.filter((p) => p.milestoneId === r.id).map((p) => ({ name: p.name, amountMinor: p.amountMinor, currency: p.currency, status: p.status })),
        materials: mats.filter((m) => m.milestoneId === r.id).map((m) => ({ title: m.title, priceMinor: m.priceMinor, url: m.url })),
      };
    }),
    timeline,
  };
}

export async function latestCheckRuns(db: Db, milestoneIds: string[]) {
  if (milestoneIds.length === 0) return [];
  return db.select().from(checkRuns).where(inArray(checkRuns.milestoneId, milestoneIds)).orderBy(desc(checkRuns.startedAt));
}

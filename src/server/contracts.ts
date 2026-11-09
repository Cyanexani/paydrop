import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  changeRequests,
  checkRuns,
  contracts,
  deliveries,
  materials,
  messages,
  milestoneEvents,
  milestones,
  negotiations,
  payouts,
  quotes,
  users,
} from "@/db/schema";
import { chargeCurrency, inrPerUsd, toChargeMinor } from "@/lib/fx";
import {
  authorizationHealth,
  newMilestoneState,
  type MilestoneStatus,
} from "@/lib/milestones/state-machine";
import { priceContract } from "@/lib/pricing/engine";
import { buildReceipt } from "@/lib/pricing/receipt";
import { milestoneDueDates } from "@/lib/time";
import { badRequest, forbidden, newId, notFound } from "./errors";
import { applyMilestoneEvent, fromStored } from "./milestone-store";
import { adjustedBand, openCounterCount } from "./negotiation";
import { primarySkill, toPricingInputs } from "./quotes";
import { standingFor } from "./reputation";
import type { Viewer } from "./session";

export const ContractRequest = z.object({
  quoteId: z.string().min(1),
  freelancerId: z.string().min(1),
  /** Where the work will be delivered; the checker only accepts submissions from here. */
  deliveryUrl: z.string().url(),
  allowParallel: z.boolean().default(false),
});

export const RELEASED_STATUSES: readonly MilestoneStatus[] = ["released", "payout_pending", "paid_out"];

export function contractedOrigin(deliveryUrl: string): string {
  const url = new URL(deliveryUrl);
  if (url.protocol !== "https:") throw badRequest("The delivery URL must use https");
  const path = url.pathname.replace(/\/$/, "");
  return `${url.origin}${path}`;
}

export async function createContract(
  db: Db,
  viewer: Viewer,
  input: z.infer<typeof ContractRequest>,
  opts: { baseUrl?: string } = {},
  now = new Date(),
) {
  if (viewer.role !== "client") throw forbidden("Only clients can offer contracts");
  const [q] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId));
  if (!q) throw notFound("Quote");
  if (q.clientId !== viewer.id) throw forbidden();
  const scope = q.scope;
  if (scope.status !== "scoped") throw badRequest("This quote has no milestones to contract");

  const [freelancer] = await db.select().from(users).where(eq(users.id, input.freelancerId));
  if (!freelancer || freelancer.role !== "freelancer") throw notFound("Freelancer");
  // Client and freelancer are the same person: blocked.
  if (freelancer.id === viewer.id || freelancer.ownerId === viewer.id) {
    throw badRequest("You can't hire yourself", "self_dealing");
  }

  const contractId = newId("ct");
  // An AI agent's work is hosted by MilestonePay itself, so its delivery address is fixed.
  const origin = freelancer.kind === "agent" && opts.baseUrl ? `${opts.baseUrl}/deliveries/${contractId}` : contractedOrigin(input.deliveryUrl);
  const { standing } = standingFor(freelancer.outcomes, primarySkill(scope.milestones), now);
  // Price and tier are locked here, at signing.
  const quote = priceContract({ milestones: toPricingInputs(scope.milestones), availableDays: q.deadlineDays, freelancer: standing });
  if (quote.status !== "priced") throw badRequest(`This quote can't be contracted (${quote.status})`);

  const currency = chargeCurrency();
  const rate = inrPerUsd();
  const rows = quote.milestones.map((m, i) => {
    const id = newId("ms");
    const draft = scope.milestones[i];
    const fundMinor = toChargeMinor(m.priceMinor + m.feeMinor, currency, rate);
    const payoutMinor = toChargeMinor(m.priceMinor, currency, rate);
    const state = newMilestoneState({ id, fundMinor, payoutMinor, currency, contractedOrigins: [origin] });
    return {
      id,
      contractId,
      position: i,
      draft,
      pricing: m,
      receipt: buildReceipt(m, quote.tier, standing),
      priceMinor: m.priceMinor,
      status: state.status,
      version: state.version,
      state: JSON.parse(JSON.stringify(state)),
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(contracts).values({
      id: contractId,
      quoteId: q.id,
      clientId: viewer.id,
      freelancerId: freelancer.id,
      title: scope.projectTitle,
      status: "offered",
      currency,
      deadlineDays: q.deadlineDays,
      allowParallel: input.allowParallel,
      contractedOrigins: [origin],
      tier: quote.tier,
      standing,
      subtotalMinor: quote.subtotalMinor,
      feeMinor: quote.feeMinor,
      totalMinor: quote.totalMinor,
    });
    await tx.insert(milestones).values(rows);
  });
  // Index the agreed scope in Elastic for the scope-creep detector and dispute search.
  void import("./scope").then((s) => s.indexContract(db, contractId)).catch(() => undefined);
  return { id: contractId };
}

/** Load a contract and check the viewer is a party to it (or owns the agent that is). */
export async function loadContractFor(db: Db, viewer: Viewer, contractId: string) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw notFound("Contract");
  const role = await partyRole(db, viewer, contract);
  if (!role) throw forbidden();
  return { contract, role };
}

export async function partyRole(
  db: Db,
  viewer: Viewer,
  contract: typeof contracts.$inferSelect,
): Promise<"client" | "freelancer" | "agent_owner" | null> {
  if (contract.clientId === viewer.id) return "client";
  if (contract.freelancerId === viewer.id) return "freelancer";
  const [worker] = await db.select({ ownerId: users.ownerId }).from(users).where(eq(users.id, contract.freelancerId));
  if (worker?.ownerId === viewer.id) return "agent_owner";
  return null;
}

export async function acceptContract(db: Db, viewer: Viewer, contractId: string, now = new Date()) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  if (role === "client") throw forbidden("Only the freelancer can accept");
  if (contract.status !== "offered") throw badRequest(`Contract is already ${contract.status}`);
  if ((await openCounterCount(db, contractId)) > 0) throw badRequest("Wait for the client to answer your counter-offer first");
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contractId)).orderBy(asc(milestones.position));
  // Due dates run from acceptance and end at 23:59 in the contract's time zone.
  const dues = milestoneDueDates(now, rows.map((r) => r.draft.durationDays), contract.deadlineDays, contract.timezone);
  for (const [i, m] of rows.entries()) {
    await db.update(milestones).set({ dueAt: dues[i] }).where(eq(milestones.id, m.id));
  }
  for (const m of rows) {
    const r = await applyMilestoneEvent(db, m.id, {
      type: "ACCEPT",
      eventId: `accept-${m.id}`,
      at: now,
      actor: { kind: role === "agent_owner" ? "agent" : "freelancer", id: contract.freelancerId },
    });
    if (!r.ok) throw badRequest(r.message, r.code);
  }
  await db.update(contracts).set({ status: "active", acceptedAt: now }).where(eq(contracts.id, contractId));
}

export async function declineContract(db: Db, viewer: Viewer, contractId: string, now = new Date()) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  if (contract.status !== "offered") throw badRequest(`Contract is already ${contract.status}`);
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contractId));
  for (const m of rows) {
    await applyMilestoneEvent(db, m.id, {
      type: "CANCEL",
      eventId: `cancel-${m.id}`,
      at: now,
      actor: { kind: "system", id: `${role}:${viewer.id}` },
    });
  }
  await db.update(contracts).set({ status: "cancelled" }).where(eq(contracts.id, contractId));
}

export async function listContracts(db: Db, viewer: Viewer) {
  const owned = await db.select({ id: users.id }).from(users).where(eq(users.ownerId, viewer.id));
  const ids = [viewer.id, ...owned.map((o) => o.id)];
  return db
    .select()
    .from(contracts)
    .where(or(eq(contracts.clientId, viewer.id), inArray(contracts.freelancerId, ids)))
    .orderBy(desc(contracts.createdAt));
}

export async function getContractView(db: Db, viewer: Viewer, contractId: string, now = new Date()) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contractId)).orderBy(asc(milestones.position));
  const [client] = await db.select({ name: users.name }).from(users).where(eq(users.id, contract.clientId));
  const [freelancer] = await db.select().from(users).where(eq(users.id, contract.freelancerId));
  const events = rows.length
    ? await db
        .select()
        .from(milestoneEvents)
        .where(inArray(milestoneEvents.milestoneId, rows.map((r) => r.id)))
        .orderBy(desc(milestoneEvents.createdAt))
        .limit(80)
    : [];
  const ids = rows.map((r) => r.id);
  const [ngs, pos, runs, msgs, crs, mats, dels] = await Promise.all([
    db.select().from(negotiations).where(eq(negotiations.contractId, contractId)).orderBy(asc(negotiations.createdAt)),
    ids.length ? db.select().from(payouts).where(inArray(payouts.milestoneId, ids)) : [],
    ids.length ? db.select().from(checkRuns).where(inArray(checkRuns.milestoneId, ids)).orderBy(desc(checkRuns.startedAt)) : [],
    db.select().from(messages).where(eq(messages.contractId, contractId)).orderBy(asc(messages.createdAt)),
    db.select().from(changeRequests).where(eq(changeRequests.contractId, contractId)).orderBy(desc(changeRequests.createdAt)),
    ids.length ? db.select().from(materials).where(inArray(materials.milestoneId, ids)) : [],
    db.select({ id: deliveries.id, milestoneId: deliveries.milestoneId, createdAt: deliveries.createdAt }).from(deliveries).where(eq(deliveries.contractId, contractId)),
  ]);
  return {
    contract,
    role,
    clientName: client?.name ?? "Client",
    freelancer: freelancer ? { id: freelancer.id, name: freelancer.name, kind: freelancer.kind, headline: freelancer.headline } : null,
    messages: msgs.map((m) => ({ id: m.id, channel: m.channel, sender: m.sender, body: m.body, scope: m.scope, changeRequestId: m.changeRequestId, at: m.createdAt.toISOString() })),
    changeRequests: crs.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      source: c.source,
      status: c.status,
      priceMinor: c.pricing?.priceMinor ?? null,
      feeMinor: c.pricing?.feeMinor ?? null,
      milestoneId: c.milestoneId,
      criteria: c.draft.criteria,
      at: c.createdAt.toISOString(),
    })),
    milestones: rows.map((m, i) => {
      const state = fromStored(m.state);
      const earlierReleased = rows.slice(0, i).every((r) => RELEASED_STATUSES.includes(r.status as MilestoneStatus));
      const outcome = freelancer?.outcomes.find((o) => o.milestoneId === m.id) ?? null;
      return {
        id: m.id,
        position: m.position,
        kind: m.kind,
        draft: m.draft,
        receipt: m.receipt,
        priceMinor: m.priceMinor,
        feeMinor: m.pricing.feeMinor,
        fairBand: adjustedBand(m.pricing),
        dueAt: m.dueAt?.toISOString() ?? null,
        split: m.split,
        rating: outcome?.stars ?? null,
        onTime: outcome?.onTime ?? null,
        negotiations: ngs.filter((n) => n.milestoneId === m.id),
        payouts: pos.filter((p) => p.milestoneId === m.id).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountMinor, currency: p.currency, status: p.status, failure: p.failure })),
        checkRuns: runs.filter((r) => r.milestoneId === m.id).map((r) => ({ id: r.id, attempt: r.attempt, mode: r.mode, replayUrl: r.replayUrl, steps: r.steps, at: r.finishedAt.toISOString() })),
        materials: mats.filter((x) => x.milestoneId === m.id),
        delivery: dels.find((d) => d.milestoneId === m.id) ?? null,
        status: state.status,
        fundMinor: state.fundMinor,
        payoutMinor: state.payoutMinor,
        chargeCurrency: state.currency,
        authorizationHealth: authorizationHealth(state, now),
        authorizationExpiresAt: state.authorization?.expiresAt.toISOString() ?? null,
        checkAttempts: state.checkAttempts,
        lastCheck: state.lastCheck,
        firstPass: state.firstPass,
        canFundNow: earlierReleased || contract.allowParallel || m.kind === "change_order",
      };
    }),
    events: events.map((e) => ({
      eventId: e.eventId,
      milestoneId: e.milestoneId,
      type: e.type,
      actorKind: e.actorKind,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      at: e.createdAt.toISOString(),
    })),
  };
}

export type ContractView = Awaited<ReturnType<typeof getContractView>>;

/** Load one milestone with its contract, checking the viewer is a party. */
export async function loadMilestoneFor(db: Db, viewer: Viewer, milestoneId: string) {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!row) throw notFound("Milestone");
  const { contract, role } = await loadContractFor(db, viewer, row.contractId);
  const siblings = await db
    .select({ id: milestones.id, position: milestones.position, status: milestones.status })
    .from(milestones)
    .where(and(eq(milestones.contractId, row.contractId)));
  const earlierReleased = siblings
    .filter((s) => s.position < row.position)
    .every((s) => RELEASED_STATUSES.includes(s.status as MilestoneStatus));
  return { row, state: fromStored(row.state), contract, role, earlierReleased };
}

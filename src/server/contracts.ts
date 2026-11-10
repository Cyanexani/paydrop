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
import { AgentPricingError, defaultLadder, quoteAgent, resolveLadder, type AgentPlan, type AgentQuote } from "@/lib/agents/estimate";
import { priceContract, type PricedMilestone } from "@/lib/pricing/engine";
import { buildReceipt } from "@/lib/pricing/receipt";
import { milestoneDueDates } from "@/lib/time";
import { badRequest, forbidden, newId, notFound } from "./errors";
import { loadCatalog } from "./agent-catalog";
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
  /** For an AI agent: the models on its ladder, cheapest first (default: chosen from live prices). */
  agentModels: z.array(z.string().min(1).max(200)).min(1).max(3).optional(),
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

  // An AI agent is priced by the models it runs on: the ladder and its price are locked here too.
  let agent: AgentQuote | null = null;
  if (freelancer.kind === "agent") {
    const catalog = await loadCatalog();
    const base = priceContract({ milestones: toPricingInputs(scope.milestones), availableDays: q.deadlineDays, freelancer: null });
    try {
      const ladder = input.agentModels ? resolveLadder(catalog.models, input.agentModels, scope.milestones) : defaultLadder(catalog.models, scope.milestones);
      const [owner] = freelancer.ownerId ? await db.select({ name: users.name }).from(users).where(eq(users.id, freelancer.ownerId)) : [];
      agent = quoteAgent({
        ladder,
        drafts: scope.milestones,
        inrPerUsd: rate,
        ownerName: owner?.name ?? "the agent's owner",
        humanPricesMinor: base.status === "priced" ? base.milestones.map((m) => m.priceMinor) : undefined,
      });
    } catch (error) {
      if (error instanceof AgentPricingError) throw badRequest(error.message, "agent_pricing");
      throw error;
    }
  }

  const rows = quote.milestones.map((m, i) => {
    const id = newId("ms");
    const draft = scope.milestones[i];
    const a = agent?.milestones[i];
    // For an agent, the human pricing record is kept for reference; price, fee and receipt are the model-priced ones.
    const priced = a ? ({ ...m, priceMinor: a.priceMinor, feeMinor: a.feeMinor, agentPlan: a.plan } as PricedMilestone) : m;
    const fundMinor = toChargeMinor(priced.priceMinor + priced.feeMinor, currency, rate);
    const payoutMinor = toChargeMinor(priced.priceMinor, currency, rate);
    const state = newMilestoneState({ id, fundMinor, payoutMinor, currency, contractedOrigins: [origin] });
    return {
      id,
      contractId,
      position: i,
      draft,
      pricing: priced,
      receipt: a ? a.receipt : buildReceipt(m, quote.tier, standing),
      priceMinor: priced.priceMinor,
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
      subtotalMinor: agent?.subtotalMinor ?? quote.subtotalMinor,
      feeMinor: agent?.feeMinor ?? quote.feeMinor,
      totalMinor: agent?.totalMinor ?? quote.totalMinor,
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
  const rows = await db
    .select()
    .from(contracts)
    .where(or(eq(contracts.clientId, viewer.id), inArray(contracts.freelancerId, ids)))
    .orderBy(desc(contracts.createdAt));
  if (rows.length === 0) return [];
  // Each contract carries its milestones' status and price, so a list can show progress at a glance.
  const [stops, people] = await Promise.all([
    db
      .select({ contractId: milestones.contractId, position: milestones.position, status: milestones.status, priceMinor: milestones.priceMinor })
      .from(milestones)
      .where(inArray(milestones.contractId, rows.map((r) => r.id)))
      .orderBy(asc(milestones.position)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.flatMap((r) => [r.clientId, r.freelancerId]))])),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((c) => ({
    ...c,
    clientName: nameOf.get(c.clientId) ?? "",
    freelancerName: nameOf.get(c.freelancerId) ?? "",
    milestones: stops.filter((m) => m.contractId === c.id).map(({ position, status, priceMinor }) => ({ position, status, priceMinor })),
  }));
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
    db.select({ id: deliveries.id, milestoneId: deliveries.milestoneId, createdAt: deliveries.createdAt, run: deliveries.run }).from(deliveries).where(eq(deliveries.contractId, contractId)).orderBy(asc(deliveries.createdAt)),
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
        delivery: dels.findLast((d) => d.milestoneId === m.id) ?? null,
        /** For an AI agent: the model ladder locked at signing, and each attempt with its real cost */
        agentPlan: (m.pricing as PricedMilestone & { agentPlan?: AgentPlan }).agentPlan ?? null,
        agentRuns: dels.filter((d) => d.milestoneId === m.id && d.run).map((d) => ({ ...d.run!, at: d.createdAt.toISOString() })),
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

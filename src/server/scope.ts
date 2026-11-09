import { and, asc, desc, eq, inArray, max, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { changeRequests, contracts, messages, milestones, users, type ScopeCheck } from "@/db/schema";
import { detectScope } from "@/lib/ai/scope-detector";
import { MilestoneDraft } from "@/lib/ai/scoping-schema";
import { chargeCurrency, inrPerUsd, toChargeMinor } from "@/lib/fx";
import { newMilestoneState } from "@/lib/milestones/state-machine";
import { formatMoney } from "@/lib/money";
import { priceContract, type PricedMilestone } from "@/lib/pricing/engine";
import { buildReceipt } from "@/lib/pricing/receipt";
import { indexScopeDocs, localScopeSearch, searchScope, type ScopeDoc } from "@/lib/search/elastic";
import { addDays, endOfDayIn } from "@/lib/time";
import { loadContractFor } from "./contracts";
import { AppError, badRequest, forbidden, newId, notFound } from "./errors";
import { emitEvent } from "./integrations";
import { applyMilestoneEvent, toStored } from "./milestone-store";
import { toPricingInputs } from "./quotes";
import type { Viewer } from "./session";

type Contract = typeof contracts.$inferSelect;

export function scopeDocs(contractId: string, rows: Array<typeof milestones.$inferSelect>): ScopeDoc[] {
  return rows.map((m) => ({
    contractId,
    milestoneId: m.id,
    kind: m.kind === "change_order" ? "change_order" : "milestone",
    title: m.draft.title,
    body: `${m.draft.description} Criteria: ${m.draft.criteria.map((c) => c.text).join("; ")}`,
  }));
}

/** Keep Elastic in sync with a contract's milestones (no-op without Elastic). */
export async function indexContract(db: Db, contractId: string) {
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contractId));
  await indexScopeDocs(scopeDocs(contractId, rows));
}

export const MessageRequest = z.object({ body: z.string().trim().min(1).max(4000) });

export async function postMessage(db: Db, viewer: Viewer, contractId: string, body: string) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  const row = { id: newId("msg"), contractId, channel: "app" as const, authorId: viewer.id, sender: viewer.name, body };
  await db.insert(messages).values(row);
  // Only the client's requests can creep the scope.
  const scope = role === "client" && contract.status === "active" ? await checkScope(db, contract, row.id, body) : null;
  return { ...row, scope };
}

export const ZapierMessage = z.object({
  from: z.string().trim().min(3).max(200),
  text: z.string().trim().min(1).max(4000),
  channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  contractId: z.string().optional(),
});

/** Client WhatsApp/email messages forwarded by Zapier become scope checks. Unknown senders are ignored. */
export async function zapierInbound(db: Db, secret: string | null, input: z.infer<typeof ZapierMessage>) {
  if (!process.env.ZAPIER_SECRET) throw new AppError(503, "not_configured", "Set ZAPIER_SECRET to accept Zapier messages");
  if (secret !== process.env.ZAPIER_SECRET) throw forbidden("Bad Zapier secret");

  const digits = input.from.replace(/\D/g, "");
  const candidates = await db
    .select()
    .from(users)
    .where(or(eq(users.contactEmail, input.from.toLowerCase()), digits.length >= 8 ? eq(users.contactPhone, `+${digits}`) : eq(users.id, "__none__")));
  const client = candidates.find((u) => u.role === "client");
  if (!client) {
    console.warn(`Zapier message from unknown sender ${input.from} ignored`);
    return { ignored: true, reason: "Sender doesn't match any client's verified email or phone" };
  }
  const [contract] = input.contractId
    ? await db.select().from(contracts).where(and(eq(contracts.id, input.contractId), eq(contracts.clientId, client.id)))
    : await db.select().from(contracts).where(and(eq(contracts.clientId, client.id), eq(contracts.status, "active"))).orderBy(desc(contracts.createdAt)).limit(1);
  if (!contract) return { ignored: true, reason: "The sender has no active contract" };

  const row = { id: newId("msg"), contractId: contract.id, channel: "zapier" as const, authorId: client.id, sender: `${client.name} via ${input.channel}`, body: input.text };
  await db.insert(messages).values(row);
  const scope = await checkScope(db, contract, row.id, input.text);
  return { ignored: false, contractId: contract.id, messageId: row.id, scope };
}

async function checkScope(db: Db, contract: Contract, messageId: string, text: string): Promise<ScopeCheck> {
  const rows = await db.select().from(milestones).where(eq(milestones.contractId, contract.id)).orderBy(asc(milestones.position));
  const docs = scopeDocs(contract.id, rows);
  const elasticHits = await searchScope(contract.id, text);
  const hits = elasticHits ?? localScopeSearch(docs, text);
  const summary = rows.map((m) => `[${m.id}] ${m.draft.title}: ${m.draft.description} Criteria: ${m.draft.criteria.map((c) => c.text).join("; ")}`).join("\n");
  const verdict = await detectScope(text, hits, summary);
  const scope: ScopeCheck = {
    verdict: verdict.verdict,
    reasoning: verdict.reasoning,
    matchedMilestones: rows.filter((m) => verdict.matchedMilestoneIds.includes(m.id)).map((m) => m.draft.title),
    searchMode: elasticHits ? "elastic" : "postgres",
  };
  let changeRequestId: string | null = null;
  if (verdict.verdict === "out_of_scope" && verdict.changeOrder) {
    changeRequestId = await createChangeRequest(db, contract, verdict.changeOrder, "detector", messageId);
  }
  await db.update(messages).set({ scope, changeRequestId }).where(eq(messages.id, messageId));
  return scope;
}

function priceChangeOrder(contract: Contract, draft: MilestoneDraft): PricedMilestone | null {
  // Change orders are priced at the contract's locked tier, at a normal pace.
  const quote = priceContract({ milestones: toPricingInputs([draft]), availableDays: 365, freelancer: contract.standing });
  return quote.status === "priced" ? quote.milestones[0] : null;
}

export async function createChangeRequest(db: Db, contract: Contract, draft: MilestoneDraft, source: "detector" | "freelancer", messageId: string | null = null) {
  const pricing = priceChangeOrder(contract, draft);
  const id = newId("chg");
  await db.insert(changeRequests).values({ id, contractId: contract.id, messageId, source, title: draft.title, description: draft.description, draft, pricing, status: "proposed" });
  void emitEvent({ type: "change_request.created", contractId: contract.id, changeRequestId: id, title: draft.title, price: pricing ? formatMoney(pricing.priceMinor) : null });
  return id;
}

export const FreelancerChangeRequest = MilestoneDraft.omit({ complexityReason: true }).extend({
  complexityReason: z.string().default(""),
  estimate: z
    .object({ optimistic: z.number().positive(), likely: z.number().positive(), pessimistic: z.number().positive(), reasoning: z.string().default("Freelancer's estimate") })
    .refine((e) => e.optimistic <= e.likely && e.likely <= e.pessimistic, "estimates must satisfy optimistic ≤ likely ≤ pessimistic"),
});

/** The detector missed something: the freelancer raises a change order by hand. */
export async function raiseChangeRequest(db: Db, viewer: Viewer, contractId: string, input: z.infer<typeof FreelancerChangeRequest>) {
  const { contract, role } = await loadContractFor(db, viewer, contractId);
  if (role === "client") throw forbidden("Only the freelancer raises change orders");
  if (contract.status !== "active") throw badRequest("Change orders need an active contract");
  return { id: await createChangeRequest(db, contract, input, "freelancer") };
}

export const ScheduleChangeRequest = z.object({ milestoneId: z.string(), dueAt: z.string().datetime({ offset: true }) });

/** Dragging a deadline on the Gantt proposes a schedule change; the other party must agree. */
export async function proposeScheduleChange(db: Db, viewer: Viewer, contractId: string, input: z.infer<typeof ScheduleChangeRequest>) {
  const { contract } = await loadContractFor(db, viewer, contractId);
  if (contract.status !== "active") throw badRequest("Schedule changes need an active contract");
  const [m] = await db.select().from(milestones).where(and(eq(milestones.id, input.milestoneId), eq(milestones.contractId, contractId)));
  if (!m) throw notFound("Milestone");
  if (["released", "payout_pending", "paid_out", "voided", "cancelled"].includes(m.status)) throw badRequest("That milestone is already settled");
  const target = endOfDayIn(new Date(input.dueAt), contract.timezone);
  const id = newId("chg");
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: contract.timezone, day: "numeric", month: "short" });
  await db.insert(changeRequests).values({
    id,
    contractId,
    source: "gantt",
    title: `Move "${m.draft.title}" to ${fmt(target)}`,
    description: `${viewer.name} proposed moving the due date from ${m.dueAt ? fmt(m.dueAt) : "unset"} to ${fmt(target)}.`,
    draft: m.draft,
    pricing: null,
    status: "proposed",
    targetMilestoneId: m.id,
    targetDueAt: target,
    proposedBy: viewer.id,
  });
  return { id };
}

export const ChangeDecision = z.enum(["accept", "decline", "in_scope"]);

export async function decideChangeRequest(db: Db, viewer: Viewer, changeRequestId: string, decision: z.infer<typeof ChangeDecision>) {
  const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, changeRequestId));
  if (!cr) throw notFound("Change request");
  const { contract, role } = await loadContractFor(db, viewer, cr.contractId);
  if (cr.status !== "proposed") throw badRequest(`Already ${cr.status.replace("_", " ")}`);

  if (decision === "in_scope") {
    // The flag is only a proposal: either party can say it's covered; nothing is charged.
    if (cr.source === "gantt") throw badRequest("Schedule changes are accepted or declined");
    await db.update(changeRequests).set({ status: "in_scope", decidedAt: new Date() }).where(eq(changeRequests.id, cr.id));
    return { status: "in_scope" };
  }

  if (cr.source === "gantt") {
    // Either party proposes; the other one decides.
    if (cr.proposedBy === viewer.id && decision === "accept") throw forbidden("The other party has to accept your schedule change");
    if (decision === "decline") {
      await db.update(changeRequests).set({ status: "declined", decidedAt: new Date() }).where(eq(changeRequests.id, cr.id));
      return { status: "declined" };
    }
    await db.update(milestones).set({ dueAt: cr.targetDueAt }).where(eq(milestones.id, cr.targetMilestoneId!));
    await db.update(changeRequests).set({ status: "accepted", decidedAt: new Date() }).where(eq(changeRequests.id, cr.id));
    return { status: "accepted" };
  }

  if (role !== "client") throw forbidden("Only the client accepts or declines a change order");
  if (decision === "decline") {
    // Client won't pay: the extra work isn't started; original milestones carry on.
    await db.update(changeRequests).set({ status: "declined", decidedAt: new Date() }).where(eq(changeRequests.id, cr.id));
    return { status: "declined" };
  }
  if (contract.status !== "active") throw badRequest("The contract isn't active");
  const pricing = cr.pricing ?? priceChangeOrder(contract, cr.draft);
  if (!pricing) throw badRequest("This change order couldn't be priced; raise it again with clearer estimates");

  const [{ last }] = await db.select({ last: max(milestones.position) }).from(milestones).where(eq(milestones.contractId, contract.id));
  const id = newId("ms");
  const currency = chargeCurrency();
  const rate = inrPerUsd();
  const state = newMilestoneState({
    id,
    fundMinor: toChargeMinor(pricing.priceMinor + pricing.feeMinor, currency, rate),
    payoutMinor: toChargeMinor(pricing.priceMinor, currency, rate),
    currency,
    contractedOrigins: contract.contractedOrigins,
  });
  await db.transaction(async (tx) => {
    await tx.insert(milestones).values({
      id,
      contractId: contract.id,
      position: (last ?? -1) + 1,
      kind: "change_order",
      draft: cr.draft,
      pricing,
      receipt: buildReceipt(pricing, contract.tier, contract.standing),
      priceMinor: pricing.priceMinor,
      status: state.status,
      version: state.version,
      state: toStored(state),
      dueAt: endOfDayIn(addDays(new Date(), cr.draft.durationDays), contract.timezone),
    });
    await tx
      .update(contracts)
      .set({ subtotalMinor: contract.subtotalMinor + pricing.priceMinor, feeMinor: contract.feeMinor + pricing.feeMinor, totalMinor: contract.totalMinor + pricing.priceMinor + pricing.feeMinor })
      .where(eq(contracts.id, contract.id));
    await tx.update(changeRequests).set({ status: "accepted", milestoneId: id, decidedAt: new Date() }).where(eq(changeRequests.id, cr.id));
  });
  // A freelancer-raised change order is already agreed by the freelancer.
  if (cr.source === "freelancer") {
    await applyMilestoneEvent(db, id, { type: "ACCEPT", eventId: `accept-${id}`, at: new Date(), actor: { kind: "freelancer", id: contract.freelancerId } });
  }
  void indexContract(db, contract.id);
  return { status: "accepted", milestoneId: id };
}

export async function messagesFor(db: Db, contractIds: string[]) {
  if (contractIds.length === 0) return [];
  return db.select().from(messages).where(inArray(messages.contractId, contractIds)).orderBy(asc(messages.createdAt));
}

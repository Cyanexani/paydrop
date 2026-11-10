import { desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { milestones, quotes } from "@/db/schema";
import { scopeBrief } from "@/lib/ai/scoping";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import type { Skill } from "@/lib/pricing/config";
import { PricingError, priceContract, type ContractQuote, type MilestoneInput } from "@/lib/pricing/engine";
import { buildReceipt, type Receipt } from "@/lib/pricing/receipt";
import { AppError, badRequest, forbidden, newId, notFound } from "./errors";
import type { AgentModel, Catalog } from "@/lib/agents/catalog";
import { AgentPricingError, defaultLadder, quoteAgent, type AgentQuote } from "@/lib/agents/estimate";
import { inrPerUsd } from "@/lib/fx";
import { loadCatalog } from "./agent-catalog";
import { matchFreelancers, type Candidate } from "./matching";
import type { Viewer } from "./session";

export const QuoteRequest = z.object({
  brief: z.string().trim().min(1).max(5000),
  deadlineDays: z.number().int().min(1).max(365),
  budgetMinor: z.number().int().nonnegative().optional(),
});

export function toPricingInputs(drafts: readonly MilestoneDraft[]): MilestoneInput[] {
  return drafts.map((d, i) => ({
    key: `m${i + 1}`,
    title: d.title,
    skill: d.skill,
    estimate: { optimistic: d.estimate.optimistic, likely: d.estimate.likely, pessimistic: d.estimate.pessimistic },
    complexityTags: d.complexityTags,
    durationDays: d.durationDays,
  }));
}

/** The skill with the most expected hours decides which reputation counts. */
export function primarySkill(drafts: readonly MilestoneDraft[]): Skill {
  const hours = new Map<Skill, number>();
  for (const d of drafts) hours.set(d.skill, (hours.get(d.skill) ?? 0) + d.estimate.likely);
  return [...hours.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export interface PricedCandidate {
  candidate: Candidate;
  quote: Extract<ContractQuote, { status: "priced" }>;
  receipts: Receipt[];
  /** AI agents are priced by the models they run on, not by hours: present for agent candidates. */
  agent?: AgentQuote | null;
}

/** The models an agent can run on, sent with the quote so the client can build its own ladder. */
export interface AgentCatalogView {
  source: Catalog["source"];
  fetchedAt: string;
  inrPerUsd: number;
  models: AgentModel[];
}

export type QuoteView = {
  id: string;
  brief: string;
  deadlineDays: number;
  budgetMinor: number | null;
  scope: (typeof quotes.$inferSelect)["scope"];
  meta: (typeof quotes.$inferSelect)["meta"];
  pricing:
    | { status: "not_priced" }
    | { status: "error"; code: string; message: string }
    | Exclude<ContractQuote, { status: "priced" }>
    | { status: "priced"; base: Extract<ContractQuote, { status: "priced" }>; candidates: PricedCandidate[]; agentCatalog: AgentCatalogView | null };
};

export async function createQuote(db: Db, viewer: Viewer, input: z.infer<typeof QuoteRequest>, opts: { demoScoper?: boolean } = {}): Promise<QuoteView> {
  if (viewer.role !== "client") throw forbidden("Only clients can request quotes");
  // The estimator learns: the latest milestones with reported hours become calibration examples.
  const done = await db
    .select({ draft: milestones.draft, actualHours: milestones.actualHours })
    .from(milestones)
    .where(isNotNull(milestones.actualHours))
    .orderBy(desc(milestones.updatedAt))
    .limit(8);
  const examples = done.map((d) => ({ title: d.draft.title, likelyHours: d.draft.estimate.likely, actualHours: d.actualHours! }));
  const { result, meta } = await scopeBrief(input.brief, examples, { demo: opts.demoScoper });
  const id = newId("q");
  await db.insert(quotes).values({
    id,
    clientId: viewer.id,
    brief: input.brief,
    deadlineDays: input.deadlineDays,
    budgetMinor: input.budgetMinor ?? null,
    scope: result,
    meta,
  });
  return getQuoteView(db, viewer, id);
}

export async function getQuoteView(db: Db, viewer: Viewer, id: string, now = new Date()): Promise<QuoteView> {
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) throw notFound("Quote");
  if (q.clientId !== viewer.id) throw forbidden();
  const view: Omit<QuoteView, "pricing"> = {
    id: q.id,
    brief: q.brief,
    deadlineDays: q.deadlineDays,
    budgetMinor: q.budgetMinor,
    scope: q.scope,
    meta: q.meta,
  };
  if (q.scope.status !== "scoped") return { ...view, pricing: { status: "not_priced" } };

  const inputs = toPricingInputs(q.scope.milestones);
  try {
    const base = priceContract({
      milestones: inputs,
      availableDays: q.deadlineDays,
      freelancer: null,
      budgetMinor: q.budgetMinor ?? undefined,
    });
    if (base.status !== "priced") return { ...view, pricing: base };

    const skills = [...new Set(q.scope.milestones.map((m) => m.skill))];
    const matches = await matchFreelancers(db, skills, primarySkill(q.scope.milestones), viewer.id, now);
    const candidates = matches.flatMap((candidate): PricedCandidate[] => {
      const quote = priceContract({
        milestones: inputs,
        availableDays: q.deadlineDays,
        freelancer: candidate.standing,
        budgetMinor: q.budgetMinor ?? undefined,
      });
      if (quote.status !== "priced") return [];
      return [
        { candidate, quote, receipts: quote.milestones.map((m) => buildReceipt(m, quote.tier, candidate.standing)) },
      ];
    });

    // AI agents: one quote per model ladder, priced from live model prices, next to a person's base pay.
    let agentCatalog: AgentCatalogView | null = null;
    if (candidates.some((c) => c.candidate.kind === "agent")) {
      const catalog = await loadCatalog();
      const rate = inrPerUsd();
      agentCatalog = { source: catalog.source, fetchedAt: catalog.fetchedAt, inrPerUsd: rate, models: catalog.models };
      const ladder = defaultLadder(catalog.models, q.scope.milestones);
      for (const c of candidates) {
        if (c.candidate.kind !== "agent") continue;
        try {
          c.agent = quoteAgent({
            ladder,
            drafts: q.scope.milestones,
            inrPerUsd: rate,
            ownerName: c.candidate.ownerName ?? "the agent's owner",
            humanPricesMinor: base.milestones.map((m) => m.priceMinor),
          });
        } catch (error) {
          if (!(error instanceof AgentPricingError)) throw error;
          c.agent = null;
        }
      }
    }
    return { ...view, pricing: { status: "priced", base, candidates, agentCatalog } };
  } catch (error) {
    if (error instanceof PricingError) {
      return { ...view, pricing: { status: "error", code: error.code, message: error.message } };
    }
    throw error;
  }
}

export function assertQuoteRequest(body: unknown) {
  const parsed = QuoteRequest.safeParse(body);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

export { AppError };

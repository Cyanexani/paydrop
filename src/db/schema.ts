import { bigint, boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import type { CriterionResult } from "@/lib/milestones/state-machine";
import type { ScopeMeta } from "@/lib/ai/scoping";
import type { MilestoneDraft, ScopeResult } from "@/lib/ai/scoping-schema";
import type { CurrencyCode } from "@/lib/money";
import type { Receipt } from "@/lib/pricing/receipt";
import type { FreelancerStanding, PricedMilestone } from "@/lib/pricing/engine";
import type { Skill, Tier } from "@/lib/pricing/config";
import type { StoredOutcome } from "@/server/reputation";
import type { StoredMilestoneState } from "@/server/milestone-store";

const money = (name: string) => bigint(name, { mode: "number" });

/** A collaborator who receives a share of every milestone payout (the lead gets the rest). */
export interface Collaborator {
  id: string;
  name: string;
  paypalEmail: string;
  bps: number;
}

/** The payout split locked onto a milestone when it is funded. */
export interface LockedShare {
  payeeKey: string;
  name: string;
  bps: number;
  lead: boolean;
}

export interface ScopeCheck {
  verdict: "in_scope" | "out_of_scope" | "unclear" | "not_a_request";
  reasoning: string;
  matchedMilestones: string[];
  searchMode: "elastic" | "postgres";
}

export interface CheckStep {
  at: string;
  action: string;
  detail: string;
}
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").$type<"client" | "freelancer">().notNull(),
  /** Freelancers only. */
  headline: text("headline"),
  skills: jsonb("skills").$type<Skill[]>().notNull().default([]),
  paypalEmail: text("paypal_email"),
  /** An AI agent worker is registered to a human owner, whose PayPal receives the payout. */
  kind: text("kind").$type<"human" | "agent">().notNull().default("human"),
  ownerId: text("owner_id"),
  outcomes: jsonb("outcomes").$type<StoredOutcome[]>().notNull().default([]),
  /** Used to match inbound WhatsApp/email (via Zapier) to the right client. */
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  createdAt: createdAt(),
});

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  brief: text("brief").notNull(),
  deadlineDays: integer("deadline_days").notNull(),
  budgetMinor: money("budget_minor"),
  scope: jsonb("scope").$type<ScopeResult>().notNull(),
  meta: jsonb("meta").$type<ScopeMeta>().notNull(),
  createdAt: createdAt(),
});

export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id").notNull(),
    clientId: text("client_id").notNull(),
    freelancerId: text("freelancer_id").notNull(),
    title: text("title").notNull(),
    status: text("status").$type<"offered" | "active" | "completed" | "cancelled">().notNull(),
    currency: text("currency").$type<CurrencyCode>().notNull(),
    deadlineDays: integer("deadline_days").notNull(),
    allowParallel: boolean("allow_parallel").notNull().default(false),
    contractedOrigins: jsonb("contracted_origins").$type<string[]>().notNull(),
    tier: jsonb("tier").$type<Tier>().notNull(),
    standing: jsonb("standing").$type<FreelancerStanding>().notNull(),
    subtotalMinor: money("subtotal_minor").notNull(),
    feeMinor: money("fee_minor").notNull(),
    totalMinor: money("total_minor").notNull(),
    collaborators: jsonb("collaborators").$type<Collaborator[]>().notNull().default([]),
    /** Deadlines end at 23:59 in this zone. */
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("contracts_client_idx").on(t.clientId), index("contracts_freelancer_idx").on(t.freelancerId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    position: integer("position").notNull(),
    draft: jsonb("draft").$type<MilestoneDraft>().notNull(),
    pricing: jsonb("pricing").$type<PricedMilestone>().notNull(),
    receipt: jsonb("receipt").$type<Receipt>().notNull(),
    priceMinor: money("price_minor").notNull(),
    status: text("status").notNull(),
    /** Compare-and-set guard: every write must name the version it read. */
    version: integer("version").notNull(),
    state: jsonb("state").$type<StoredMilestoneState>().notNull(),
    kind: text("kind").$type<"original" | "change_order">().notNull().default("original"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Payout split, locked when the milestone is funded. */
    split: jsonb("split").$type<LockedShare[]>(),
    /** Reported by the freelancer on submission; feeds the estimator's examples. */
    actualHours: doublePrecision("actual_hours"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("milestones_contract_idx").on(t.contractId)],
);

/** One row per payee per milestone; each item is tracked and retried on its own. */
export const payouts = pgTable(
  "payouts",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    payeeKey: text("payee_key").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").$type<CurrencyCode>().notNull(),
    status: text("status").$type<"queued" | "sent" | "succeeded" | "failed">().notNull(),
    attempt: integer("attempt").notNull().default(0),
    batchId: text("batch_id"),
    failure: text("failure"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payouts_milestone_idx").on(t.milestoneId)],
);

export const negotiations = pgTable(
  "negotiations",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    milestoneId: text("milestone_id").notNull(),
    round: integer("round").notNull(),
    priceMinor: money("price_minor").notNull(),
    reason: text("reason"),
    /** Inside the fair band (adjusted for urgency and tier). */
    fair: boolean("fair").notNull(),
    aiEstimate: jsonb("ai_estimate").$type<{ optimistic: number; likely: number; pessimistic: number; reasoning: string; suggestedMinor: number }>(),
    status: text("status").$type<"open" | "accepted" | "rejected">().notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("negotiations_contract_idx").on(t.contractId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    channel: text("channel").$type<"app" | "zapier">().notNull(),
    authorId: text("author_id"),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    scope: jsonb("scope").$type<ScopeCheck>(),
    changeRequestId: text("change_request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_contract_idx").on(t.contractId)],
);

export const changeRequests = pgTable(
  "change_requests",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    messageId: text("message_id"),
    source: text("source").$type<"detector" | "freelancer" | "gantt">().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    draft: jsonb("draft").$type<MilestoneDraft>().notNull(),
    pricing: jsonb("pricing").$type<PricedMilestone>(),
    status: text("status").$type<"proposed" | "accepted" | "declined" | "in_scope">().notNull(),
    milestoneId: text("milestone_id"),
    /** Schedule changes (dragged on the Gantt): the milestone to move and its new due date. */
    targetMilestoneId: text("target_milestone_id"),
    targetDueAt: timestamp("target_due_at", { withTimezone: true }),
    /** Who proposed it; for schedule changes the other party decides. */
    proposedBy: text("proposed_by"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("change_requests_contract_idx").on(t.contractId)],
);

export const checkRuns = pgTable(
  "check_runs",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    attempt: integer("attempt").notNull(),
    mode: text("mode").$type<"kernel" | "local" | "basic">().notNull(),
    evidenceUrl: text("evidence_url").notNull(),
    commitSha: text("commit_sha"),
    replayUrl: text("replay_url"),
    results: jsonb("results").$type<CriterionResult[]>().notNull(),
    steps: jsonb("steps").$type<CheckStep[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("check_runs_milestone_idx").on(t.milestoneId)],
);

/** Sites built by AI agent workers, served at /deliveries/[id]. */
export const deliveries = pgTable("deliveries", {
  id: text("id").primaryKey(),
  milestoneId: text("milestone_id").notNull(),
  contractId: text("contract_id").notNull(),
  workerId: text("worker_id").notNull(),
  html: text("html").notNull(),
  /** Which model built it and what it cost (agent runs only; null for older rows) */
  run: jsonb("run").$type<AgentRun>(),
  createdAt: createdAt(),
});

/** One agent attempt at a milestone: the ladder rung, the model, and estimated vs actual cost. */
export interface AgentRun {
  rung: number;
  modelId: string;
  modelName: string;
  /** openrouter = a real model call; claude = the built-in Claude path; demo = template, no model called */
  mode: "openrouter" | "claude" | "demo";
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  estimatedUsd: number | null;
}

/** Materials a milestone needs (sourced through Channel3), added to its funded budget. */
export const materials = pgTable(
  "materials",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    merchant: text("merchant"),
    imageUrl: text("image_url"),
    priceMinor: money("price_minor").notNull(),
    currency: text("currency").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("materials_milestone_idx").on(t.milestoneId)],
);

/** Audit trail and idempotency: an event id can be applied once. */
export const milestoneEvents = pgTable(
  "milestone_events",
  {
    eventId: text("event_id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    type: text("type").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("milestone_events_milestone_idx").on(t.milestoneId)],
);

/** Every PayPal webhook we receive, deduplicated by PayPal's event id. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  outcome: text("outcome"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Deterministic pricing engine. The AI supplies judgments (hour estimates, complexity
 * tags, reasons); every number on a price receipt is computed here, so the same inputs
 * always give the same price.
 */
import { assertMinor, ceilToStep, roundToStep, type Minor } from "@/lib/money";
import {
  COMPLEXITY,
  PRICING,
  SKILL_BASE_RATE_MINOR,
  type ComplexityTag,
  type Skill,
  type Tier,
} from "./config";
import { tierFor } from "./reputation";

export interface HourEstimate {
  optimistic: number;
  likely: number;
  pessimistic: number;
}

export type PricingErrorCode =
  | "invalid_estimate"
  | "invalid_input"
  | "no_milestones"
  | "too_many_milestones"
  | "milestone_too_long"
  | "rate_needed";

export class PricingError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export function validateEstimate(e: HourEstimate): void {
  const values = [e.optimistic, e.likely, e.pessimistic];
  if (!values.every((v) => Number.isFinite(v) && v > 0)) {
    throw new PricingError("invalid_estimate", "Hour estimates must be positive numbers", { estimate: e });
  }
  if (!(e.optimistic <= e.likely && e.likely <= e.pessimistic)) {
    throw new PricingError("invalid_estimate", "Estimates must satisfy optimistic ≤ likely ≤ pessimistic", {
      estimate: e,
    });
  }
}

/** PERT expected hours: E = (O + 4M + P) / 6. */
export function pertHours(e: HourEstimate): number {
  validateEstimate(e);
  return (e.optimistic + 4 * e.likely + e.pessimistic) / 6;
}

/** The highest tag applies, never the product of several. */
export function complexityFor(tags: readonly ComplexityTag[]): { tag: ComplexityTag; multiplier: number } {
  let best: { tag: ComplexityTag; multiplier: number } = { tag: "standard", multiplier: 1 };
  for (const tag of tags) {
    const { multiplier } = COMPLEXITY[tag];
    if (multiplier > best.multiplier) best = { tag, multiplier };
  }
  return best;
}

export type UrgencyResult =
  | { feasible: true; multiplier: number; normalDays: number; availableDays: number; compression: number }
  | {
      feasible: false;
      reason: "deadline_passed" | "too_short";
      normalDays: number;
      availableDays: number;
      earliestDays: number;
    };

/**
 * Urgency is 1.0 when the deadline allows the normal pace (4 productive hours a day),
 * plus 0.10 for every full 25% the schedule is compressed, capped at 1.3.
 * A schedule needing more than 10 hours a day is rejected with the earliest workable length.
 */
export function urgencyFor(expectedHours: number, availableDays: number): UrgencyResult {
  const normalDays = expectedHours / PRICING.productiveHoursPerDay;
  const earliestDays = Math.ceil(expectedHours / PRICING.maxHoursPerDay - 1e-9);
  if (!(availableDays > 0)) {
    return { feasible: false, reason: "deadline_passed", normalDays, availableDays, earliestDays };
  }
  if (expectedHours / availableDays > PRICING.maxHoursPerDay + 1e-9) {
    return { feasible: false, reason: "too_short", normalDays, availableDays, earliestDays };
  }
  if (availableDays >= normalDays) {
    return { feasible: true, multiplier: 1, normalDays, availableDays, compression: 0 };
  }
  const compression = 1 - availableDays / normalDays;
  const steps = Math.floor(compression / PRICING.urgencyStepFraction + 1e-9);
  const multiplier = Math.min(PRICING.urgencyCap, round2(1 + steps * PRICING.urgencyStep));
  return { feasible: true, multiplier, normalDays, availableDays, compression };
}

export interface RateOptions {
  /** Override the benchmark table, e.g. in tests or for a manual rate the client agreed to. */
  baseRates?: Partial<Record<Skill, Minor>>;
}

export function baseRateFor(skill: Skill, options: RateOptions = {}): Minor {
  const rate = options.baseRates ? options.baseRates[skill] : SKILL_BASE_RATE_MINOR[skill];
  if (rate === undefined) {
    throw new PricingError("rate_needed", `No base rate for skill "${skill}"; ask for a manual rate`, { skill });
  }
  assertMinor(rate, "base rate");
  return rate;
}

/** Task value = expected hours × complexity × base rate, rounded to ₹50, never below the hourly floor. */
export function taskValue(
  expectedHours: number,
  complexity: number,
  baseRateMinor: Minor,
): { valueMinor: Minor; floorApplied: boolean } {
  const raw = expectedHours * complexity * baseRateMinor;
  const valueMinor = roundToStep(raw, PRICING.taskValueStepMinor);
  const floorMinor = ceilToStep(expectedHours * PRICING.floorRateMinorPerHour, PRICING.taskValueStepMinor);
  if (valueMinor < floorMinor) return { valueMinor: floorMinor, floorApplied: true };
  return { valueMinor, floorApplied: false };
}

/** Fair negotiation band: optimistic to pessimistic hours at the same complexity and rate. */
export function fairBand(
  estimate: HourEstimate,
  complexity: number,
  baseRateMinor: Minor,
): { lowMinor: Minor; highMinor: Minor } {
  validateEstimate(estimate);
  return {
    lowMinor: roundToStep(estimate.optimistic * complexity * baseRateMinor, PRICING.taskValueStepMinor),
    highMinor: roundToStep(estimate.pessimistic * complexity * baseRateMinor, PRICING.taskValueStepMinor),
  };
}

export function isFairCounter(offerMinor: Minor, band: { lowMinor: Minor; highMinor: Minor }): boolean {
  return offerMinor >= band.lowMinor && offerMinor <= band.highMinor;
}

export interface MilestoneInput {
  key: string;
  title: string;
  skill: Skill;
  estimate: HourEstimate;
  complexityTags: readonly ComplexityTag[];
  durationDays: number;
}

export interface FreelancerStanding {
  vrs: number;
  verifiedMilestones: number;
}

export interface ContractPricingInput {
  milestones: readonly MilestoneInput[];
  /** Calendar days from signing to the final deadline. */
  availableDays: number;
  /** null = price the work only (base), before a freelancer is chosen. */
  freelancer: FreelancerStanding | null;
  budgetMinor?: Minor;
}

export interface PricedMilestone {
  key: string;
  title: string;
  skill: Skill;
  estimate: HourEstimate;
  expectedHours: number;
  complexityTag: ComplexityTag;
  complexity: number;
  baseRateMinor: Minor;
  taskValueMinor: Minor;
  floorApplied: boolean;
  minimumApplied: boolean;
  urgency: number;
  premium: number;
  /** What the freelancer earns for this milestone. */
  priceMinor: Minor;
  /** Platform fee the client pays on top when funding this milestone. */
  feeMinor: Minor;
  fairBand: { lowMinor: Minor; highMinor: Minor };
}

export interface BudgetCheck {
  budgetMinor: Minor;
  withinBudget: boolean;
  shortfallMinor: Minor;
  /** Ways to close the gap; the price itself never drops below the floor. */
  options: Array<"cut_scope" | "extend_deadline" | "newer_freelancer">;
}

export type ContractQuote =
  | {
      status: "needs_info";
      reason: "too_vague";
      ratio: number;
      totalOptimistic: number;
      totalPessimistic: number;
    }
  | {
      status: "infeasible";
      reason: "deadline_passed" | "too_short";
      expectedHours: number;
      availableDays: number;
      earliestDays: number;
    }
  | {
      status: "priced";
      milestones: PricedMilestone[];
      expectedHours: number;
      urgency: Extract<UrgencyResult, { feasible: true }>;
      tier: Tier;
      freelancer: FreelancerStanding | null;
      baseSubtotalMinor: Minor;
      subtotalMinor: Minor;
      feeMinor: Minor;
      totalMinor: Minor;
      budget: BudgetCheck | null;
    };

export function priceContract(input: ContractPricingInput, options: RateOptions = {}): ContractQuote {
  const { milestones } = input;
  if (milestones.length === 0) throw new PricingError("no_milestones", "A contract needs at least one milestone");
  if (milestones.length > PRICING.maxMilestonesPerContract) {
    throw new PricingError(
      "too_many_milestones",
      `At most ${PRICING.maxMilestonesPerContract} milestones per contract; split the project into phases`,
      { count: milestones.length },
    );
  }
  const keys = new Set<string>();
  for (const m of milestones) {
    validateEstimate(m.estimate);
    if (keys.has(m.key)) throw new PricingError("invalid_input", `Duplicate milestone key "${m.key}"`);
    keys.add(m.key);
    if (!(m.durationDays > 0) || m.durationDays > PRICING.maxMilestoneDays) {
      throw new PricingError(
        "milestone_too_long",
        `"${m.title}" must take 1–${PRICING.maxMilestoneDays} days so its PayPal hold stays valid; split it`,
        { key: m.key, durationDays: m.durationDays },
      );
    }
  }

  // Vagueness is judged on the whole brief: one small milestone with a wide range
  // (e.g. 2/3/6 hours) should not block an otherwise well-specified project.
  const totalOptimistic = sum(milestones.map((m) => m.estimate.optimistic));
  const totalPessimistic = sum(milestones.map((m) => m.estimate.pessimistic));
  const ratio = totalPessimistic / totalOptimistic;
  if (ratio > PRICING.vagueRatio + 1e-9) {
    return { status: "needs_info", reason: "too_vague", ratio, totalOptimistic, totalPessimistic };
  }

  const expectedHours = sum(milestones.map((m) => pertHours(m.estimate)));
  const urgency = urgencyFor(expectedHours, input.availableDays);
  if (!urgency.feasible) {
    return {
      status: "infeasible",
      reason: urgency.reason,
      expectedHours,
      availableDays: input.availableDays,
      earliestDays: urgency.earliestDays,
    };
  }

  const standing = input.freelancer;
  const tier = standing ? tierFor(standing.vrs, standing.verifiedMilestones) : tierFor(0, 0);

  const priced = milestones.map((m): PricedMilestone => {
    const expected = pertHours(m.estimate);
    const { tag, multiplier } = complexityFor(m.complexityTags);
    const rate = baseRateFor(m.skill, options);
    const value = taskValue(expected, multiplier, rate);
    const minimumApplied = value.valueMinor < PRICING.minMilestoneMinor;
    const taskValueMinor = Math.max(value.valueMinor, PRICING.minMilestoneMinor);
    const priceMinor = roundToStep(taskValueMinor * urgency.multiplier * (1 + tier.premium), PRICING.priceStepMinor);
    return {
      key: m.key,
      title: m.title,
      skill: m.skill,
      estimate: m.estimate,
      expectedHours: expected,
      complexityTag: tag,
      complexity: multiplier,
      baseRateMinor: rate,
      taskValueMinor,
      floorApplied: value.floorApplied,
      minimumApplied,
      urgency: urgency.multiplier,
      premium: tier.premium,
      priceMinor,
      feeMinor: Math.round(priceMinor * PRICING.platformFeeRate),
      fairBand: fairBand(m.estimate, multiplier, rate),
    };
  });

  const baseSubtotalMinor = sum(priced.map((m) => m.taskValueMinor));
  const subtotalMinor = sum(priced.map((m) => m.priceMinor));
  // Fees are rounded per milestone (each milestone is funded separately) and summed,
  // so per-milestone funding always adds up to the contract total.
  const feeMinor = sum(priced.map((m) => m.feeMinor));
  const totalMinor = subtotalMinor + feeMinor;

  let budget: BudgetCheck | null = null;
  if (input.budgetMinor !== undefined) {
    assertMinor(input.budgetMinor, "budget");
    const shortfallMinor = Math.max(0, totalMinor - input.budgetMinor);
    budget = {
      budgetMinor: input.budgetMinor,
      withinBudget: shortfallMinor === 0,
      shortfallMinor,
      options:
        shortfallMinor === 0
          ? []
          : [
              "cut_scope",
              ...(urgency.multiplier > 1 ? (["extend_deadline"] as const) : []),
              ...(tier.premium > 0 ? (["newer_freelancer"] as const) : []),
            ],
    };
  }

  return {
    status: "priced",
    milestones: priced,
    expectedHours,
    urgency,
    tier,
    freelancer: standing,
    baseSubtotalMinor,
    subtotalMinor,
    feeMinor,
    totalMinor,
    budget,
  };
}

export function firstPassBonusMinor(priceMinor: Minor): Minor {
  return roundToStep(priceMinor * PRICING.firstPassBonusRate, PRICING.priceStepMinor);
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

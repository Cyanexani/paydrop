import type { Skill } from "@/lib/pricing/config";
import type { FreelancerStanding } from "@/lib/pricing/engine";
import { reputationFor, type OutcomeRecord } from "@/lib/pricing/reputation";

/** OutcomeRecord as stored in JSON (dates as ISO strings). `milestoneId` is absent on seeded history. */
export type StoredOutcome = Omit<OutcomeRecord, "completedAt"> & { completedAt: string; milestoneId?: string };

export function reviveOutcomes(stored: readonly StoredOutcome[]): OutcomeRecord[] {
  return stored.map((o) => ({ ...o, completedAt: new Date(o.completedAt) }));
}

export function standingFor(outcomes: readonly StoredOutcome[], skill: Skill, now: Date) {
  const rep = reputationFor(reviveOutcomes(outcomes), skill, now);
  const standing: FreelancerStanding = { vrs: rep.vrs, verifiedMilestones: rep.stats.verified };
  return { standing, tier: rep.tier, breakdown: rep };
}

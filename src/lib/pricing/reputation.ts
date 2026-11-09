/**
 * Verified Reputation Score (VRS), tracked per skill.
 * VRS = 100 × (0.35·FPR + 0.25·OTR + 0.20·Rating + 0.20·Volume)
 * AI-verified outcomes (first-pass, on-time, volume) carry 80% of the weight; ratings 20%.
 */
import { TIERS, type Skill, type Tier } from "./config";

const HALF_LIFE_DAYS = 180;
const MS_PER_DAY = 86_400_000;

export interface OutcomeRecord {
  skill: Skill;
  /** AI check passed on the first submission. */
  firstPass: boolean;
  /** Milestone eventually verified and released. */
  verified: boolean;
  onTime: boolean;
  /** 1–5 stars from the client, or null when not rated. */
  stars: number | null;
  completedAt: Date;
  /** Open disputes count only once they close. */
  disputeOpen?: boolean;
  /** Self-dealing (same person on both sides) earns nothing. */
  selfDealt?: boolean;
}

/** Possibly decay-weighted counts. */
export interface ReputationStats {
  attempts: number;
  firstPass: number;
  onTime: number;
  /** Mean stars over rated milestones, or null when none are rated. */
  avgStars: number | null;
  /** Unweighted count of verified milestones, used for tier gates. */
  verified: number;
}

export interface VrsBreakdown {
  fpr: number;
  otr: number;
  rating: number;
  volume: number;
  score: number;
  vrs: number;
}

export function decayWeight(completedAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - completedAt.getTime()) / MS_PER_DAY);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

export function statsFromOutcomes(outcomes: readonly OutcomeRecord[], skill: Skill, now: Date): ReputationStats {
  let attempts = 0;
  let firstPass = 0;
  let onTime = 0;
  let starWeight = 0;
  let starSum = 0;
  let verified = 0;
  for (const o of outcomes) {
    if (o.skill !== skill || o.disputeOpen || o.selfDealt) continue;
    const w = decayWeight(o.completedAt, now);
    attempts += w;
    if (o.firstPass) firstPass += w;
    if (o.onTime) onTime += w;
    if (o.verified) verified += 1;
    if (o.stars !== null) {
      if (!(o.stars >= 1 && o.stars <= 5)) throw new RangeError(`Stars must be 1–5, got ${o.stars}`);
      starWeight += w;
      starSum += w * o.stars;
    }
  }
  return { attempts, firstPass, onTime, avgStars: starWeight > 0 ? starSum / starWeight : null, verified };
}

export function vrsFromStats(stats: ReputationStats): VrsBreakdown {
  // Bayesian smoothing: two lucky jobs read as 67%, not 100%.
  const fpr = (stats.firstPass + 2) / (stats.attempts + 4);
  const otr = (stats.onTime + 2) / (stats.attempts + 4);
  const rating = stats.avgStars === null ? 0.5 : (stats.avgStars - 1) / 4;
  const volume = Math.min(1, Math.log(1 + stats.attempts) / Math.log(31));
  const score = 100 * (0.35 * fpr + 0.25 * otr + 0.2 * rating + 0.2 * volume);
  return { fpr, otr, rating, volume, score, vrs: Math.round(score) };
}

export function tierFor(vrs: number, verifiedMilestones: number): Tier {
  const tier = TIERS.find((t) => vrs >= t.minVrs && verifiedMilestones >= t.minVerified);
  // TIERS ends with New (0, 0), so a match always exists.
  return tier ?? TIERS[TIERS.length - 1];
}

export function reputationFor(outcomes: readonly OutcomeRecord[], skill: Skill, now: Date) {
  const stats = statsFromOutcomes(outcomes, skill, now);
  const breakdown = vrsFromStats(stats);
  return { stats, ...breakdown, tier: tierFor(breakdown.vrs, stats.verified) };
}

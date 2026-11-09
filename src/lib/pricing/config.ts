import type { CurrencyCode, Minor } from "@/lib/money";

/** Platform-wide pricing constants. Changing one changes every new quote, never a signed one. */
export const PRICING = {
  currency: "INR" as CurrencyCode,
  platformFeeRate: 0.05,
  firstPassBonusRate: 0.05,
  /** Normal pace used to decide whether a deadline is urgent. */
  productiveHoursPerDay: 4,
  /** Anything needing more than this per day is rejected as infeasible. */
  maxHoursPerDay: 10,
  urgencyStep: 0.1,
  urgencyStepFraction: 0.25,
  urgencyCap: 1.3,
  /** Brief is too vague when total pessimistic hours exceed this multiple of total optimistic hours. */
  vagueRatio: 2.5,
  floorRateMinorPerHour: 300_00,
  taskValueStepMinor: 50_00,
  priceStepMinor: 1_00,
  minMilestoneMinor: 1_000_00,
  maxMilestonesPerContract: 8,
  /** PayPal authorizations last 29 days; 25 leaves room for review and release. */
  maxMilestoneDays: 25,
  negotiationMaxRounds: 2,
} as const;

export const SKILLS = ["web_dev", "ui_design", "video_editing"] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  web_dev: "web dev",
  ui_design: "UI design",
  video_editing: "video editing",
};

/** Platform benchmark rate per skill, the same for everyone (minor units per hour). */
export const SKILL_BASE_RATE_MINOR: Record<Skill, Minor> = {
  web_dev: 500_00,
  ui_design: 450_00,
  video_editing: 400_00,
};

export const COMPLEXITY_TAGS = ["standard", "data_or_auth", "integrations", "legacy_code"] as const;
export type ComplexityTag = (typeof COMPLEXITY_TAGS)[number];

export const COMPLEXITY: Record<ComplexityTag, { multiplier: number; label: string }> = {
  standard: { multiplier: 1.0, label: "standard" },
  data_or_auth: { multiplier: 1.15, label: "data or auth" },
  integrations: { multiplier: 1.2, label: "integration" },
  legacy_code: { multiplier: 1.3, label: "unclear legacy code" },
};

export interface Tier {
  name: "New" | "Rising" | "Proven" | "Expert";
  minVrs: number;
  minVerified: number;
  premium: number;
}

/** Highest first, so the first match wins. */
export const TIERS: readonly Tier[] = [
  { name: "Expert", minVrs: 80, minVerified: 15, premium: 0.3 },
  { name: "Proven", minVrs: 65, minVerified: 5, premium: 0.2 },
  { name: "Rising", minVrs: 40, minVerified: 2, premium: 0.1 },
  { name: "New", minVrs: 0, minVerified: 0, premium: 0 },
];

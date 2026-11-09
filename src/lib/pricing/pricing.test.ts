import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";
import {
  PricingError,
  allocateSplit,
  buildReceipt,
  complexityFor,
  fairBand,
  firstPassBonusMinor,
  pertHours,
  priceContract,
  receiptText,
  reputationFor,
  taskValue,
  tierFor,
  urgencyFor,
  vrsFromStats,
  type MilestoneInput,
  type OutcomeRecord,
} from "./index";

/** The dance studio worked example from the build brief. */
const danceStudio: MilestoneInput[] = [
  { key: "design", title: "Design and layout", skill: "web_dev", estimate: { optimistic: 6, likely: 8, pessimistic: 14 }, complexityTags: ["standard"], durationDays: 4 },
  { key: "booking", title: "Booking system", skill: "web_dev", estimate: { optimistic: 8, likely: 12, pessimistic: 20 }, complexityTags: ["integrations"], durationDays: 5 },
  { key: "gallery", title: "Gallery", skill: "web_dev", estimate: { optimistic: 3, likely: 4, pessimistic: 7 }, complexityTags: ["standard"], durationDays: 2 },
  { key: "deploy", title: "Deploy and SEO", skill: "web_dev", estimate: { optimistic: 2, likely: 3, pessimistic: 6 }, complexityTags: ["standard"], durationDays: 2 },
];

const ravi = { vrs: 66, verifiedMilestones: 2 };
const meera = { vrs: 86, verifiedMilestones: 18 };

function priced(input: Parameters<typeof priceContract>[0]) {
  const quote = priceContract(input);
  if (quote.status !== "priced") throw new Error(`expected priced, got ${quote.status}`);
  return quote;
}

describe("worked example: dance studio website", () => {
  it("prices the work the same for everyone: ₹15,750 base over 29 hours at urgency 1.0", () => {
    const q = priced({ milestones: danceStudio, availableDays: 14, freelancer: null });
    expect(q.expectedHours).toBeCloseTo(29.0, 6);
    expect(q.urgency.multiplier).toBe(1);
    expect(q.milestones.map((m) => m.taskValueMinor)).toEqual([4_350_00, 7_600_00, 2_150_00, 1_650_00]);
    expect(q.baseSubtotalMinor).toBe(15_750_00);
    expect(q.tier.name).toBe("New");
    expect(q.subtotalMinor).toBe(15_750_00);
  });

  it("Ravi (VRS 66, 2 verified) is Rising, not Proven, and costs ₹17,325", () => {
    const q = priced({ milestones: danceStudio, availableDays: 14, freelancer: ravi });
    expect(q.tier.name).toBe("Rising");
    expect(q.subtotalMinor).toBe(17_325_00);
    expect(q.baseSubtotalMinor).toBe(15_750_00);
    // Platform fee is 5% on top, shown separately.
    expect(q.feeMinor).toBe(866_25);
    expect(q.totalMinor).toBe(18_191_25);
  });

  it("Meera (VRS 86, Expert) costs ₹20,475 for the same work", () => {
    const q = priced({ milestones: danceStudio, availableDays: 14, freelancer: meera });
    expect(q.tier.name).toBe("Expert");
    expect(q.subtotalMinor).toBe(20_475_00);
  });

  it("prints the booking system receipt from the brief", () => {
    const q = priced({ milestones: danceStudio, availableDays: 14, freelancer: ravi });
    const booking = q.milestones[1];
    expect(booking.priceMinor).toBe(8_360_00);
    expect(booking.fairBand).toEqual({ lowMinor: 4_800_00, highMinor: 12_000_00 });
    const text = receiptText(buildReceipt(booking, q.tier, ravi));
    expect(text).toContain("Booking system — ₹8,360");
    expect(text).toContain("12.67 hrs (PERT 8/12/20) × 1.2 (integration) × ₹500/hr = ₹7,600");
    expect(text).toContain("× 1.10 Rising tier (VRS 66, 2 verified milestones) = ₹8,360");
    expect(text).toContain("Fair band: ₹4,800 – ₹12,000");
  });
});

describe("formulas", () => {
  it("PERT: E = (O + 4M + P) / 6", () => {
    expect(pertHours({ optimistic: 8, likely: 12, pessimistic: 20 })).toBeCloseTo(12.6667, 4);
  });

  it("complexity uses the highest tag, never the product", () => {
    expect(complexityFor(["data_or_auth", "integrations"]).multiplier).toBe(1.2);
    expect(complexityFor([]).multiplier).toBe(1);
  });

  it("urgency adds 0.10 per full 25% compression", () => {
    expect(urgencyFor(29, 14)).toMatchObject({ feasible: true, multiplier: 1 });
    expect(urgencyFor(29, 5)).toMatchObject({ feasible: true, multiplier: 1.1 }); // 31% faster
    expect(urgencyFor(40, 5)).toMatchObject({ feasible: true, multiplier: 1.2 }); // 50% faster
  });

  it("first-pass bonus is 5% of the milestone price", () => {
    expect(firstPassBonusMinor(8_360_00)).toBe(418_00);
  });
});

describe("edge cases (brief table)", () => {
  it("AI estimate range too wide: blocks pricing and asks questions", () => {
    const vague: MilestoneInput[] = [
      { key: "a", title: "Mystery app", skill: "web_dev", estimate: { optimistic: 4, likely: 20, pessimistic: 60 }, complexityTags: [], durationDays: 10 },
    ];
    const q = priceContract({ milestones: vague, availableDays: 30, freelancer: null });
    expect(q.status).toBe("needs_info");
  });

  it("one wide small milestone does not block a well-specified brief (judged on totals)", () => {
    // Deploy and SEO alone is 2/3/6 (P = 3×O), but the brief overall is 19/47 ≈ 2.47.
    expect(priceContract({ milestones: danceStudio, availableDays: 14, freelancer: null }).status).toBe("priced");
  });

  it("Malformed AI output: impossible estimates are rejected before any money math", () => {
    const bad = [{ ...danceStudio[0], estimate: { optimistic: 10, likely: 5, pessimistic: 20 } }];
    expect(() => priceContract({ milestones: bad, availableDays: 14, freelancer: null })).toThrow(PricingError);
    const negative = [{ ...danceStudio[0], estimate: { optimistic: -1, likely: 5, pessimistic: 20 } }];
    expect(() => priceContract({ milestones: negative, availableDays: 14, freelancer: null })).toThrow(/positive/);
  });

  it("Deadline in the past, or too short: rejected with the earliest workable length", () => {
    expect(priceContract({ milestones: danceStudio, availableDays: 0, freelancer: null })).toMatchObject({
      status: "infeasible",
      reason: "deadline_passed",
    });
    expect(priceContract({ milestones: danceStudio, availableDays: 2, freelancer: null })).toMatchObject({
      status: "infeasible",
      reason: "too_short",
      earliestDays: 3,
    });
  });

  it("Tiny or huge projects: minimum milestone value, and at most 8 milestones", () => {
    const tiny: MilestoneInput[] = [
      { key: "fix", title: "Fix a typo", skill: "web_dev", estimate: { optimistic: 0.25, likely: 0.5, pessimistic: 0.5 }, complexityTags: [], durationDays: 1 },
    ];
    const q = priced({ milestones: tiny, availableDays: 3, freelancer: null });
    expect(q.milestones[0].minimumApplied).toBe(true);
    expect(q.milestones[0].priceMinor).toBe(1_000_00);

    const huge = Array.from({ length: 9 }, (_, i) => ({ ...danceStudio[2], key: `m${i}` }));
    expect(() => priceContract({ milestones: huge, availableDays: 60, freelancer: null })).toThrow(/split the project/);
  });

  it("Milestone runs longer than an authorization can hold: capped at 25 days", () => {
    const long = [{ ...danceStudio[0], durationDays: 30 }];
    expect(() => priceContract({ milestones: long, availableDays: 60, freelancer: null })).toThrowError(
      expect.objectContaining({ code: "milestone_too_long" }),
    );
  });

  it("Skill missing from the base-rate table: asks for a manual rate", () => {
    expect(() =>
      priceContract({ milestones: danceStudio, availableDays: 14, freelancer: null }, { baseRates: { ui_design: 450_00 } }),
    ).toThrowError(expect.objectContaining({ code: "rate_needed" }));
  });

  it("hourly floor applies whatever the AI estimates", () => {
    const v = taskValue(10, 1, 200_00); // ₹200/hr benchmark is below the ₹300/hr floor
    expect(v).toEqual({ valueMinor: 3_000_00, floorApplied: true });
  });

  it("Budget below fair price: offers options, never lowers the price", () => {
    const q = priced({ milestones: danceStudio, availableDays: 14, freelancer: meera, budgetMinor: 15_000_00 });
    expect(q.subtotalMinor).toBe(20_475_00);
    expect(q.budget).toMatchObject({ withinBudget: false, options: ["cut_scope", "newer_freelancer"] });
  });

  it("Rounding: milestone prices always add up to the subtotal exactly", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let run = 0; run < 200; run++) {
      const n = 1 + Math.floor(rand() * 6);
      const milestones: MilestoneInput[] = Array.from({ length: n }, (_, i) => {
        const o = 1 + rand() * 10;
        const m = o + rand() * 5;
        return {
          key: `m${i}`,
          title: `M${i}`,
          skill: (["web_dev", "ui_design", "video_editing"] as const)[i % 3],
          estimate: { optimistic: o, likely: m, pessimistic: m + rand() * 5 },
          complexityTags: [(["standard", "data_or_auth", "integrations", "legacy_code"] as const)[i % 4]],
          durationDays: 5,
        };
      });
      const q = priceContract({ milestones, availableDays: 1 + Math.floor(rand() * 40), freelancer: ravi });
      if (q.status !== "priced") continue;
      const sum = q.milestones.reduce((a, m) => a + m.priceMinor, 0);
      expect(sum).toBe(q.subtotalMinor);
      expect(q.totalMinor).toBe(q.subtotalMinor + q.feeMinor);
      for (const m of q.milestones) expect(Number.isSafeInteger(m.priceMinor)).toBe(true);
    }
  });

  it("negotiation band runs from optimistic to pessimistic hours", () => {
    expect(fairBand({ optimistic: 8, likely: 12, pessimistic: 20 }, 1.2, 500_00)).toEqual({
      lowMinor: 4_800_00,
      highMinor: 12_000_00,
    });
  });
});

describe("Verified Reputation Score", () => {
  it("Ravi: 2 attempts, 2 first-pass, 2 on time, 5 stars → VRS 66", () => {
    expect(vrsFromStats({ attempts: 2, firstPass: 2, onTime: 2, avgStars: 5, verified: 2 }).vrs).toBe(66);
  });

  it("Meera: 18 attempts, 17 first-pass, 16 on time, 4.7 stars → VRS 86", () => {
    expect(vrsFromStats({ attempts: 18, firstPass: 17, onTime: 16, avgStars: 4.7, verified: 18 }).vrs).toBe(86);
  });

  it("tiers need both the score and enough verified milestones", () => {
    expect(tierFor(66, 2).name).toBe("Rising");
    expect(tierFor(66, 5).name).toBe("Proven");
    expect(tierFor(86, 15).name).toBe("Expert");
    expect(tierFor(86, 14).name).toBe("Proven");
    expect(tierFor(39, 40).name).toBe("New");
  });

  it("old work fades with a 180-day half-life", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    const outcome = (daysAgo: number, firstPass: boolean): OutcomeRecord => ({
      skill: "web_dev",
      firstPass,
      verified: true,
      onTime: true,
      stars: 5,
      completedAt: new Date(now.getTime() - daysAgo * 86_400_000),
    });
    const recentFailures = [outcome(10, false), outcome(10, false), outcome(720, true), outcome(720, true)];
    const r = reputationFor(recentFailures, "web_dev", now);
    expect(r.stats.attempts).toBeCloseTo(2 * 0.5 ** (10 / 180) + 2 * 0.5 ** 4, 6);
    expect(r.stats.verified).toBe(4);
  });

  it("Client and freelancer are the same person: such work earns no VRS", () => {
    const now = new Date();
    const r = reputationFor(
      [{ skill: "web_dev", firstPass: true, verified: true, onTime: true, stars: 5, completedAt: now, selfDealt: true }],
      "web_dev",
      now,
    );
    expect(r.stats.attempts).toBe(0);
    expect(r.tier.name).toBe("New");
  });

  it("Milestone under dispute: counts only after the dispute closes", () => {
    const now = new Date();
    const r = reputationFor(
      [{ skill: "web_dev", firstPass: true, verified: true, onTime: true, stars: 5, completedAt: now, disputeOpen: true }],
      "web_dev",
      now,
    );
    expect(r.stats.verified).toBe(0);
  });
});

describe("collaborator splits", () => {
  it("Collaborator splits don't add up: rejected unless they total 100%", () => {
    expect(() => allocateSplit(1000, [{ payeeId: "a", bps: 6000, lead: true }, { payeeId: "b", bps: 3000 }])).toThrow(/100%/);
    expect(() => allocateSplit(1000, [{ payeeId: "a", bps: 5000 }, { payeeId: "b", bps: 5000 }])).toThrow(/lead/);
  });

  it("parts add up exactly, remainder to the lead freelancer", () => {
    const parts = allocateSplit(8_360_01, [
      { payeeId: "dev", bps: 7000, lead: true },
      { payeeId: "designer", bps: 3000 },
    ]);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(8_360_01);
    expect(parts[1].amountMinor).toBe(2_508_00);
    expect(parts[0].amountMinor).toBe(5_852_01);
  });
});

describe("money formatting", () => {
  it("formats rupees Indian-style", () => {
    expect(formatMoney(15_750_00)).toBe("₹15,750");
    expect(formatMoney(18_191_25)).toBe("₹18,191.25");
  });
});

import { z } from "zod";
import { COMPLEXITY_TAGS, PRICING, SKILLS } from "@/lib/pricing/config";

/**
 * What Claude returns (structured output). Kept flat and permissive so the JSON schema
 * stays within what structured outputs support; `toScopeResult` applies the real rules.
 */
export const AiScopeOutput = z.object({
  status: z.enum(["scoped", "needs_info", "refused"]),
  projectTitle: z.string(),
  summary: z.string(),
  questions: z.array(z.string()),
  refusalReason: z.string(),
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      skill: z.enum(SKILLS),
      complexityTags: z.array(z.enum(COMPLEXITY_TAGS)),
      complexityReason: z.string(),
      estimate: z.object({
        optimistic: z.number(),
        likely: z.number(),
        pessimistic: z.number(),
        reasoning: z.string(),
      }),
      durationDays: z.number(),
      criteria: z.array(
        z.object({
          text: z.string(),
          method: z.enum(["browser", "file", "client_judged"]),
        }),
      ),
    }),
  ),
});
export type AiScopeOutput = z.infer<typeof AiScopeOutput>;

const Estimate = z
  .object({
    optimistic: z.number().positive().max(400),
    likely: z.number().positive().max(400),
    pessimistic: z.number().positive().max(400),
    reasoning: z.string().min(1),
  })
  .refine((e) => e.optimistic <= e.likely && e.likely <= e.pessimistic, {
    message: "estimates must satisfy optimistic ≤ likely ≤ pessimistic",
  });

export const MilestoneDraft = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(600),
  skill: z.enum(SKILLS),
  complexityTags: z.array(z.enum(COMPLEXITY_TAGS)),
  complexityReason: z.string(),
  estimate: Estimate,
  durationDays: z.number().int().min(1).max(PRICING.maxMilestoneDays),
  criteria: z
    .array(z.object({ text: z.string().trim().min(1).max(300), method: z.enum(["browser", "file", "client_judged"]) }))
    .min(1)
    .max(8),
});
export type MilestoneDraft = z.infer<typeof MilestoneDraft>;

export type ScopeResult =
  | { status: "scoped"; projectTitle: string; summary: string; milestones: MilestoneDraft[] }
  | { status: "needs_info"; questions: string[] }
  | { status: "refused"; reason: string }
  /** AI output could not be validated twice: a person prices it by hand; no money moves on it. */
  | { status: "manual_quote"; reason: string };

/** Apply the domain rules to Claude's output. Returns issues instead of throwing. */
export function toScopeResult(out: AiScopeOutput): { ok: true; result: ScopeResult } | { ok: false; issues: string[] } {
  if (out.status === "refused") {
    return { ok: true, result: { status: "refused", reason: out.refusalReason.trim() || "This work can't be scoped here." } };
  }
  if (out.status === "needs_info") {
    const questions = out.questions.map((q) => q.trim()).filter(Boolean).slice(0, 5);
    return {
      ok: true,
      result: { status: "needs_info", questions: questions.length ? questions : ["Can you describe what you need in more detail?"] },
    };
  }
  const parsed = z
    .array(MilestoneDraft)
    .min(1)
    .max(PRICING.maxMilestonesPerContract)
    .safeParse(out.milestones);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return {
    ok: true,
    result: {
      status: "scoped",
      projectTitle: out.projectTitle.trim() || "Untitled project",
      summary: out.summary.trim(),
      milestones: parsed.data,
    },
  };
}

import { formatMoney, type Minor } from "@/lib/money";
import { PRICING } from "@/lib/pricing/config";
import type { Receipt, ReceiptLine } from "@/lib/pricing/receipt";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import { harnessModels, type AgentModel } from "./catalog";

/**
 * Prices an AI agent's work from the models it runs on, not from hours.
 *
 * The agent works a milestone on an escalation ladder: the cheapest model tries first; if the
 * checker fails its delivery, the next (pricier) model tries, up to three. The client pays one
 * fixed price, and only for a delivery that passes; the agent's owner absorbs failed attempts.
 * Pure: the same functions run on the server (to lock the price) and in the browser (to preview it).
 */

/** How the harness's token use is estimated. Every number here appears on the receipt. */
export const HARNESS = {
  /** BuildBot's instructions and output format */
  systemTokens: 900,
  tokensPerCriterion: 40,
  /** Earlier milestones' files are sent back so the agent keeps them working */
  carryTokensPerEarlierMilestone: 2_500,
  maxCarryTokens: 15_000,
  /** Output size scales with the size of the work: tokens written per expected hour of a person's work */
  outputTokensPerHour: 1_500,
  minOutputTokens: 2_000,
  maxOutputTokens: 32_000,
  /** Reasoning models are billed for their thinking as output */
  reasoningOutputMultiplier: 1.5,
} as const;

export const LADDER = {
  maxRungs: 3,
  /** Assumed chance each rung's delivery passes the checker, until measured runs replace it */
  passRates: [0.6, 0.8, 0.9] as const,
  /** What the agent's owner earns for running it and carrying failed attempts */
  ownerMargin: 0.3,
  /** PayPal's fees make smaller payments impractical */
  minMilestoneMinor: 100_00 as Minor,
  /** Default ladder draws on these providers' recent models */
  providers: ["anthropic", "openai", "google", "deepseek", "qwen", "mistralai", "meta-llama", "x-ai", "moonshotai", "z-ai"],
  recentDays: 540,
} as const;

export interface Tokens {
  input: number;
  output: number;
}

export interface LadderRung {
  modelId: string;
  name: string;
  provider: string;
  passRate: number;
}

/** What a milestone's agent price was built from; stored with the milestone when the contract is signed. */
export interface AgentPlan {
  ladder: LadderRung[];
  tokens: Tokens;
  rungCostsUsd: number[];
  expectedUsd: number;
  worstUsd: number;
  inrPerUsd: number;
}

export interface AgentMilestoneQuote {
  title: string;
  plan: AgentPlan;
  priceMinor: Minor;
  feeMinor: Minor;
  /** A person's base pay for the same milestone, for comparison */
  humanPriceMinor: Minor | null;
  receipt: Receipt;
}

export interface AgentQuote {
  ladder: LadderRung[];
  milestones: AgentMilestoneQuote[];
  subtotalMinor: Minor;
  feeMinor: Minor;
  totalMinor: Minor;
  expectedUsd: number;
  worstUsd: number;
}

export class AgentPricingError extends Error {}

export function expectedHours(e: MilestoneDraft["estimate"]): number {
  return (e.optimistic + 4 * e.likely + e.pessimistic) / 6;
}

/** Tokens one attempt at a milestone is expected to use. `position` is the milestone's index (0-based). */
export function milestoneTokens(draft: MilestoneDraft, position: number): Tokens {
  const spec = Math.ceil((draft.title.length + draft.description.length) / 4) + HARNESS.tokensPerCriterion * draft.criteria.length;
  const carry = Math.min(HARNESS.maxCarryTokens, HARNESS.carryTokensPerEarlierMilestone * position);
  const output = Math.round(HARNESS.outputTokensPerHour * expectedHours(draft.estimate));
  return {
    input: HARNESS.systemTokens + spec + carry,
    output: Math.min(HARNESS.maxOutputTokens, Math.max(HARNESS.minOutputTokens, output)),
  };
}

/** USD for one attempt by one model. */
export function attemptCostUsd(model: AgentModel, tokens: Tokens): number {
  const out = tokens.output * (model.reasoning ? HARNESS.reasoningOutputMultiplier : 1);
  return tokens.input * model.promptUsd + out * model.completionUsd;
}

/** USD for one attempt at every milestone: what the model would cost for the whole project. */
export function projectCostUsd(model: AgentModel, drafts: readonly MilestoneDraft[]): number {
  return drafts.reduce((sum, d, i) => sum + attemptCostUsd(model, milestoneTokens(d, i)), 0);
}

/** Can the model write the biggest milestone's output in one reply? */
export function fitsOutput(model: AgentModel, drafts: readonly MilestoneDraft[]): boolean {
  const need = Math.max(...drafts.map((d, i) => milestoneTokens(d, i).output));
  return model.maxOutput === null || model.maxOutput >= need;
}

/**
 * The default ladder: from recent, paid, harness-capable models of major providers, ranked by what
 * they'd cost for this project, take the cheapest, the median and the 90th percentile, each from a
 * different provider. Free models are left out (rate-limited, can vanish mid-job), and so are
 * special variants such as ":free" or ":online", which the client can still pick by hand.
 */
export function defaultLadder(models: readonly AgentModel[], drafts: readonly MilestoneDraft[], now = Date.now()): AgentModel[] {
  const since = now / 1000 - LADDER.recentDays * 86_400;
  const pool = harnessModels(models)
    .filter((m) => (LADDER.providers as readonly string[]).includes(m.provider) && !m.id.includes(":") && m.completionUsd > 0 && m.created >= since && fitsOutput(m, drafts))
    .map((m) => ({ m, cost: projectCostUsd(m, drafts) }))
    .sort((a, b) => a.cost - b.cost || a.m.id.localeCompare(b.m.id));
  if (pool.length === 0) return [];
  const picks: AgentModel[] = [];
  for (const q of [0, 0.5, 0.9]) {
    const target = Math.round(q * (pool.length - 1));
    // Nearest model to the target rank whose provider isn't on the ladder yet.
    for (let d = 0; d < pool.length; d++) {
      const hit = [target + d, target - d].map((i) => pool[i]?.m).find((m) => m && !picks.some((p) => p.provider === m.provider || p.id === m.id));
      if (hit) {
        picks.push(hit);
        break;
      }
    }
  }
  return picks.sort((a, b) => projectCostUsd(a, drafts) - projectCostUsd(b, drafts));
}

/** Look up the client's chosen models (cheapest first). */
export function resolveLadder(models: readonly AgentModel[], ids: readonly string[], drafts: readonly MilestoneDraft[]): AgentModel[] {
  if (ids.length === 0 || ids.length > LADDER.maxRungs) throw new AgentPricingError(`Pick 1 to ${LADDER.maxRungs} models for the ladder`);
  if (new Set(ids).size !== ids.length) throw new AgentPricingError("Each model can be on the ladder once");
  const usable = harnessModels(models);
  const picked = ids.map((id) => {
    const m = usable.find((x) => x.id === id);
    if (!m) throw new AgentPricingError(`${id} isn't available to the agent (it needs structured output and a ${32}k+ context)`);
    return m;
  });
  return picked.sort((a, b) => projectCostUsd(a, drafts) - projectCostUsd(b, drafts));
}

/** Expected and worst-case USD for a ladder whose rungs cost `costs`. */
export function ladderCost(costs: readonly number[]): { expectedUsd: number; worstUsd: number } {
  let reach = 1;
  let expectedUsd = 0;
  costs.forEach((c, i) => {
    expectedUsd += reach * c;
    reach *= 1 - (LADDER.passRates[i] ?? LADDER.passRates[LADDER.passRates.length - 1]);
  });
  return { expectedUsd, worstUsd: costs.reduce((a, c) => a + c, 0) };
}

/** "$0.0046", "$0.235", "$1.73": enough digits to tell cheap models apart. */
export const formatUsd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toPrecision(2)}` : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const usd = formatUsd;
const inr = (minorExact: number) => (minorExact > 0 && minorExact < 1 ? "under ₹0.01" : formatMoney(Math.round(minorExact)));
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Price every milestone for an agent on this ladder, with a receipt for each. */
export function quoteAgent(opts: {
  ladder: readonly AgentModel[];
  drafts: readonly MilestoneDraft[];
  inrPerUsd: number;
  ownerName: string;
  humanPricesMinor?: readonly Minor[];
}): AgentQuote {
  const { drafts, inrPerUsd, ownerName } = opts;
  const ladder = opts.ladder.slice(0, LADDER.maxRungs);
  if (ladder.length === 0) throw new AgentPricingError("No model is available for the agent right now");
  if (!(inrPerUsd > 0)) throw new AgentPricingError("Exchange rate must be positive");
  const rungs: LadderRung[] = ladder.map((m, i) => ({ modelId: m.id, name: m.name, provider: m.provider, passRate: LADDER.passRates[i] }));
  const toMinor = (u: number) => u * inrPerUsd * 100;

  const milestones = drafts.map((d, i): AgentMilestoneQuote => {
    const tokens = milestoneTokens(d, i);
    const rungCostsUsd = ladder.map((m) => attemptCostUsd(m, tokens));
    const { expectedUsd, worstUsd } = ladderCost(rungCostsUsd);
    const withMargin = toMinor(expectedUsd) * (1 + LADDER.ownerMargin);
    const rounded = Math.ceil(withMargin / 100) * 100;
    const priceMinor = Math.max(LADDER.minMilestoneMinor, rounded);
    const feeMinor = Math.round(priceMinor * PRICING.platformFeeRate);
    const human = opts.humanPricesMinor?.[i] ?? null;

    const lines: ReceiptLine[] = [
      { text: `Estimated tokens per attempt: ${k(tokens.input)} in, ${k(tokens.output)} out (${expectedHours(d.estimate).toFixed(1)} expected hours of a person's work × ${k(HARNESS.outputTokensPerHour)} tokens/hour)`, amountMinor: null },
    ];
    let reach = 1;
    ladder.forEach((m, r) => {
      const when = r === 0 ? "tries first" : `tries only if rung ${r} fails (assumed ${pct(reach)} of the time)`;
      lines.push({ text: `Rung ${r + 1} · ${m.name} ${when}: ${usd(rungCostsUsd[r])} = ${inr(toMinor(rungCostsUsd[r]))}${m.reasoning ? " (reasoning billed as output)" : ""}`, amountMinor: null });
      reach *= 1 - (LADDER.passRates[r] ?? 0);
    });
    lines.push({ text: `Expected model cost ${usd(expectedUsd)} at ₹${inrPerUsd}/$`, amountMinor: Math.round(toMinor(expectedUsd)) });
    lines.push({ text: `+ ${pct(LADDER.ownerMargin)} for ${ownerName}, who runs the agent and pays for failed attempts`, amountMinor: Math.round(withMargin) });
    if (priceMinor > rounded) lines.push({ text: `Minimum per milestone, because PayPal's fees make smaller payments impractical`, amountMinor: priceMinor });
    lines.push({ text: `Worst case, every rung runs: ${usd(worstUsd)} = ${inr(toMinor(worstUsd))}. The owner covers anything above the price.`, amountMinor: null });

    return {
      title: d.title,
      plan: { ladder: rungs, tokens, rungCostsUsd, expectedUsd, worstUsd, inrPerUsd },
      priceMinor,
      feeMinor,
      humanPriceMinor: human,
      receipt: {
        title: `${d.title} — ${formatMoney(priceMinor)}`,
        priceMinor,
        lines,
        fairBand: human !== null ? `Priced by model cost. A person's base pay for this milestone is ${formatMoney(human)}.` : "Priced by model cost.",
      },
    };
  });

  const subtotalMinor = milestones.reduce((a, m) => a + m.priceMinor, 0);
  const feeMinor = milestones.reduce((a, m) => a + m.feeMinor, 0);
  return {
    ladder: rungs,
    milestones,
    subtotalMinor,
    feeMinor,
    totalMinor: subtotalMinor + feeMinor,
    expectedUsd: milestones.reduce((a, m) => a + m.plan.expectedUsd, 0),
    worstUsd: milestones.reduce((a, m) => a + m.plan.worstUsd, 0),
  };
}

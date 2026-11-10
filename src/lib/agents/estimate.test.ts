import { describe, expect, it } from "vitest";
import { mockScope } from "@/lib/ai/mock-scoping";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import { harnessModels, parseOpenRouterModels, type AgentModel } from "./catalog";
import { AgentPricingError, LADDER, attemptCostUsd, defaultLadder, ladderCost, milestoneTokens, quoteAgent, resolveLadder } from "./estimate";
import snapshot from "./openrouter-snapshot.json";

const scope = mockScope("Website for my dance studio: home, classes and contact pages, booking with a PayPal deposit, a gallery, live on our domain.");
if (scope.status !== "scoped") throw new Error("demo scope expected");
const drafts: MilestoneDraft[] = scope.milestones;

const model = (over: Partial<AgentModel>): AgentModel => ({
  id: "acme/model",
  name: "Acme Model",
  provider: "acme",
  promptUsd: 1e-6,
  completionUsd: 2e-6,
  contextLength: 128_000,
  maxOutput: null,
  reasoning: false,
  structured: true,
  created: 1_790_000_000,
  ...over,
});

describe("OpenRouter catalog", () => {
  it("parses the saved snapshot and drops models the agent can't be priced or run on", () => {
    const all = parseOpenRouterModels(snapshot);
    expect(all.length).toBeGreaterThan(300);
    // Every kept model has a fixed, non-negative price per token and text output.
    for (const m of all) {
      expect(m.promptUsd).toBeGreaterThanOrEqual(0);
      expect(m.completionUsd).toBeGreaterThanOrEqual(0);
    }
    expect(harnessModels(all).every((m) => m.structured && m.contextLength >= 32_000)).toBe(true);
  });

  it("skips variable-priced and non-text models", () => {
    const parsed = parseOpenRouterModels({
      data: [
        { id: "openrouter/auto", name: "Auto", pricing: { prompt: "-1", completion: "-1" } },
        { id: "img/gen", name: "Image", architecture: { input_modalities: ["text"], output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0" } },
        { id: "ok/model", name: "Ok", pricing: { prompt: "0.000001", completion: "0.000002" }, supported_parameters: ["structured_outputs"], context_length: 64000 },
      ],
    });
    expect(parsed.map((m) => m.id)).toEqual(["ok/model"]);
    expect(parsed[0]).toMatchObject({ provider: "ok", promptUsd: 1e-6, completionUsd: 2e-6, structured: true });
  });
});

describe("agent pricing", () => {
  it("estimates tokens from the size of the work, carrying earlier files forward", () => {
    const first = milestoneTokens(drafts[0], 0);
    const later = milestoneTokens(drafts[0], 2);
    expect(later.input - first.input).toBe(5_000);
    expect(first.output).toBeGreaterThanOrEqual(2_000);
  });

  it("bills reasoning models' thinking as output", () => {
    const t = { input: 1_000, output: 10_000 };
    expect(attemptCostUsd(model({ reasoning: true }), t)).toBeCloseTo(1_000 * 1e-6 + 15_000 * 2e-6);
  });

  it("expected cost only counts a rung when every rung below it has failed", () => {
    const { expectedUsd, worstUsd } = ladderCost([1, 10, 100]);
    expect(expectedUsd).toBeCloseTo(1 + 0.4 * 10 + 0.4 * 0.2 * 100);
    expect(worstUsd).toBe(111);
  });

  it("charges the floor when the models cost almost nothing, and says so on the receipt", () => {
    const q = quoteAgent({ ladder: [model({ promptUsd: 1e-9, completionUsd: 1e-9 })], drafts, inrPerUsd: 84, ownerName: "Ravi" });
    expect(q.milestones.every((m) => m.priceMinor === LADDER.minMilestoneMinor)).toBe(true);
    expect(q.milestones[0].receipt.lines.some((l) => l.text.startsWith("Minimum per milestone"))).toBe(true);
    expect(q.totalMinor).toBe(q.subtotalMinor + q.feeMinor);
  });

  it("prices above the floor from the expected model cost plus the owner's margin", () => {
    const pricey = model({ promptUsd: 3e-3, completionUsd: 6e-3 });
    const q = quoteAgent({ ladder: [pricey], drafts, inrPerUsd: 84, ownerName: "Ravi", humanPricesMinor: [4_350_00] });
    const m = q.milestones[0];
    const expectedMinor = attemptCostUsd(pricey, milestoneTokens(drafts[0], 0)) * 84 * 100;
    expect(m.priceMinor).toBe(Math.ceil((expectedMinor * 1.3) / 100) * 100);
    expect(m.receipt.fairBand).toContain("₹4,350");
  });

  it("builds a default ladder of up to three providers, cheapest first", () => {
    const all = parseOpenRouterModels(snapshot);
    const now = Date.parse((snapshot as { fetchedAt: string }).fetchedAt);
    const ladder = defaultLadder(all, drafts, now);
    expect(ladder.length).toBe(3);
    expect(new Set(ladder.map((m) => m.provider)).size).toBe(3);
    const costs = ladder.map((m) => quoteAgent({ ladder: [m], drafts, inrPerUsd: 84, ownerName: "x" }).expectedUsd);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it("rejects ladders the harness can't run", () => {
    const all = [model({ id: "a/one" }), model({ id: "b/two", structured: false })];
    expect(() => resolveLadder(all, ["b/two"], drafts)).toThrow(AgentPricingError);
    expect(() => resolveLadder(all, ["a/one", "a/one"], drafts)).toThrow(AgentPricingError);
    expect(() => resolveLadder(all, [], drafts)).toThrow(AgentPricingError);
    expect(resolveLadder(all, ["a/one"], drafts).map((m) => m.id)).toEqual(["a/one"]);
  });
});

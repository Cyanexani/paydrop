import { z } from "zod";

/**
 * The models an AI agent worker can run on, with their per-token prices, from OpenRouter's
 * public model list (https://openrouter.ai/api/v1/models). Pure: no network here.
 */
export interface AgentModel {
  /** OpenRouter model id, e.g. "anthropic/claude-sonnet-4.5" */
  id: string;
  name: string;
  /** The part of the id before the slash */
  provider: string;
  /** USD per input token */
  promptUsd: number;
  /** USD per output token */
  completionUsd: number;
  contextLength: number;
  maxOutput: number | null;
  /** Can think before answering (output may include reasoning tokens) */
  reasoning: boolean;
  /** Can be made to return JSON matching a schema, which the agent harness needs */
  structured: boolean;
  /** Unix seconds */
  created: number;
}

export interface Catalog {
  source: "live" | "snapshot";
  fetchedAt: string;
  models: AgentModel[];
}

const Price = z.union([z.string(), z.number()]).nullish();

const RawModel = z.object({
  id: z.string(),
  name: z.string().default(""),
  created: z.number().nullish(),
  context_length: z.number().nullish(),
  architecture: z.object({ input_modalities: z.array(z.string()).nullish(), output_modalities: z.array(z.string()).nullish() }).nullish(),
  pricing: z.object({ prompt: Price, completion: Price }).nullish(),
  top_provider: z.object({ max_completion_tokens: z.number().nullish() }).nullish(),
  supported_parameters: z.array(z.string()).nullish(),
});

/** Smallest context window the harness accepts: the spec, earlier files and the reply must fit. */
export const MIN_CONTEXT = 32_000;

/**
 * Parse OpenRouter's /models response. Keeps text-in, text-out models with a fixed price per token;
 * models priced per request or "variable" (a negative price, e.g. openrouter/auto) are dropped.
 */
export function parseOpenRouterModels(json: unknown): AgentModel[] {
  const data = (json as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: AgentModel[] = [];
  for (const item of data) {
    const r = RawModel.safeParse(item);
    if (!r.success) continue;
    const m = r.data;
    const inputs = m.architecture?.input_modalities ?? ["text"];
    const outputs = m.architecture?.output_modalities ?? ["text"];
    if (!inputs.includes("text") || outputs.length !== 1 || outputs[0] !== "text") continue;
    const promptUsd = Number(m.pricing?.prompt);
    const completionUsd = Number(m.pricing?.completion);
    if (!Number.isFinite(promptUsd) || !Number.isFinite(completionUsd) || promptUsd < 0 || completionUsd < 0) continue;
    const params = m.supported_parameters ?? [];
    out.push({
      id: m.id,
      name: m.name || m.id,
      // "~google/…" ids are OpenRouter aliases that follow the latest model; the provider is still "google".
      provider: (m.id.split("/")[0] ?? "").replace(/^~/, ""),
      promptUsd,
      completionUsd,
      contextLength: m.context_length ?? 0,
      maxOutput: m.top_provider?.max_completion_tokens ?? null,
      reasoning: params.includes("reasoning") || params.includes("include_reasoning"),
      structured: params.includes("structured_outputs") || params.includes("response_format"),
      created: m.created ?? 0,
    });
  }
  return out;
}

/** Models the agent harness can drive: structured output, enough context, and answering live
 * (":batch" endpoints queue the request for later, which an interactive harness can't wait for). */
export function harnessModels(models: readonly AgentModel[]): AgentModel[] {
  return models.filter((m) => m.structured && m.contextLength >= MIN_CONTEXT && !m.id.endsWith(":batch"));
}

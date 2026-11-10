import { harnessModels, parseOpenRouterModels, type Catalog } from "@/lib/agents/catalog";
import snapshot from "@/lib/agents/openrouter-snapshot.json";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const TTL_MS = 60 * 60 * 1000;
const g = globalThis as unknown as { __mpCatalog?: { at: number; catalog: Promise<Catalog> } };

function fromSnapshot(): Catalog {
  return { source: "snapshot", fetchedAt: (snapshot as { fetchedAt: string }).fetchedAt, models: harnessModels(parseOpenRouterModels(snapshot)) };
}

async function fetchLive(): Promise<Catalog> {
  // The model list is public: no API key needed to read prices.
  const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(6_000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter models: HTTP ${res.status}`);
  const models = harnessModels(parseOpenRouterModels(await res.json()));
  if (models.length < 20) throw new Error("OpenRouter models: unexpectedly short list");
  return { source: "live", fetchedAt: new Date().toISOString(), models };
}

/**
 * The models the agent can run on, with live OpenRouter prices, cached for an hour. Falls back to
 * the saved snapshot when OpenRouter can't be reached, and always uses it in tests
 * (AGENT_CATALOG=snapshot) so prices there never change under the tests.
 */
export function loadCatalog(now = Date.now()): Promise<Catalog> {
  if (process.env.AGENT_CATALOG === "snapshot" || process.env.VITEST) return Promise.resolve(fromSnapshot());
  const hit = g.__mpCatalog;
  if (hit && now - hit.at < TTL_MS) return hit.catalog;
  const catalog = fetchLive().catch((error: unknown) => {
    console.warn(`Agent catalog: using the saved snapshot (${error instanceof Error ? error.message : String(error)})`);
    // Retry the live list in a minute rather than an hour.
    g.__mpCatalog = { at: now - TTL_MS + 60_000, catalog: Promise.resolve(fromSnapshot()) };
    return fromSnapshot();
  });
  g.__mpCatalog = { at: now, catalog };
  return catalog;
}

/**
 * Elastic indexes every contract's milestones, criteria and change orders, so the scope-creep
 * detector and the dispute pack can find what a new request overlaps with. Without Elastic
 * configured, the same search runs locally over the contract's rows.
 */
import { Client } from "@elastic/elasticsearch";

export const SCOPE_INDEX = process.env.ELASTIC_INDEX ?? "milestonepay-scope";

export interface ScopeDoc {
  contractId: string;
  milestoneId: string;
  kind: "milestone" | "change_order" | "message";
  title: string;
  body: string;
}

export interface ScopeHit extends ScopeDoc {
  score: number;
}

let client: Client | null | undefined;
let semanticOk = true;

export function elastic(): Client | null {
  if (client !== undefined) return client;
  const node = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;
  client = node && apiKey ? new Client({ node, auth: { apiKey } }) : null;
  return client;
}

async function ensureIndex(es: Client) {
  if (await es.indices.exists({ index: SCOPE_INDEX })) return;
  const base = {
    contractId: { type: "keyword" as const },
    milestoneId: { type: "keyword" as const },
    kind: { type: "keyword" as const },
    title: { type: "text" as const, copy_to: ["semantic"] },
    body: { type: "text" as const, copy_to: ["semantic"] },
  };
  try {
    // semantic_text uses Elastic's default ELSER inference endpoint for meaning-based matches.
    await es.indices.create({ index: SCOPE_INDEX, mappings: { properties: { ...base, semantic: { type: "semantic_text" } } } });
  } catch {
    semanticOk = false;
    const plain = { ...base, title: { type: "text" as const }, body: { type: "text" as const } };
    await es.indices.create({ index: SCOPE_INDEX, mappings: { properties: plain } });
  }
}

export async function indexScopeDocs(docs: ScopeDoc[]): Promise<boolean> {
  const es = elastic();
  if (!es || docs.length === 0) return false;
  try {
    await ensureIndex(es);
    await es.bulk({
      refresh: "wait_for",
      operations: docs.flatMap((d) => [{ index: { _index: SCOPE_INDEX, _id: `${d.kind}:${d.milestoneId}` } }, d]),
    });
    return true;
  } catch (error) {
    console.error("Elastic indexing failed", error);
    return false;
  }
}

/** Hybrid search inside one contract: semantic + BM25 when available, BM25 otherwise. */
export async function searchScope(contractId: string, query: string, size = 5): Promise<ScopeHit[] | null> {
  const es = elastic();
  if (!es) return null;
  const filter = [{ term: { contractId } }];
  const bm25 = { multi_match: { query, fields: ["title^2", "body"] } };
  try {
    const res = await es.search<ScopeDoc>({
      index: SCOPE_INDEX,
      size,
      query: semanticOk
        ? { bool: { filter, should: [bm25, { semantic: { field: "semantic", query } }], minimum_should_match: 1 } }
        : { bool: { filter, must: [bm25] } },
    });
    return res.hits.hits.filter((h) => h._source).map((h) => ({ ...(h._source as ScopeDoc), score: h._score ?? 0 }));
  } catch (error) {
    if (semanticOk) {
      semanticOk = false;
      return searchScope(contractId, query, size);
    }
    console.error("Elastic search failed", error);
    return null;
  }
}

/** Local fallback: token-overlap scoring over the contract's own milestones. */
export function localScopeSearch(docs: ScopeDoc[], query: string, size = 5): ScopeHit[] {
  const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const q = tokens(query);
  return docs
    .map((d) => {
      const t = tokens(`${d.title} ${d.title} ${d.body}`);
      let overlap = 0;
      for (const w of q) if (t.has(w)) overlap += 1;
      return { ...d, score: q.size ? overlap / q.size : 0 };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, size);
}

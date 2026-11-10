"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import { AgentPricingError, formatUsd, projectCostUsd, quoteAgent, resolveLadder, type AgentQuote } from "@/lib/agents/estimate";
import { formatMoney } from "@/lib/money";
import type { AgentCatalogView, PricedCandidate } from "@/server/quotes";
import { GooBlock } from "./goo";

const AgentModelsGrid = dynamic(() => import("./grid/agent-models-grid"), { ssr: false, loading: () => <GooBlock label="Loading models" /> });

const RUNG_COLORS = ["var(--tone-paid)", "var(--tone-check)", "var(--tone-held)"];

/** Re-price the agent in the browser for the client's chosen ladder (the server re-checks at signing). */
export function useAgentQuote(catalog: AgentCatalogView, drafts: readonly MilestoneDraft[], ids: readonly string[], ownerName: string, humanPricesMinor: readonly number[]) {
  return useMemo((): { quote: AgentQuote | null; error: string | null } => {
    try {
      const ladder = resolveLadder(catalog.models, ids, drafts);
      return { quote: quoteAgent({ ladder, drafts, inrPerUsd: catalog.inrPerUsd, ownerName, humanPricesMinor }), error: null };
    } catch (error) {
      if (error instanceof AgentPricingError) return { quote: null, error: error.message };
      throw error;
    }
  }, [catalog, drafts, ids, ownerName, humanPricesMinor]);
}

/** BuildBot's card: priced by the models on its ladder, next to what a person earns for the same work. */
export function AgentCard({ pc, quote, error, humanBaseMinor, picking, onPick, offer }: {
  pc: PricedCandidate;
  quote: AgentQuote | null;
  error: string | null;
  humanBaseMinor: number;
  picking: boolean;
  onPick: () => void;
  offer: React.ReactNode;
}) {
  const { candidate } = pc;
  return (
    <article className={`rise flex flex-col gap-[18px] rounded-[28px] border bg-raised p-6 transition-colors duration-300 ${picking ? "border-magenta" : "border-line-soft hover:border-wine"}`}>
      <div className="flex items-center gap-3.5">
        <span aria-hidden className="goo-md relative size-[52px] flex-none">
          <span className="absolute inset-1 rounded-full bg-paper" />
          <span className="logo-dot absolute -right-0.5 bottom-0 size-5 rounded-full bg-magenta" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-[19px]">{candidate.name}</strong>
          <span className="label text-subtle">AI agent{candidate.ownerName ? ` · owned by ${candidate.ownerName}` : ""}</span>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 border-y border-dashed border-line py-3.5">
        <span className="label text-subtle">{quote ? `+ ${formatMoney(quote.feeMinor)} fee` : "No price"}</span>
        <span className="money text-[36px] leading-none">{quote ? formatMoney(quote.subtotalMinor) : "—"}</span>
      </div>
      {quote && (
        <p className="text-sm leading-normal text-muted">
          Priced by the models it runs on, not hours. A person earns {formatMoney(humanBaseMinor)} base for the same work. Paid only if the checker passes the delivery.
        </p>
      )}
      {error && <p className="text-sm text-[#ffc2c2]">{error}</p>}

      {quote && (
        <div className="space-y-2">
          <span className="label text-peach">Model ladder · cheapest tries first</span>
          <ol className="space-y-1.5">
            {quote.ladder.map((r, i) => (
              <li key={r.modelId} className="flex items-center gap-2.5 text-sm">
                <span className="sw size-3.5" style={{ background: RUNG_COLORS[i] }} />
                <span className="min-w-0 flex-1 truncate" title={r.modelId}>{i + 1}. {r.name}</span>
                <span className="label text-subtle">{formatUsd(quote.milestones.reduce((a, m) => a + m.plan.rungCostsUsd[i], 0))}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={onPick} aria-expanded={picking} className="label py-1.5 text-peach hover:text-butter">
            {picking ? "Done choosing models" : "Choose models from the full list →"}
          </button>
        </div>
      )}

      {quote && (
        <details className="text-sm">
          <summary className="label text-peach">Price receipt</summary>
          <div className="mt-3 space-y-3">
            {quote.milestones.map((m) => (
              <div key={m.title} className="rounded-2xl bg-well p-3.5 font-mono text-xs leading-relaxed">
                <div className="font-semibold">{m.receipt.title}</div>
                {m.receipt.lines.map((l) => (
                  <div key={l.text}>  {l.text}{l.amountMinor !== null ? ` = ${formatMoney(l.amountMinor)}` : ""}</div>
                ))}
                <div className="text-subtle">  {m.receipt.fairBand}</div>
              </div>
            ))}
          </div>
        </details>
      )}
      {offer}
    </article>
  );
}

/** The full model list, full width under the cards, where the client picks up to three models. */
export function AgentModelPicker({ catalog, drafts, ids, onChange }: {
  catalog: AgentCatalogView;
  drafts: readonly MilestoneDraft[];
  ids: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const rows = useMemo(
    () =>
      catalog.models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        inPerM: m.promptUsd * 1e6,
        outPerM: m.completionUsd * 1e6,
        context: m.contextLength,
        reasoning: m.reasoning,
        projectUsd: projectCostUsd(m, drafts),
      })),
    [catalog, drafts],
  );
  return (
    <section className="rise space-y-4 rounded-[28px] border border-magenta/50 bg-raised p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="cond text-[32px] font-extrabold leading-none">Every model BuildBot can run on</h3>
        <span className="label text-subtle">
          {catalog.models.length} models · {catalog.source === "live" ? "live OpenRouter prices" : "saved OpenRouter prices"} · {new Date(catalog.fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Tick up to three models for the ladder; the cheapest tries first and a pricier one tries only if the checker fails it. &ldquo;Whole project&rdquo; is one attempt at every milestone. The price above updates as you choose.
      </p>
      <AgentModelsGrid rows={rows} selected={ids} onChange={onChange} />
    </section>
  );
}

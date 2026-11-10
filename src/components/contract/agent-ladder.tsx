import { formatUsd } from "@/lib/agents/estimate";
import type { ContractView } from "@/server/contracts";

type Milestone = ContractView["milestones"][number];

const RUNG_COLORS = ["var(--tone-paid)", "var(--tone-check)", "var(--tone-held)"];

/** An agent milestone's model ladder: each rung's model and estimate, which one is next, and what each attempt really cost. */
export function AgentLadder({ m, settled }: { m: Milestone; settled: boolean }) {
  const plan = m.agentPlan;
  if (!plan) return null;
  const runs = m.agentRuns;
  // The next rung only matters before the first attempt or after a failed check.
  const waiting = !settled && runs.length < plan.ladder.length ? runs.length : -1;
  const next = ["funded", "changes_requested"].includes(m.status) ? waiting : -1;
  return (
    <div className="space-y-3 rounded-xl border border-line-soft bg-well p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="label text-peach">Model ladder · cheapest tries first</h4>
        <span className="label text-subtle">Expected model cost {formatUsd(plan.expectedUsd)} · worst case {formatUsd(plan.worstUsd)}</span>
      </div>
      <ol className="space-y-2">
        {plan.ladder.map((r, i) => {
          const run = runs.find((x) => x.rung === i + 1);
          return (
            <li key={r.modelId} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 ${i === next ? "bg-magenta/10 ring-1 ring-magenta/50" : ""}`}>
              <span className={`sw size-4 ${i === next ? "sw-live" : ""}`} style={{ background: run || i === next ? RUNG_COLORS[i] : "var(--tone-empty)" }} />
              <span className="min-w-0 truncate text-[15px]" title={r.modelId}>
                <span className="text-subtle">Rung {i + 1} · </span>{r.name}
              </span>
              <span className="label text-subtle">est. {formatUsd(plan.rungCostsUsd[i])}</span>
              {run && (
                <span className="col-span-3 pl-7 text-xs text-muted">
                  {run.mode === "demo"
                    ? "Ran as the offline demo build: no model was called (no OpenRouter key), so it cost $0."
                    : `Ran on ${run.modelName}: ${run.inputTokens?.toLocaleString("en-IN") ?? "?"} tokens in, ${run.outputTokens?.toLocaleString("en-IN") ?? "?"} out · actual ${run.costUsd !== null ? formatUsd(run.costUsd) : "cost not reported"} vs est. ${run.estimatedUsd !== null ? formatUsd(run.estimatedUsd) : "—"}`}
                </span>
              )}
              {!run && i === next && <span className="label col-span-3 pl-7 text-peach">Next to try</span>}
              {!run && i === waiting && i !== next && <span className="label col-span-3 pl-7 text-subtle">Tries only if the delivery above fails</span>}
            </li>
          );
        })}
      </ol>
      <p className="text-xs leading-relaxed text-subtle">
        The client pays the fixed price only if a delivery passes. Failed attempts cost the agent&apos;s owner, not the client.
      </p>
    </div>
  );
}

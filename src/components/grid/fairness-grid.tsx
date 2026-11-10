"use client";

import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { FairnessRow } from "@/server/ledger";
import { api } from "../api";
import { FairnessChart, skillLabel, skillsOf, tierRates } from "../fairness-chart";
import { GooBlock } from "../goo";
import { Reveal } from "../motion";
import { ErrorNote, PageHeader, SectionHead } from "../ui";
import { baseColDef, baseGridProps, ensureGridModules, money, useGridTheme } from "./setup";

ensureGridModules();

const pct = (v: unknown, sign = false) => (typeof v === "number" ? `${sign && v > 0 ? "+" : ""}${Number.isInteger(v) ? v : v.toFixed(1)}%` : "");
const rupees = (minor: number) => formatMoney(Math.round(minor / 100) * 100);

export function FairnessGrid() {
  const theme = useGridTheme();
  const [rows, setRows] = useState<FairnessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    api<{ rows: FairnessRow[] }>("/api/fairness").then((d) => setRows(d.rows)).catch((e: Error) => setError(e.message));
  }, []);

  const skills = useMemo(() => (rows ? skillsOf(rows) : []), [rows]);
  const skill = picked && skills.includes(picked) ? picked : skills[0];
  const rates = useMemo(() => (rows && skill ? tierRates(rows, skill) : null), [rows, skill]);

  const agents = useMemo(() => {
    const a = rows?.filter((r) => r.workerKind === "agent") ?? [];
    return a.length ? { count: a.length, priceMinor: a.reduce((s, r) => s + r.priceMinor, 0), baseMinor: a.reduce((s, r) => s + r.baseMinor, 0) } : null;
  }, [rows]);

  const estimate = useMemo(() => {
    const e = rows?.flatMap((r) => (r.estimateErrorPct === null ? [] : [r.estimateErrorPct])) ?? [];
    return e.length ? { count: e.length, avg: e.reduce((a, x) => a + x, 0) / e.length } : null;
  }, [rows]);

  const cols = useMemo<ColDef<FairnessRow>[]>(
    () => [
      { colId: "group", headerName: "Who did it", valueGetter: (p) => (p.data?.workerKind === "agent" ? "AI agent" : `${p.data?.tier} tier`), rowGroup: true, hide: true },
      { field: "milestone", minWidth: 180 },
      { field: "skill", minWidth: 110, valueFormatter: (p) => (p.value ? skillLabel(p.value) : "") },
      { field: "complexity", minWidth: 150 },
      { field: "expectedHours", headerName: "Expected hrs", type: "numericColumn", aggFunc: "sum", valueFormatter: (p) => (typeof p.value === "number" ? p.value.toFixed(1) : "") },
      { field: "baseRatePerHourMinor", headerName: "Base ₹/hr", type: "numericColumn", aggFunc: "avg", valueFormatter: (p) => (typeof p.value === "number" ? rupees(p.value) : "") },
      { field: "baseMinor", headerName: "Base pay", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "premiumPct", headerName: "Premium", type: "numericColumn", aggFunc: "avg", valueFormatter: (p) => pct(p.value, true) },
      { field: "priceMinor", headerName: "Price", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "estimateErrorPct", headerName: "Estimate error", type: "numericColumn", aggFunc: "avg", valueFormatter: (p) => pct(p.value, true) },
    ],
    [],
  );

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="04 · Fairness" title={<>Pricing<br />fairness</>}>
        The same work earns the same base pay, whoever does it. Only a verified track record adds a premium, and it&apos;s always shown on its own line.
      </PageHeader>
      <ErrorNote error={error} />
      {rows === null && !error && <GooBlock label="Loading prices" />}
      {rows?.length === 0 && <p className="text-muted">No milestones have been priced yet.</p>}

      {rates && rates.baseMinor !== null && skill && (
        <>
          <section className="grid grid-cols-2 gap-x-5 border-b border-line lg:grid-cols-4 lg:gap-x-0">
            <Stat label="Base rate" value={`${rupees(rates.baseMinor)}/hr`} note={`${skillLabel(skill)}, in every tier`} />
            <Stat
              label="Gap between tiers"
              value={rates.spreadMinor === null ? "—" : `${rupees(rates.spreadMinor)}/hr`}
              note={rates.spreadMinor === null ? "Needs priced work in two tiers" : "Difference in base pay for the same hours"}
            />
            <Stat
              label="Estimate error"
              value={estimate ? pct(Math.round(estimate.avg * 10) / 10, true) : "—"}
              note={estimate ? `PERT hours vs reported, over ${estimate.count}` : "No hours reported yet"}
            />
            <Stat
              label="AI agents"
              value={agents ? formatMoney(agents.priceMinor) : "—"}
              note={agents ? `for ${agents.count} milestones a person earns ${formatMoney(agents.baseMinor)} base for` : "No agent work yet"}
            />
          </section>

          <Reveal as="section" className="space-y-6">
            <SectionHead
              title="Same work, same base"
              note={skills.length > 1 ? undefined : `${skillLabel(skill)} · per expected hour`}
            />
            {skills.length > 1 && (
              <div role="radiogroup" aria-label="Skill" className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={s === skill}
                    onClick={() => setPicked(s)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${s === skill ? "border-paper bg-paper text-ink" : "border-line text-muted hover:border-paper/60"}`}
                  >
                    {skillLabel(s)}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-[28px] border border-line-soft bg-raised p-5 sm:p-7">
              <FairnessChart tiers={rates.tiers} baseMinor={rates.baseMinor} />
              <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
                Base pay is hours × the skill&apos;s rate × complexity, so it can&apos;t depend on who you are. Prices round to the nearest ₹50, which is why a rate can sit a few rupees off. AI agents aren&apos;t on this chart: they&apos;re priced by the models they run on.
              </p>
            </div>
          </Reveal>
        </>
      )}

      {rows && rows.length > 0 && (
        <section className="space-y-4">
          <SectionHead title="Every milestone" note="Open a group to see its milestones" />
          <AgGridReact<FairnessRow>
            {...baseGridProps}
            theme={theme}
            rowData={rows}
            columnDefs={cols}
            defaultColDef={{ ...baseColDef, sortable: true, flex: 1, minWidth: 110 }}
            autoGroupColumnDef={{ headerName: "Who did it", minWidth: 170 }}
            grandTotalRow="bottom"
            domLayout="autoHeight"
          />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-line py-6 lg:pr-6 lg:[&:not(:last-child)]:border-r lg:[&:not(:first-child)]:pl-6">
      <span className="label text-peach">{label}</span>
      <span className="money text-[34px] leading-none sm:text-[44px]">{value}</span>
      <span className="text-sm leading-snug text-muted">{note}</span>
    </div>
  );
}

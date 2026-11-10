"use client";

import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import type { ContractView } from "@/server/contracts";
import { Card } from "../ui";
import { baseColDef, baseGridProps, ensureGridModules, money, useGridTheme } from "./setup";

ensureGridModules();

interface CheckRow {
  milestone: string;
  criterion: string;
  method: string;
  outcome: string;
  note: string;
  attempt: number | null;
  replayUrl: string | null;
}

interface ReceiptRow {
  milestone: string;
  line: string;
  amountMinor: number | null;
}

const OUTCOME: Record<string, { label: string; color: string }> = {
  pass: { label: "Pass", color: "var(--tone-paid)" },
  fail: { label: "Fail", color: "var(--tone-bad)" },
  couldnt_check: { label: "Couldn't check", color: "var(--tone-check)" },
  "": { label: "Not checked", color: "var(--tone-neutral)" },
};

function OutcomeChip({ value }: { value?: string }) {
  const o = OUTCOME[value ?? ""] ?? { label: value ?? "", color: "var(--tone-neutral)" };
  return (
    <span className="chip">
      <span aria-hidden className="sw" style={{ background: o.color }} />
      {o.label}
    </span>
  );
}

/** Criteria-check grid (with replay links) and price-receipt rows for one contract. */
export function ContractGrids({ view }: { view: ContractView }) {
  const theme = useGridTheme();
  const [tab, setTab] = useState<"checks" | "receipts">("checks");

  const checkRows = useMemo<CheckRow[]>(
    () =>
      view.milestones.flatMap((m) =>
        m.draft.criteria.map((c, i) => {
          const r = m.lastCheck?.results.find((x) => x.criterionId === `c${i + 1}`);
          return {
            milestone: `${m.position + 1}. ${m.draft.title}`,
            criterion: c.text,
            method: c.method.replace("_", "-"),
            outcome: r?.outcome ?? "",
            note: r?.note ?? "",
            attempt: m.lastCheck?.attempt ?? null,
            replayUrl: r?.replayUrl ?? m.checkRuns[0]?.replayUrl ?? null,
          };
        }),
      ),
    [view],
  );

  const receiptRows = useMemo<ReceiptRow[]>(
    () =>
      view.milestones.flatMap((m) => [
        ...m.receipt.lines.map((l) => ({ milestone: `${m.position + 1}. ${m.draft.title}`, line: l.text, amountMinor: l.amountMinor })),
        { milestone: `${m.position + 1}. ${m.draft.title}`, line: m.receipt.fairBand, amountMinor: null },
        { milestone: `${m.position + 1}. ${m.draft.title}`, line: "Platform fee (5%)", amountMinor: m.feeMinor },
      ]),
    [view],
  );

  const checkCols = useMemo<ColDef<CheckRow>[]>(
    () => [
      { field: "milestone", rowGroup: true, hide: true },
      { field: "criterion", flex: 3, wrapText: true, autoHeight: true },
      { field: "method", width: 120 },
      {
        field: "outcome",
        width: 160,
        filter: "agSetColumnFilter",
        valueFormatter: (p) => OUTCOME[p.value ?? ""]?.label ?? p.value,
        cellRenderer: (p: { value?: string; node?: { group?: boolean } }) => (p.node?.group ? null : <OutcomeChip value={p.value} />),
      },
      { field: "note", flex: 3, wrapText: true, autoHeight: true },
      { field: "attempt", headerName: "Try", width: 80 },
      {
        field: "replayUrl",
        headerName: "Evidence",
        width: 130,
        cellRenderer: (p: { value?: string | null }) =>
          p.value ? (
            <a href={p.value} target="_blank" rel="noreferrer" className="text-magenta underline">Watch replay</a>
          ) : null,
      },
    ],
    [],
  );

  const receiptCols = useMemo<ColDef<ReceiptRow>[]>(
    () => [
      { field: "milestone", rowGroup: true, hide: true },
      { field: "line", flex: 4 },
      { field: "amountMinor", headerName: "Amount (₹)", type: "numericColumn", valueFormatter: money, flex: 1 },
    ],
    [],
  );

  const tabs = [
    { id: "checks", label: "Criteria checks", count: checkRows.length },
    { id: "receipts", label: "Price receipts", count: view.milestones.length },
  ] as const;

  return (
    <Card className="space-y-4">
      <div role="tablist" aria-label="Contract tables" className="inline-flex gap-1 rounded-full border border-line p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t.id ? "bg-paper text-ink" : "text-muted hover:text-paper"}`}
          >
            {t.label}
            <span className={`label ${tab === t.id ? "text-ink/70" : "text-subtle"}`}>{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="h-[460px]">
        {tab === "checks" ? (
          <AgGridReact<CheckRow>
            {...baseGridProps}
            theme={theme}
            rowData={checkRows}
            columnDefs={checkCols}
            defaultColDef={{ ...baseColDef, sortable: true, minWidth: 80 }}
            autoGroupColumnDef={{ headerName: "Milestone", minWidth: 220 }}
            groupDefaultExpanded={-1}
          />
        ) : (
          <AgGridReact<ReceiptRow>
            {...baseGridProps}
            theme={theme}
            rowData={receiptRows}
            columnDefs={receiptCols}
            defaultColDef={baseColDef}
            autoGroupColumnDef={{ headerName: "Milestone", minWidth: 220 }}
            groupDefaultExpanded={-1}
          />
        )}
      </div>
    </Card>
  );
}

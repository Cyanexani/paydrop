"use client";

import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import type { ContractView } from "@/server/contracts";
import { Card } from "../ui";
import { ensureGridModules, money, useGridTheme } from "./setup";

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

const OUTCOME: Record<string, string> = { pass: "Pass", fail: "Fail", couldnt_check: "Couldn't check", "": "Not checked" };

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
      { field: "outcome", width: 150, filter: "agSetColumnFilter", valueFormatter: (p) => OUTCOME[p.value ?? ""] ?? p.value },
      { field: "note", flex: 3, wrapText: true, autoHeight: true },
      { field: "attempt", width: 90 },
      {
        field: "replayUrl",
        headerName: "Evidence",
        width: 130,
        cellRenderer: (p: { value?: string | null }) =>
          p.value ? (
            <a href={p.value} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">Watch replay</a>
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

  const tabClass = (t: string) =>
    `rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`;

  return (
    <Card className="space-y-3">
      <div className="flex gap-2">
        <button className={tabClass("checks")} onClick={() => setTab("checks")}>Criteria checks</button>
        <button className={tabClass("receipts")} onClick={() => setTab("receipts")}>Price receipts</button>
      </div>
      <div className="h-[420px]">
        {tab === "checks" ? (
          <AgGridReact<CheckRow>
            theme={theme}
            rowData={checkRows}
            columnDefs={checkCols}
            defaultColDef={{ resizable: true, sortable: true, minWidth: 90 }}
            autoGroupColumnDef={{ headerName: "Milestone", minWidth: 220 }}
            groupDefaultExpanded={-1}
          />
        ) : (
          <AgGridReact<ReceiptRow>
            theme={theme}
            rowData={receiptRows}
            columnDefs={receiptCols}
            defaultColDef={{ resizable: true }}
            autoGroupColumnDef={{ headerName: "Milestone", minWidth: 220 }}
            groupDefaultExpanded={-1}
          />
        )}
      </div>
    </Card>
  );
}

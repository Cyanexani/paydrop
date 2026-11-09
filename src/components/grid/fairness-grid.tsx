"use client";

import type { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
import type { FairnessRow } from "@/server/ledger";
import { api } from "../api";
import { ErrorNote, PageHeader } from "../ui";
import { ensureGridModules, money, useGridTheme } from "./setup";

ensureGridModules();

export function FairnessGrid() {
  const theme = useGridTheme();
  const [rows, setRows] = useState<FairnessRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ rows: FairnessRow[] }>("/api/fairness").then((d) => setRows(d.rows)).catch((e: Error) => setError(e.message));
  }, []);

  const cols = useMemo<ColDef<FairnessRow>[]>(
    () => [
      { field: "tier", rowGroup: true, hide: true },
      { field: "milestone", minWidth: 180 },
      { field: "skill", width: 110 },
      { field: "complexity", width: 150 },
      { field: "expectedHours", headerName: "Expected hrs", type: "numericColumn", aggFunc: "sum" },
      { field: "baseRatePerHourMinor", headerName: "Base ₹/hr", type: "numericColumn", aggFunc: "avg", valueFormatter: money },
      { field: "baseMinor", headerName: "Base pay", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "premiumPct", headerName: "Premium %", type: "numericColumn", aggFunc: "avg", valueFormatter: (p) => (typeof p.value === "number" ? `${Math.round(p.value)}%` : "") },
      { field: "priceMinor", headerName: "Price", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "workerKind", headerName: "Worker", width: 100 },
      { field: "actualHours", headerName: "Actual hrs", type: "numericColumn" },
      { field: "estimateErrorPct", headerName: "Estimate error", type: "numericColumn", aggFunc: "avg", valueFormatter: (p) => (typeof p.value === "number" ? `${p.value > 0 ? "+" : ""}${p.value.toFixed(1)}%` : "") },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="04 · Fairness" title={<>Pricing<br />fairness</>}>
        Every milestone on the platform, grouped by freelancer tier. The base rate per hour is the same in every tier: the same work earns the same base pay, and only a verified track record adds a premium. Estimate error compares PERT hours with the hours freelancers report.
      </PageHeader>
      <ErrorNote error={error} />
      <div className="h-[560px]">
        <AgGridReact<FairnessRow>
          theme={theme}
          rowData={rows ?? undefined}
          loading={rows === null && !error}
          columnDefs={cols}
          defaultColDef={{ sortable: true, resizable: true, flex: 1, minWidth: 100 }}
          autoGroupColumnDef={{ headerName: "Tier", minWidth: 160 }}
          grandTotalRow="bottom"
        />
      </div>
    </div>
  );
}

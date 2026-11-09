"use client";

import type { ColDef, GridApi, GridState, GridStateKey } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LedgerRow } from "@/server/ledger";
import { api as call } from "../api";
import { Button, Card, ErrorNote, StatusPill, inputClass } from "../ui";
import { ensureGridModules, money, useGridTheme } from "./setup";

ensureGridModules();

const SCHEMA_COLUMNS = {
  status: { description: "Milestone status, e.g. funded (money held), verified, released, paid_out", includeSetValues: true },
  priceMinor: { description: "What the freelancer earns, in paise (₹1 = 100)" },
  heldMinor: { description: "Money currently held in PayPal for this milestone, in paise" },
  releasedMinor: { description: "Money captured (released) for this milestone, in paise" },
  freelancer: { description: "Freelancer or AI agent name" },
  client: { description: "Client name" },
  project: { description: "Project title" },
  kind: { description: "original milestone or change_order", includeSetValues: true },
};

export function LedgerGrid() {
  const theme = useGridTheme();
  const router = useRouter();
  const apiRef = useRef<GridApi<LedgerRow> | null>(null);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<{ rows: LedgerRow[] }>("/api/ledger").then((d) => setRows(d.rows)).catch((e: Error) => setError(e.message));
  }, []);

  const columnDefs = useMemo<ColDef<LedgerRow>[]>(
    () => [
      { field: "client", rowGroup: true, hide: true, filter: "agSetColumnFilter" },
      { field: "project", rowGroup: true, hide: true, filter: "agSetColumnFilter" },
      { field: "milestone", minWidth: 200, filter: "agTextColumnFilter" },
      { field: "status", filter: "agSetColumnFilter", cellRenderer: (p: { value?: string }) => (p.value ? <StatusPill status={p.value} /> : null), minWidth: 170 },
      { field: "freelancer", filter: "agTextColumnFilter" },
      { field: "kind", headerName: "Type", filter: "agSetColumnFilter", valueFormatter: (p) => (p.value === "change_order" ? "Change order" : p.value ? "Original" : "") },
      { field: "priceMinor", headerName: "Price (₹)", type: "numericColumn", aggFunc: "sum", valueFormatter: money, filter: "agNumberColumnFilter" },
      { field: "feeMinor", headerName: "Fee (₹)", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "heldMinor", headerName: "Held in PayPal", type: "numericColumn", aggFunc: "sum", valueFormatter: money, filter: "agNumberColumnFilter" },
      { field: "releasedMinor", headerName: "Released", type: "numericColumn", aggFunc: "sum", valueFormatter: money, filter: "agNumberColumnFilter" },
      { field: "paidOutMinor", headerName: "Paid out", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "payoutStatus", headerName: "Payout", filter: "agSetColumnFilter" },
      { field: "dueAt", headerName: "Due", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""), filter: "agDateColumnFilter" },
      { field: "rating", headerName: "★", width: 80, valueFormatter: (p) => (p.value ? "★".repeat(p.value) : "") },
    ],
    [],
  );

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const grid = apiRef.current;
    if (!grid || !query.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      // AG Grid AI Toolkit: describe this grid's state shape to the model, apply what comes back.
      const schema = grid.getStructuredSchema({ exclude: ["pivot", "columnSizing"], columns: SCHEMA_COLUMNS });
      const res = await call<{ state: GridState; explanation: string }>("/api/grid-assist", { body: { query, schema, state: grid.getState() } });
      // Leave every part of the state the assistant didn't touch exactly as it is.
      const current = Object.keys(grid.getState()).filter((k) => k !== "version") as GridStateKey[];
      const keep = current.filter((k) => !(k in res.state));
      grid.setState({ ...grid.getState(), ...res.state }, keep);
      setAnswer(res.explanation);
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Money ledger</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Every milestone you&apos;re party to, grouped by client and project: what&apos;s held in PayPal, released and paid out.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "milestonepay-ledger.csv" })}>CSV</Button>
          <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsExcel({ fileName: "milestonepay-ledger.xlsx" })}>Excel</Button>
        </div>
      </div>
      <Card className="p-3">
        <form onSubmit={ask} className="flex flex-wrap gap-2">
          <input className={`${inputClass} min-w-64 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Ask the grid: "held payments over ₹5000", "group by status", "show all"' aria-label="Ask the grid" />
          <Button type="submit" disabled={busy}>{busy ? "Thinking…" : "Apply"}</Button>
        </form>
        {answer && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{answer}</p>}
      </Card>
      <ErrorNote error={error} />
      {rows?.length === 0 && (
        <Card className="text-sm">No milestones yet. <Link href="/new" className="text-emerald-700 underline dark:text-emerald-400">Start a project</Link>.</Card>
      )}
      <div className="h-[560px]">
        <AgGridReact<LedgerRow>
          theme={theme}
          rowData={rows ?? undefined}
          loading={rows === null && !error}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, flex: 1, minWidth: 110, filter: true, floatingFilter: false }}
          autoGroupColumnDef={{ headerName: "Client / project", minWidth: 240 }}
          groupDefaultExpanded={-1}
          grandTotalRow="bottom"
          groupTotalRow="bottom"
          cellSelection
          onGridReady={(e) => (apiRef.current = e.api)}
          onRowDoubleClicked={(e) => e.data && router.push(`/contracts/${e.data.contractId}`)}
        />
      </div>
      <p className="text-xs text-zinc-500">Double-click a milestone to open its contract. Totals use the locked contract prices.</p>
    </div>
  );
}

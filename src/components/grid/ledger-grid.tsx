"use client";

import type { ColDef, GridApi, GridState, GridStateKey } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LedgerRow } from "@/server/ledger";
import { api as call } from "../api";
import { CountUp } from "../motion";
import { Button, Card, ErrorNote, PageHeader, StatusPill, inputClass } from "../ui";
import { baseColDef, baseGridProps, ensureGridModules, money, useGridTheme } from "./setup";

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
      { field: "status", filter: "agSetColumnFilter", cellRenderer: (p: { value?: string }) => (p.value ? <StatusPill status={p.value} /> : null), minWidth: 190 },
      { field: "freelancer", filter: "agTextColumnFilter", minWidth: 140 },
      { field: "kind", headerName: "Type", filter: "agSetColumnFilter", valueFormatter: (p) => (p.value === "change_order" ? "Change order" : p.value ? "Original" : "") },
      { field: "priceMinor", headerName: "Price", type: "numericColumn", aggFunc: "sum", valueFormatter: money, filter: "agNumberColumnFilter" },
      { field: "feeMinor", headerName: "Fee", type: "numericColumn", aggFunc: "sum", valueFormatter: money },
      { field: "heldMinor", headerName: "Held", type: "numericColumn", aggFunc: "sum", valueFormatter: money, filter: "agNumberColumnFilter" },
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

  const totals = rows ? ledgerTotals(rows) : null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="03 · Ledger" title="Ledger">
        Every milestone you&apos;re part of, grouped by client and project, with where its money sits.
      </PageHeader>
      {totals && (
        <section className="grid gap-4 md:grid-cols-3">
          {totals.map((t) => (
            <div key={t.label} className="flex flex-col gap-2 rounded-xl border border-line-soft bg-raised p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-medium text-muted"><span className="sw" style={{ background: t.color }} />{t.label}</span>
                <span className="text-xs text-subtle">{t.count} milestone{t.count === 1 ? "" : "s"}</span>
              </div>
              <span className="money text-4xl leading-none" style={{ color: t.ink }}><CountUp minor={t.minor} /></span>
              <p className="text-[13px] leading-snug text-subtle">{t.note}</p>
            </div>
          ))}
        </section>
      )}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={ask} className="flex min-w-0 flex-[1_1_420px] gap-2">
            <input className={`${inputClass} min-w-0 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Ask: "held payments over ₹5000", "group by status"' aria-label="Ask the ledger" />
            <Button type="submit" disabled={busy}>{busy ? "Thinking…" : "Ask"}</Button>
          </form>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "paydrop-ledger.csv" })}>CSV</Button>
            <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsExcel({ fileName: "paydrop-ledger.xlsx" })}>Excel</Button>
          </div>
        </div>
        {answer && <p className="px-2 pb-1 text-sm text-muted">{answer}</p>}
      </Card>
      <ErrorNote error={error} />
      {rows?.length === 0 && (
        <Card className="text-sm">No milestones yet. <Link href="/new" className="text-magenta underline">Start a project</Link>.</Card>
      )}
      <div className="h-[560px]">
        <AgGridReact<LedgerRow>
          {...baseGridProps}
          theme={theme}
          rowData={rows ?? undefined}
          loading={rows === null && !error}
          columnDefs={columnDefs}
          defaultColDef={{ ...baseColDef, sortable: true, flex: 1, minWidth: 110, filter: true, floatingFilter: false }}
          autoGroupColumnDef={{ headerName: "Client / project", minWidth: 240 }}
          groupDefaultExpanded={-1}
          grandTotalRow="bottom"
          groupTotalRow="bottom"
          cellSelection
          onGridReady={(e) => (apiRef.current = e.api)}
          onRowDoubleClicked={(e) => e.data && router.push(`/contracts/${e.data.contractId}`)}
        />
      </div>
      <p className="text-xs text-subtle">Double-click a milestone to open its contract. Totals use the locked contract prices.</p>
    </div>
  );
}

const UNFUNDED = ["offered", "accepted", "funding", "release_failed"];

/** Held, paid out and not-yet-funded totals for the dot fields. */
function ledgerTotals(rows: LedgerRow[]) {
  const leaves = rows.filter((r) => r.milestone);
  const held = leaves.filter((r) => r.heldMinor > 0);
  const paid = leaves.filter((r) => r.releasedMinor > 0);
  const none = leaves.filter((r) => UNFUNDED.includes(r.status));
  const sum = (rs: LedgerRow[], f: (r: LedgerRow) => number) => rs.reduce((a, r) => a + f(r), 0);
  return [
    { label: "Held at PayPal", minor: sum(held, (r) => r.heldMinor), count: held.length, color: "var(--tone-held)", ink: "var(--ink-held)", cls: "ldot-held", note: "Authorized, not taken. Each hold is renewed before PayPal's 29-day limit." },
    { label: "Released", minor: sum(paid, (r) => r.releasedMinor), count: paid.length, color: "var(--tone-paid)", ink: "var(--ink-paid)", cls: "ldot-paid", note: "Captured after the checker passed and the client approved." },
    { label: "Not yet funded", minor: sum(none, (r) => r.priceMinor), count: none.length, color: "var(--tone-neutral)", ink: "var(--color-muted)", cls: "ldot-none", note: "Agreed in the contract. Funded one milestone at a time." },
  ];
}

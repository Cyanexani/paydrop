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

  const totals = rows ? ledgerTotals(rows) : null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="03 · Ledger" title={<>Money<br />ledger</>}>
        Every milestone you&apos;re part of, grouped by client and project. One dot is ₹10,000, so you can see where your money sits.
      </PageHeader>
      {totals && (
        <section className="grid border-b border-line md:grid-cols-3">
          {totals.map((t) => (
            <div key={t.label} className="flex flex-col gap-4 py-7 md:pr-7">
              <div className="flex items-center justify-between gap-3">
                <span className="chip"><span className="sw" style={{ background: t.color }} />{t.label}</span>
                <span className="label text-subtle">{t.count} milestone{t.count === 1 ? "" : "s"}</span>
              </div>
              <span className="money text-[68px] leading-[0.9]" style={{ color: t.color === "#6a4560" ? "var(--color-muted)" : t.color }}><CountUp minor={t.minor} /></span>
              <div aria-hidden className="flex max-w-[320px] flex-wrap gap-2">
                {Array.from({ length: Math.min(60, Math.round(t.minor / 1_000_000)) }, (_, i) => (
                  <span key={i} className={`ldot ${t.cls}`} style={{ animationDelay: `${i * 0.04}s` }} />
                ))}
              </div>
              <p className="text-sm leading-snug text-muted">{t.note}</p>
            </div>
          ))}
        </section>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "milestonepay-ledger.csv" })}>CSV</Button>
        <Button variant="secondary" onClick={() => apiRef.current?.exportDataAsExcel({ fileName: "milestonepay-ledger.xlsx" })}>Excel</Button>
      </div>
      <Card className="p-3">
        <form onSubmit={ask} className="flex flex-wrap gap-2">
          <input className={`${inputClass} min-w-64 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Ask: "held payments over ₹5000", "group by status", "show all"' aria-label="Ask the grid" />
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

const UNFUNDED = ["offered", "accepted", "funding", "release_failed"];

/** Held, paid out and not-yet-funded totals for the dot fields. */
function ledgerTotals(rows: LedgerRow[]) {
  const leaves = rows.filter((r) => r.milestone);
  const held = leaves.filter((r) => r.heldMinor > 0);
  const paid = leaves.filter((r) => r.releasedMinor > 0);
  const none = leaves.filter((r) => UNFUNDED.includes(r.status));
  const sum = (rs: LedgerRow[], f: (r: LedgerRow) => number) => rs.reduce((a, r) => a + f(r), 0);
  return [
    { label: "Held at PayPal", minor: sum(held, (r) => r.heldMinor), count: held.length, color: "#ff49c1", cls: "ldot-held", note: "Authorized, not taken. Each hold is renewed before PayPal's 29-day limit." },
    { label: "Released", minor: sum(paid, (r) => r.releasedMinor), count: paid.length, color: "#fff7ad", cls: "ldot-paid", note: "Captured after the checker passed and the client approved." },
    { label: "Not yet funded", minor: sum(none, (r) => r.priceMinor), count: none.length, color: "#6a4560", cls: "ldot-none", note: "Agreed in the contract. Funded one milestone at a time." },
  ];
}

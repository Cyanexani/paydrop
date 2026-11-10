"use client";

import type { ColDef, GridApi, SelectionChangedEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatUsd } from "@/lib/agents/estimate";
import { inputClass } from "../ui";
import { baseColDef, baseGridProps, ensureGridModules, useGridTheme } from "./setup";

ensureGridModules();

export interface ModelRow {
  id: string;
  name: string;
  provider: string;
  inPerM: number;
  outPerM: number;
  context: number;
  reasoning: boolean;
  projectUsd: number;
}

const MAX = 3;
const perM = (p: { value?: number }) => (typeof p.value === "number" ? `$${p.value < 1 ? p.value.toFixed(3) : p.value.toFixed(2)}` : "");

/** AG Grid of every OpenRouter model the agent can use; ticking rows sets the ladder (up to three). */
export default function AgentModelsGrid({ rows, selected, onChange }: { rows: ModelRow[]; selected: readonly string[]; onChange: (ids: string[]) => void }) {
  const theme = useGridTheme();
  const api = useRef<GridApi<ModelRow> | null>(null);
  const [filter, setFilter] = useState("");
  // Ignore the selection events our own syncing causes.
  const syncing = useRef(false);

  const columnDefs = useMemo<ColDef<ModelRow>[]>(
    () => [
      { field: "name", headerName: "Model", minWidth: 230, flex: 2, filter: "agTextColumnFilter", tooltipField: "id" },
      { field: "provider", minWidth: 120, flex: 1, filter: "agSetColumnFilter" },
      { field: "projectUsd", headerName: "Whole project", sort: "asc", minWidth: 130, type: "numericColumn", valueFormatter: (p) => (typeof p.value === "number" ? formatUsd(p.value) : ""), filter: "agNumberColumnFilter" },
      { field: "inPerM", headerName: "In $/M", minWidth: 100, type: "numericColumn", valueFormatter: perM },
      { field: "outPerM", headerName: "Out $/M", minWidth: 100, type: "numericColumn", valueFormatter: perM },
      { field: "context", headerName: "Context", minWidth: 110, type: "numericColumn", valueFormatter: (p) => (typeof p.value === "number" ? `${Math.round(p.value / 1000)}k` : "") },
      { field: "reasoning", headerName: "Thinks", minWidth: 90, valueFormatter: (p) => (p.value ? "yes" : ""), filter: "agSetColumnFilter" },
    ],
    [],
  );

  // Keep the grid's ticks in step with the ladder chosen outside it.
  useEffect(() => {
    const g = api.current;
    if (!g) return;
    syncing.current = true;
    g.forEachNode((n) => n.setSelected(!!n.data && selected.includes(n.data.id)));
    syncing.current = false;
  }, [selected]);

  function changed(e: SelectionChangedEvent<ModelRow>) {
    if (syncing.current) return;
    let ids = e.api.getSelectedRows().map((r) => r.id);
    if (ids.length > MAX) {
      // Keep the earlier picks; untick the one just added.
      ids = ids.filter((id) => selected.includes(id)).slice(0, MAX);
      syncing.current = true;
      e.api.forEachNode((n) => n.setSelected(!!n.data && ids.includes(n.data.id)));
      syncing.current = false;
    }
    if (ids.length > 0) onChange(ids);
  }

  return (
    <div className="space-y-3">
      <input className={`${inputClass} max-w-md`} placeholder="Search models, e.g. claude, gemini, llama" aria-label="Search models" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="h-[460px]">
        <AgGridReact<ModelRow>
          {...baseGridProps}
          theme={theme}
          defaultColDef={{ ...baseColDef, sortable: true }}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(p) => p.data.id}
          quickFilterText={filter}
          // A click toggles one model without clearing the others, like a checklist.
          rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: false, enableClickSelection: true, enableSelectionWithoutKeys: true }}
          onGridReady={(e) => {
            api.current = e.api;
            syncing.current = true;
            e.api.forEachNode((n) => n.setSelected(!!n.data && selected.includes(n.data.id)));
            syncing.current = false;
          }}
          onSelectionChanged={changed}
          animateRows
        />
      </div>
    </div>
  );
}

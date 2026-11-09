"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { api } from "./api";
import { Card, ErrorNote, StatusPill } from "./ui";

interface Row {
  id: string;
  title: string;
  status: string;
  totalMinor: number;
  createdAt: string;
}

export function ContractList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ contracts: Row[] }>("/api/contracts")
      .then((d) => setRows(d.contracts))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
      <ErrorNote error={error} />
      {rows === null && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {rows?.length === 0 && (
        <Card className="text-sm">
          No contracts yet. <Link className="text-emerald-700 underline dark:text-emerald-400" href="/new">Start a project</Link>.
        </Card>
      )}
      <ul className="space-y-3">
        {rows?.map((c) => (
          <li key={c.id}>
            <Link href={`/contracts/${c.id}`} className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.title}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">{formatMoney(c.totalMinor)}</span>
                  <StatusPill status={c.status} />
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{new Date(c.createdAt).toLocaleString()}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

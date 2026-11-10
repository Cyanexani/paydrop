"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { api } from "./api";
import { HELD, PAID } from "./contract/money-stage";
import { GooBlock } from "./goo";
import { Card, ErrorNote, PageHeader, StatusPill } from "./ui";

interface Row {
  id: string;
  title: string;
  status: string;
  subtotalMinor: number;
  totalMinor: number;
  createdAt: string;
  clientName: string;
  freelancerName: string;
  milestones: Array<{ position: number; status: string; priceMinor: number }>;
}

const CHECKING = ["submitted", "needs_review", "verified"];

/** A milestone's segment: green when paid, amber while being checked, sky when held, grey before funding. */
function dropStyle(status: string): { background: string; live: boolean } {
  if (PAID.includes(status)) return { background: "var(--tone-paid)", live: false };
  if (CHECKING.includes(status)) return { background: "var(--tone-check)", live: true };
  if (HELD.includes(status)) return { background: "var(--tone-held)", live: false };
  return { background: "var(--tone-empty)", live: false };
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
      <PageHeader eyebrow="02 · Contracts" title="Contracts">
        Each one is a set of milestones. The money for each is held at PayPal until the work checks out.
      </PageHeader>
      <ErrorNote error={error} />
      {rows === null && !error && <GooBlock label="Loading contracts" />}
      {rows?.length === 0 && (
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="space-y-1">
            <p className="text-base font-semibold">No contracts yet</p>
            <p className="text-sm text-muted">Scope your first project to create one.</p>
          </div>
          <Link className="jelly inline-flex min-h-10 items-center gap-2 rounded-lg bg-butter px-4 text-sm font-semibold text-plum hover:bg-white" href="/new">Start a project <span aria-hidden>→</span></Link>
        </Card>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line-soft bg-raised shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line-soft bg-well px-5 py-2.5 text-xs font-medium text-subtle md:grid-cols-[minmax(0,1fr)_150px_130px_150px]">
            <span>Contract</span>
            <span className="max-md:hidden">Milestones</span>
            <span className="max-md:hidden">Status</span>
            <span className="text-right">Released</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {rows.map((c) => {
              const paidCount = c.milestones.filter((m) => PAID.includes(m.status)).length;
              const paid = c.milestones.filter((m) => PAID.includes(m.status)).reduce((a, m) => a + m.priceMinor, 0);
              return (
                <li key={c.id}>
                  <Link
                    href={`/contracts/${c.id}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-white/5 md:grid-cols-[minmax(0,1fr)_150px_130px_150px]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="truncate text-[15px] font-semibold group-hover:text-butter">{c.title}</strong>
                      <span className="truncate text-[13px] text-subtle">
                        {c.clientName} → {c.freelancerName} · {new Date(c.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </span>
                    </span>
                    {/* One segment per milestone, coloured by where its money is */}
                    <span className="flex items-center gap-2.5 max-md:hidden" role="img" aria-label={`${paidCount} of ${c.milestones.length} milestones paid`}>
                      <span className="flex items-center gap-1">
                        {c.milestones.map((m) => {
                          const d = dropStyle(m.status);
                          return <span key={m.position} className={`h-2 w-5 rounded-full ${d.live ? "sw-live" : ""}`} style={{ background: d.background }} />;
                        })}
                      </span>
                      <span className="text-xs text-subtle">{paidCount}/{c.milestones.length}</span>
                    </span>
                    <span className="max-md:col-start-1 max-md:row-start-2"><StatusPill status={c.status} /></span>
                    <span className="flex flex-col items-end gap-0.5 max-md:row-span-2 max-md:row-start-1 max-md:col-start-2">
                      <span className="money text-[15px]">{formatMoney(paid)}</span>
                      <span className="text-xs text-subtle">of {formatMoney(c.subtotalMinor)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

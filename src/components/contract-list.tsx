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

/** A milestone's drop: butter when paid, peach while being checked, magenta when held, hollow before funding. */
function dropStyle(status: string): { background: string; boxShadow?: string; live: boolean } {
  if (PAID.includes(status)) return { background: "var(--tone-paid)", live: false };
  if (CHECKING.includes(status)) return { background: "var(--tone-check)", live: true };
  if (HELD.includes(status)) return { background: "var(--tone-held)", live: false };
  return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--tone-neutral)", live: false };
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
    <div className="space-y-8">
      <PageHeader eyebrow="02 · Contracts" title={<>Your<br />contracts</>}>
        Each one is a set of milestones. The money for each is held at PayPal until the work checks out.
      </PageHeader>
      <ErrorNote error={error} />
      {rows === null && !error && <GooBlock label="Loading contracts" />}
      {rows?.length === 0 && (
        <Card className="rise flex flex-wrap items-center justify-between gap-6 p-8">
          <div className="flex items-center gap-6">
            <span aria-hidden className="goo-md relative block h-16 w-24 flex-none">
              <span className="absolute left-1 top-3 size-10 rounded-full bg-wine" />
              <span className="mb3 absolute left-12 top-5 size-6 rounded-full bg-magenta" />
            </span>
            <p className="cond text-[32px] font-bold leading-none">No contracts yet.<br /><span className="text-subtle">Scope your first project.</span></p>
          </div>
          <Link className="jelly inline-flex min-h-12 items-center gap-2 rounded-full bg-butter px-7 font-bold text-plum hover:bg-white" href="/new">Start a project <span aria-hidden>→</span></Link>
        </Card>
      )}
      <ul>
        {rows?.map((c, i) => {
          const paid = c.milestones.filter((m) => PAID.includes(m.status)).reduce((a, m) => a + m.priceMinor, 0);
          const max = Math.max(1, ...c.milestones.map((m) => m.priceMinor));
          return (
            <li key={c.id} className="rise border-b border-line" style={{ animationDelay: `${Math.min(i, 10) * 70}ms` }}>
              <Link
                href={`/contracts/${c.id}`}
                className="group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-5 gap-y-4 px-2 py-6 transition-colors duration-300 hover:bg-raised sm:grid-cols-[72px_minmax(0,1fr)_auto] lg:grid-cols-[72px_minmax(0,1fr)_auto_auto]"
              >
                <span className="money text-[48px] leading-none text-magenta transition-transform duration-500 group-hover:-translate-y-1">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 flex-col gap-1.5">
                  <strong className="cond text-[30px] font-bold leading-none transition-colors group-hover:text-butter">{c.title}</strong>
                  <span className="label text-subtle">
                    {c.clientName} → {c.freelancerName} · {new Date(c.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </span>
                {/* One drop per milestone, sized by price and coloured by where its money is */}
                <span className="col-start-2 flex items-center gap-4 sm:col-start-auto" role="img" aria-label={`${c.milestones.filter((m) => PAID.includes(m.status)).length} of ${c.milestones.length} milestones paid`}>
                  <span className="flex items-center gap-1.5">
                    {c.milestones.map((m) => {
                      const d = dropStyle(m.status);
                      const size = 12 + 14 * Math.sqrt(m.priceMinor / max);
                      return (
                        <span
                          key={m.position}
                          className={`rounded-full transition-transform duration-500 group-hover:scale-110 ${d.live ? "sw-live" : ""}`}
                          style={{ width: size, height: size, background: d.background, boxShadow: d.boxShadow, transitionDelay: `${m.position * 40}ms` }}
                        />
                      );
                    })}
                  </span>
                  <StatusPill status={c.status} />
                </span>
                <span className="col-start-2 flex flex-col gap-1 lg:col-start-auto lg:min-w-44 lg:items-end">
                  <span className="money text-[34px] leading-none">{formatMoney(paid)}</span>
                  <span className="label text-subtle">released of {formatMoney(c.subtotalMinor)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

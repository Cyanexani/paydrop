"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { api } from "./api";
import { Card, ErrorNote, PageHeader, StatusPill } from "./ui";
import { GooBlock } from "./goo";

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
    <div className="space-y-8">
      <PageHeader eyebrow="02 · Contracts" title={<>Your<br />contracts</>}>
        Each one is a set of milestones. The money for each is held at PayPal until the work checks out.
      </PageHeader>
      <ErrorNote error={error} />
      {rows === null && !error && <GooBlock label="Loading contracts" />}
      {rows?.length === 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-[15px]">No contracts yet.</span>
          <Link className="inline-flex min-h-11 items-center rounded-full bg-butter px-6 font-bold text-plum" href="/new">Start a project →</Link>
        </Card>
      )}
      <ul>
        {rows?.map((c, i) => (
          <li key={c.id} className="border-b border-line">
            <Link href={`/contracts/${c.id}`} className="group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-5 gap-y-3 px-2 py-6 transition-colors hover:bg-raised sm:grid-cols-[72px_minmax(0,1fr)_auto_auto]">
              <span className="money text-[48px] leading-none text-magenta">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <strong className="cond text-[30px] font-bold leading-none transition-colors group-hover:text-butter">{c.title}</strong>
                <span className="label text-subtle">{new Date(c.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
              </span>
              <span className="col-start-2 sm:col-start-auto"><StatusPill status={c.status} /></span>
              <span className="money col-start-2 text-[34px] leading-none sm:col-start-auto sm:min-w-40 sm:text-right">{formatMoney(c.totalMinor)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

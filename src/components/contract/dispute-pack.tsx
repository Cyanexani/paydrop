"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { disputePack } from "@/server/contract-actions";
import { api } from "../api";
import { Button, Card, ErrorNote, StatusPill } from "../ui";

type Pack = Awaited<ReturnType<typeof disputePack>>;

/** Printable dispute pack: criteria, evidence, replays, messages and money events in one timeline. */
export function DisputePack({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Pack>(`/api/contracts/${id}/dispute-pack`).then(setPack).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <ErrorNote error={error} />;
  if (!pack) return <p className="text-sm text-zinc-500">Loading…</p>;

  const download = () => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dispute-pack-${id}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/contracts/${id}`} className="text-sm text-zinc-500 hover:underline">← Contract</Link>
          <h1 className="text-2xl font-semibold tracking-tight">Dispute pack: {pack.contract.title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {pack.contract.parties.map((p) => `${p.name} (${p.role})`).join(" · ")} · generated {new Date(pack.generatedAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" onClick={download}>Download JSON</Button>
        </div>
      </div>

      {pack.milestones.map((m) => (
        <Card key={m.position} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{m.position}. {m.title}</h2>
            <StatusPill status={m.status} />
          </div>
          <p className="text-xs text-zinc-500">Due {m.dueAt ? new Date(m.dueAt).toLocaleString("en-IN") : "—"} · {m.receipt.title}</p>
          <ul className="text-sm">
            {m.criteria.map((c) => {
              const r = m.lastCheck?.results.find((x) => x.criterionId === c.id);
              return (
                <li key={c.id}>
                  <strong>{c.id}</strong> {c.text} — {r ? `${r.outcome}${r.note ? `: ${r.note}` : ""}` : "not checked"}
                  {r?.replayUrl && <a className="ml-1 text-emerald-700 underline dark:text-emerald-400" href={r.replayUrl} target="_blank" rel="noreferrer">replay</a>}
                </li>
              );
            })}
          </ul>
          {m.submissions.length > 0 && (
            <p className="text-xs text-zinc-500">Submissions: {m.submissions.map((s) => `${s.evidenceUrl}${s.commitSha ? ` @${s.commitSha}` : ""} (${new Date(s.at).toLocaleString("en-IN")})`).join("; ")}</p>
          )}
          {m.payouts.length > 0 && <p className="text-xs text-zinc-500">Payouts: {m.payouts.map((p) => `${p.name} ${formatMoney(p.amountMinor, p.currency)} ${p.status}`).join("; ")}</p>}
        </Card>
      ))}

      <Card>
        <h2 className="mb-2 font-semibold">Timeline</h2>
        <ol className="space-y-1 text-sm">
          {pack.timeline.map((t, i) => (
            <li key={i} className="grid grid-cols-[9rem_6rem_1fr] gap-2">
              <span className="tabular-nums text-zinc-500">{new Date(t.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="text-zinc-500">{t.kind}{t.milestone ? ` #${t.milestone}` : ""}</span>
              <span>
                {t.text}
                {t.link && <a className="ml-1 text-emerald-700 underline dark:text-emerald-400" href={t.link} target="_blank" rel="noreferrer">replay</a>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

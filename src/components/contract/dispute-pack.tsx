"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { disputePack } from "@/server/contract-actions";
import { api } from "../api";
import { Button, Card, ErrorNote, StatusPill } from "../ui";
import { GooBlock } from "@/components/goo";

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
  if (!pack) return <GooBlock />;

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
        <div className="min-w-0">
          <Link href={`/contracts/${id}`} className="label inline-block py-2 text-muted hover:text-butter">← Contract</Link>
          <h1 className="cond rise my-3 text-[clamp(44px,7vw,96px)] font-extrabold leading-[0.88]">Dispute pack: {pack.contract.title}</h1>
          <p className="label leading-relaxed text-subtle">
            {pack.contract.parties.map((p) => `${p.name} (${p.role})`).join(" · ")} · generated {new Date(pack.generatedAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" onClick={download}>Download JSON</Button>
        </div>
      </div>

      {pack.milestones.map((m) => (
        <Card key={m.position} className="space-y-3 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="cond text-[28px] font-bold leading-none">{m.position}. {m.title}</h2>
            <StatusPill status={m.status} />
          </div>
          <p className="text-xs text-subtle">Due {m.dueAt ? new Date(m.dueAt).toLocaleString("en-IN") : "—"} · {m.receipt.title}</p>
          <ul className="space-y-1.5 text-[15px]">
            {m.criteria.map((c) => {
              const r = m.lastCheck?.results.find((x) => x.criterionId === c.id);
              return (
                <li key={c.id}>
                  <strong>{c.id}</strong> {c.text} — {r ? `${r.outcome}${r.note ? `: ${r.note}` : ""}` : "not checked"}
                  {r?.replayUrl && <a className="ml-1 text-magenta underline" href={r.replayUrl} target="_blank" rel="noreferrer">replay</a>}
                </li>
              );
            })}
          </ul>
          {m.submissions.length > 0 && (
            <p className="text-xs text-subtle">Submissions: {m.submissions.map((s) => `${s.evidenceUrl}${s.commitSha ? ` @${s.commitSha}` : ""} (${new Date(s.at).toLocaleString("en-IN")})`).join("; ")}</p>
          )}
          {m.payouts.length > 0 && <p className="text-xs text-subtle">Payouts: {m.payouts.map((p) => `${p.name} ${formatMoney(p.amountMinor, p.currency)} ${p.status}`).join("; ")}</p>}
        </Card>
      ))}

      <Card>
        <h2 className="cond mb-3 text-[32px] font-extrabold leading-none">Timeline</h2>
        <ol className="text-sm [overflow-wrap:anywhere]">
          {pack.timeline.map((t, i) => (
            <li key={i} className="grid gap-x-3 gap-y-0.5 border-t border-line-soft py-2 first:border-0 sm:grid-cols-[9rem_7rem_minmax(0,1fr)]">
              <span className="label text-subtle">{new Date(t.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="label text-peach">{t.kind}{t.milestone ? ` #${t.milestone}` : ""}</span>
              <span>
                {t.text}
                {t.link && <a className="ml-1 text-magenta underline" href={t.link} target="_blank" rel="noreferrer">replay</a>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { api, type PublicConfig, type Session } from "./api";
import { MilestoneCard } from "./contract/milestone-card";
import { AuditTrail, ChangeRequestsPanel, MessagesPanel, OfferPanel } from "./contract/panels";
import { MoneyStage, HELD, PAID, UNFUNDED, sumWhere } from "./contract/money-stage";
import { nextMove, stopNo } from "./contract/next-move";
import { CountUp } from "./motion";
import { Card, ErrorNote, PageHeader, SectionHead, StatusPill } from "./ui";
import { GooBlock } from "./goo";

// Browser-only widgets: load them on the client.
const MilestoneGantt = dynamic(() => import("./gantt/milestone-gantt"), { ssr: false, loading: () => <GooBlock label="Loading timeline" /> });
const ContractGrids = dynamic(() => import("./grid/contract-grids").then((m) => m.ContractGrids), { ssr: false });

const WORKING = ["submitted", "releasing", "release_pending"];

export function ContractScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [view, setView] = useState<ContractView | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  // Cards the viewer opened or closed by hand; untouched cards follow the next move.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const load = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let ignore = false;
    api<ContractView>(`/api/contracts/${id}`)
      .then((v) => {
        if (!ignore) setView(v);
      })
      .catch((e: Error) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id, revision]);

  // While the checker or PayPal is working, poll for the result.
  useEffect(() => {
    if (!view?.milestones.some((m) => WORKING.includes(m.status))) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [view, load]);

  useEffect(() => {
    api<PublicConfig>("/api/config").then(setConfig).catch(() => undefined);
    api<Session>("/api/session").then((s) => setViewerId(s.viewer?.id ?? null)).catch(() => undefined);
  }, []);

  const proposeDue = useCallback(
    (milestoneId: string, dueAt: Date) => {
      api(`/api/contracts/${id}/change-requests`, { body: { kind: "schedule", milestoneId, dueAt: dueAt.toISOString() } })
        .then(() => setNotice("Schedule change proposed. The other party has to accept it; until then the timeline keeps the agreed dates."))
        .catch((e: Error) => setError(e.message))
        .finally(load);
    },
    [id, load],
  );

  if (error && !view) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Contract" title="Can't open this one" />
        <ErrorNote error={error} />
        <Link href="/contracts" className="label inline-block py-2 text-muted hover:text-butter">← Back to your contracts</Link>
      </div>
    );
  }
  if (!view) return <GooBlock label="Loading contract" />;
  const { contract, role } = view;

  const paidMinor = sumWhere(view.milestones, PAID);
  const heldMinor = sumWhere(view.milestones, HELD);
  const toFundMinor = sumWhere(view.milestones, UNFUNDED);
  const move = nextMove(view);
  const isOpen = (milestoneId: string) => toggled[milestoneId] ?? milestoneId === move.milestone?.id;
  const pick = (milestoneId: string) => {
    setToggled((t) => ({ ...t, [milestoneId]: true }));
    // Wait a frame so the card has started opening before the page scrolls to it.
    requestAnimationFrame(() => document.getElementById(`m-${milestoneId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className="space-y-10">
      <nav aria-label="Contract" className="label flex flex-wrap items-center justify-between gap-2 text-muted">
        <Link href="/contracts" className="py-2 hover:text-butter">← Contracts</Link>
        <span className="flex gap-4">
          <Link href={`/contracts/${id}/dispute-pack`} className="py-2 hover:text-butter">Dispute pack</Link>
          <Link href="/ledger" className="py-2 hover:text-butter">Ledger</Link>
        </span>
      </nav>

      <section className="rise flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3.5">
          <span className="label text-peach">
            {view.clientName} → {view.freelancer?.name}{view.freelancer?.kind === "agent" ? " (AI agent)" : ""} · {contract.tier.name} tier
            {contract.standing.verifiedMilestones > 0 ? ` · VRS ${contract.standing.vrs}` : ""}
          </span>
          <h1 className="cond max-w-4xl text-[clamp(52px,8vw,112px)] font-extrabold leading-[0.86]">{contract.title}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={contract.status} />
            <span className="label text-subtle">You are the {role.replace("_", " ")}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <span className="money text-[clamp(56px,7vw,84px)] leading-[0.9] text-butter"><CountUp minor={paidMinor} /></span>
          <span className="label text-subtle">released of {formatMoney(contract.subtotalMinor)} · + {formatMoney(contract.feeMinor)} fee</span>
        </div>
      </section>

      <MoneyStage view={view} heldMinor={heldMinor} paidMinor={paidMinor} toFundMinor={toFundMinor} onPick={pick} />

      <section aria-label="Next move" className="flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-line py-5">
        <span className="label flex items-center gap-2.5 text-peach">
          <span aria-hidden className={`size-2.5 rounded-full ${move.yours ? "beat bg-butter" : "bg-wine"}`} />
          {move.yours ? "Your move" : "Next"}
        </span>
        <p key={move.text} className="cond rise min-w-0 flex-1 text-[clamp(26px,3.4vw,40px)] font-bold leading-none">{move.text}</p>
        {move.milestone && (
          <button
            type="button"
            onClick={() => pick(move.milestone!.id)}
            className={`jelly inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-bold ${move.yours ? "bg-butter text-plum hover:bg-white" : "border border-paper/35 hover:border-paper/70"}`}
          >
            Open {stopNo(move.milestone)} <span aria-hidden>↓</span>
          </button>
        )}
      </section>

      <p className="label leading-relaxed text-subtle [overflow-wrap:anywhere]">
        Price locked at signing · deliveries accepted from {contract.contractedOrigins.join(", ")}
        {contract.currency !== "INR" && config ? ` · PayPal holds funds in ${contract.currency} at ₹${config.inrPerUsd}/$` : ""}
        {config?.aiMode === "mock" ? " · AI in demo mode (no API key)" : ""}
      </p>

      <ErrorNote error={error} />
      {notice && <p className="flex items-start gap-3 rounded-2xl border border-peach/30 bg-peach/10 px-4 py-3 text-[15px]"><span aria-hidden className="mt-1.5 size-2.5 flex-none rounded-full bg-peach" />{notice}</p>}

      <OfferPanel view={view} onChange={load} onError={setError} />

      <section className="space-y-5">
        <SectionHead title="Milestones" note={`${view.milestones.length} stops`} />
        <ol className="space-y-3">
        {view.milestones.map((m) => (
          <MilestoneCard
            key={m.id}
            m={m}
            role={role}
            contractStatus={contract.status}
            workerIsAgent={view.freelancer?.kind === "agent"}
            config={config}
            open={isOpen(m.id)}
            onToggle={() => setToggled((t) => ({ ...t, [m.id]: !isOpen(m.id) }))}
            onChange={load}
            onError={setError}
          />
        ))}
        </ol>
      </section>

      <section className="space-y-5">
        <SectionHead title="Timeline" note="Drag or stretch a milestone to propose a new due date" />
        <Card className="p-3 sm:p-4">
          <MilestoneGantt view={view} onProposeDue={proposeDue} />
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <MessagesPanel view={view} onChange={load} onError={setError} />
        <ChangeRequestsPanel view={view} viewerId={viewerId} onChange={load} onError={setError} />
      </div>

      <ContractGrids view={view} />
      <AuditTrail view={view} />
    </div>
  );
}

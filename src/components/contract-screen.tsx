"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { api, type PublicConfig, type Session } from "./api";
import { MilestoneCard } from "./contract/milestone-card";
import { AuditTrail, ChangeRequestsPanel, MessagesPanel, OfferPanel } from "./contract/panels";
import { Card, ErrorNote, StatusPill } from "./ui";

// Browser-only widgets: load them on the client.
const MilestoneGantt = dynamic(() => import("./gantt/milestone-gantt"), { ssr: false, loading: () => <p className="text-sm text-zinc-500">Loading timeline…</p> });
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

  if (error && !view) return <ErrorNote error={error} />;
  if (!view) return <p className="text-sm text-zinc-500">Loading…</p>;
  const { contract, role } = view;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href="/contracts" className="text-zinc-500 hover:underline">← Contracts</Link>
          <span className="flex gap-3">
            <Link href={`/contracts/${id}/dispute-pack`} className="text-zinc-600 underline dark:text-zinc-400">Dispute pack</Link>
            <Link href="/ledger" className="text-zinc-600 underline dark:text-zinc-400">Ledger</Link>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{contract.title}</h1>
          <StatusPill status={contract.status} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {view.clientName} → {view.freelancer?.name}{view.freelancer?.kind === "agent" ? " (AI agent)" : ""} · {contract.tier.name} tier
          {contract.standing.verifiedMilestones > 0 ? ` (VRS ${contract.standing.vrs})` : ""} · price locked at signing ·{" "}
          {formatMoney(contract.subtotalMinor)} + {formatMoney(contract.feeMinor)} fee = <strong>{formatMoney(contract.totalMinor)}</strong>
        </p>
        <p className="text-xs text-zinc-500">
          You are the {role.replace("_", " ")}. Deliveries accepted from {contract.contractedOrigins.join(", ")}.
          {contract.currency !== "INR" && config ? ` PayPal holds funds in ${contract.currency} at ₹${config.inrPerUsd}/$.` : ""}
          {config?.aiMode === "mock" ? " AI is in demo mode (no API key)." : ""}
        </p>
      </div>

      <ErrorNote error={error} />
      {notice && <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">{notice}</p>}

      <OfferPanel view={view} onChange={load} onError={setError} />

      <Card className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Timeline</h2>
          <p className="text-xs text-zinc-500">Bryntum Gantt · drag or stretch a milestone to propose a new due date</p>
        </div>
        <MilestoneGantt view={view} onProposeDue={proposeDue} />
      </Card>

      <ol className="space-y-4">
        {view.milestones.map((m) => (
          <MilestoneCard
            key={m.id}
            m={m}
            role={role}
            contractStatus={contract.status}
            workerIsAgent={view.freelancer?.kind === "agent"}
            config={config}
            onChange={load}
            onError={setError}
          />
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-2">
        <MessagesPanel view={view} onChange={load} onError={setError} />
        <ChangeRequestsPanel view={view} viewerId={viewerId} onChange={load} onError={setError} />
      </div>

      <ContractGrids view={view} />
      <AuditTrail view={view} />
    </div>
  );
}

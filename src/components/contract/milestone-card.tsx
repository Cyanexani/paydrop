"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { MaterialOption } from "@/lib/materials/channel3";
import type { ContractView } from "@/server/contracts";
import { api, type PublicConfig } from "../api";
import { PayPalFundButton } from "../paypal-button";
import { Button, Card, StatusPill, TONE_COLOR, inputClass, statusTone } from "../ui";
import { GooLoader } from "../goo";
import { useAction } from "./use-action";

type Milestone = ContractView["milestones"][number];
type Role = ContractView["role"];

const OUTCOME = {
  pass: { color: "#fff7ad", label: "passed" },
  fail: { color: "#ff6b6b", label: "failed" },
  couldnt_check: { color: "#c7a9bc", label: "couldn't check" },
} as const;

export function MilestoneCard({
  m,
  role,
  contractStatus,
  workerIsAgent,
  config,
  onChange,
  onError,
}: {
  m: Milestone;
  role: Role;
  contractStatus: string;
  workerIsAgent: boolean;
  config: PublicConfig | null;
  onChange: () => void;
  onError: (message: string | null) => void;
}) {
  const { busy, run } = useAction(onChange, onError);
  const [evidenceUrl, setEvidenceUrl] = useState("https://");
  const [actualHours, setActualHours] = useState("");
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState("");
  const [counterReason, setCounterReason] = useState("");
  const [payLink, setPayLink] = useState<string | null>(null);
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialResults, setMaterialResults] = useState<MaterialOption[] | null>(null);
  const isClient = role === "client";
  const isWorker = !isClient;
  const settled = ["released", "payout_pending", "paid_out"].includes(m.status);
  const canFund = isClient && ["accepted", "funding", "release_failed"].includes(m.status) && m.canFundNow;
  const openCounter = m.negotiations.find((n) => n.status === "open");
  const lastRun = m.checkRuns[0];

  async function searchMaterials(e: React.FormEvent) {
    e.preventDefault();
    const res = await run<{ results: MaterialOption[]; mode: string }>("materials-search", `/api/milestones/${m.id}/materials-search`, { query: materialQuery });
    setMaterialResults(res?.results ?? []);
  }

  return (
    <li>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <span className="money text-[52px] leading-[0.9]" style={{ color: TONE_COLOR[statusTone(m.status)] }}>
            {String(m.position + 1).padStart(2, "0")}
          </span>
          <div className="min-w-[min(100%,220px)] flex-1 space-y-1.5">
            <h3 className="cond text-[30px] font-bold leading-none">
              {m.draft.title}
              {m.kind === "change_order" && <span className="chip ml-3 align-middle text-[11px]"><span className="sw size-3" style={{ background: "#e6b9f8" }} />Change order</span>}
            </h3>
            <p className="text-[15px] leading-relaxed text-muted">{m.draft.description}</p>
            {m.dueAt && <p className="label text-subtle">Due {new Date(m.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="money text-[36px] leading-none">{formatMoney(m.priceMinor)}</span>
            <StatusPill status={m.status} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="label mb-2 text-peach">Acceptance criteria</h4>
            <ul className="space-y-2 text-[15px]">
              {m.draft.criteria.map((c, i) => {
                const r = m.lastCheck?.results.find((x) => x.criterionId === `c${i + 1}`);
                return (
                  <li key={c.text} className="relative pl-6">
                    <span aria-hidden className="absolute left-0 top-1.5 size-3 rounded-full" style={{ background: r ? OUTCOME[r.outcome].color : "#5a3550" }} />
                    {r && <span className="sr-only">{OUTCOME[r.outcome].label}: </span>}
                    {c.text}
                    {c.method === "client_judged" && <span className="text-xs text-zinc-500"> (client-judged)</span>}
                    {r?.note && <span className="block pl-6 text-xs text-zinc-500">{r.note}</span>}
                  </li>
                );
              })}
            </ul>
            {lastRun && (
              <p className="mt-2 text-xs text-zinc-500">
                Check attempt {lastRun.attempt} · {lastRun.mode === "kernel" ? "Kernel cloud browser" : lastRun.mode === "local" ? "local browser" : "reachability only"}
                {lastRun.replayUrl && (
                  <>
                    {" · "}
                    <a href={lastRun.replayUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">Watch replay</a>
                  </>
                )}
              </p>
            )}
            {m.status === "submitted" && <GooLoader kind="orbit" size={14} label="The checker is testing the delivery in a browser" className="mt-3" />}
          </div>
          <div className="space-y-2">
            <div className="rounded-2xl bg-well p-4 font-mono text-xs leading-relaxed">
              <div className="font-semibold">{m.receipt.title}</div>
              {m.receipt.lines.map((l) => (
                <div key={l.text}>  {l.text}{l.amountMinor !== null ? ` = ${formatMoney(l.amountMinor)}` : ""}</div>
              ))}
              <div className="text-zinc-500">  {m.receipt.fairBand}</div>
              <div className="mt-2 text-zinc-500">
                Client funds {formatMoney(m.fundMinor, m.chargeCurrency)} · freelancer receives {formatMoney(m.payoutMinor, m.chargeCurrency)}
                {m.split && m.split.length > 1 ? ` split ${m.split.map((s) => `${s.name} ${s.bps / 100}%`).join(", ")}` : ""}
              </div>
            </div>
            {m.materials.length > 0 && (
              <ul className="text-xs text-zinc-600 dark:text-zinc-400">
                {m.materials.map((x) => (
                  <li key={x.id}>Materials: <a href={x.url} target="_blank" rel="noreferrer" className="underline">{x.title}</a> {formatMoney(x.priceMinor)}</li>
                ))}
              </ul>
            )}
            {m.payouts.length > 0 && (
              <ul className="text-xs text-zinc-600 dark:text-zinc-400">
                {m.payouts.map((p) => (
                  <li key={p.id}>Payout to {p.name}: {formatMoney(p.amountMinor, p.currency)} · {p.status}{p.failure ? ` (${p.failure})` : ""}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {m.authorizationHealth !== "none" && m.authorizationExpiresAt && !settled && !["voided"].includes(m.status) && (
          <p className="text-xs text-zinc-500">PayPal hold: {m.authorizationHealth.replaceAll("_", " ")}, expires {new Date(m.authorizationExpiresAt).toLocaleDateString("en-IN")}.</p>
        )}

        {/* Negotiation (before the contract is accepted) */}
        {contractStatus === "offered" && (
          <div className="space-y-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            {m.negotiations.map((n) => (
              <p key={n.id} className="text-zinc-600 dark:text-zinc-400">
                Counter-offer {n.round}: {formatMoney(n.priceMinor)} ({n.fair ? "inside the fair band" : "outside the band"}) · {n.status}
                {n.reason ? ` — “${n.reason}”` : ""}
                {n.aiEstimate ? ` · AI re-estimate ${n.aiEstimate.likely} h → ${formatMoney(n.aiEstimate.suggestedMinor)}` : ""}
              </p>
            ))}
            {isClient && openCounter && (
              <div className="flex gap-2">
                <Button disabled={!!busy} onClick={() => run("na", `/api/negotiations/${openCounter.id}/accept`)}>Accept {formatMoney(openCounter.priceMinor)}</Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => run("nr", `/api/negotiations/${openCounter.id}/reject`)}>Keep {formatMoney(m.priceMinor)}</Button>
              </div>
            )}
            {isWorker && !openCounter && m.negotiations.length < 2 && (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("counter", `/api/milestones/${m.id}/counter`, { priceMinor: Math.round(Number(counter) * 100), reason: counterReason || undefined });
                }}
              >
                <input className={`${inputClass} w-32`} inputMode="decimal" placeholder="₹ counter" value={counter} onChange={(e) => setCounter(e.target.value)} aria-label="Counter-offer in rupees" />
                <input className={`${inputClass} min-w-48 flex-1`} placeholder={`Reason (needed outside ${formatMoney(m.fairBand.lowMinor)}–${formatMoney(m.fairBand.highMinor)})`} value={counterReason} onChange={(e) => setCounterReason(e.target.value)} />
                <Button variant="secondary" type="submit" disabled={!!busy || !Number(counter)}>Counter</Button>
              </form>
            )}
          </div>
        )}

        {/* Change order acceptance by the freelancer */}
        {isWorker && m.status === "offered" && m.kind === "change_order" && (
          <div className="flex items-center gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="flex-1 text-sm">The client accepted this change order. Agree to do it?</p>
            <Button disabled={!!busy} onClick={() => run("accept", `/api/milestones/${m.id}/accept`)}>Accept change order</Button>
          </div>
        )}

        {/* Materials (freelancer, before funding) */}
        {isWorker && ["offered", "accepted"].includes(m.status) && (
          <details className="border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Add materials to this milestone&apos;s budget (Channel3)</summary>
            <form onSubmit={searchMaterials} className="mt-2 flex gap-2">
              <input className={`${inputClass} flex-1`} value={materialQuery} onChange={(e) => setMaterialQuery(e.target.value)} placeholder="e.g. ring light, tripod, domain" />
              <Button variant="secondary" type="submit" disabled={!!busy || materialQuery.trim().length < 2}>Search</Button>
            </form>
            {materialResults && (
              <ul className="mt-2 space-y-1">
                {materialResults.length === 0 && <li className="text-zinc-500">No matches.</li>}
                {materialResults.map((r) => (
                  <li key={r.productId} className="flex items-center justify-between gap-2">
                    <span>{r.title} · {r.currency} {r.price.toLocaleString("en-IN")} · {r.merchant}</span>
                    <Button variant="secondary" disabled={!!busy} onClick={() => run("material", `/api/milestones/${m.id}/materials`, { productId: r.productId })}>Add</Button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}

        {/* Funding (client) */}
        {canFund && (
          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-sm">Fund this milestone. PayPal holds the money; nothing is taken until you approve verified work.</p>
            {config?.paypalClientId ? (
              <div className="flex flex-wrap items-center gap-3">
                <PayPalFundButton
                  clientId={config.paypalClientId}
                  currency={m.chargeCurrency}
                  createOrder={async () => (await api<{ orderId: string }>(`/api/milestones/${m.id}/order`, { body: {} })).orderId}
                  onApprove={async (orderId) => {
                    await run("authorize", `/api/milestones/${m.id}/authorize`, { orderId });
                  }}
                  onCancel={() => void run("abandon", `/api/milestones/${m.id}/abandon`)}
                  onError={(msg) => onError(msg)}
                />
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  onClick={async () => setPayLink((await run<{ approveUrl: string | null }>("link", `/api/milestones/${m.id}/pay-link`))?.approveUrl ?? null)}
                >
                  Get a payment link
                </Button>
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">PayPal isn&apos;t configured yet: add sandbox keys to .env.local.</p>
            )}
            {payLink && (
              <p className="break-all text-xs">
                Send this link (WhatsApp, email): <a className="text-emerald-700 underline dark:text-emerald-400" href={payLink}>{payLink}</a>
              </p>
            )}
          </div>
        )}
        {isClient && m.status === "accepted" && !m.canFundNow && <p className="text-sm text-zinc-500">Funds after the previous milestone is released.</p>}
        {isWorker && m.status === "accepted" && <p className="text-sm text-zinc-500">Don&apos;t start until the client funds this milestone.</p>}

        {/* Delivery (freelancer or agent) */}
        {isWorker && ["funded", "changes_requested", "needs_review"].includes(m.status) && (
          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {workerIsAgent && role === "agent_owner" && ["funded", "changes_requested"].includes(m.status) ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-sm">BuildBot builds this milestone, hosts it, and submits it for checking. It&apos;s paid only if every criterion is verified.</p>
                <Button disabled={!!busy} onClick={() => run("agent", `/api/milestones/${m.id}/agent-run`)}>{busy === "agent" ? "BuildBot is building…" : "Run BuildBot"}</Button>
              </div>
            ) : (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("submit", `/api/milestones/${m.id}/submit`, { evidenceUrl, actualHours: Number(actualHours) || undefined });
                }}
              >
                <input className={`${inputClass} min-w-64 flex-1`} type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} aria-label="Delivered URL" />
                <input className={`${inputClass} w-32`} inputMode="decimal" placeholder="Hours spent" value={actualHours} onChange={(e) => setActualHours(e.target.value)} aria-label="Hours actually spent" />
                <Button type="submit" disabled={!!busy}>{busy === "submit" ? "Submitting…" : "Submit for checking"}</Button>
              </form>
            )}
            {m.delivery && (
              <p className="text-xs text-zinc-500">Latest agent build: {new Date(m.delivery.createdAt).toLocaleString("en-IN")}</p>
            )}
          </div>
        )}
        {isWorker && m.status === "changes_requested" && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("challenge", `/api/milestones/${m.id}/challenge`, { reason });
            }}
          >
            <input className={`${inputClass} min-w-64 flex-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the check wrong?" />
            <Button variant="secondary" type="submit" disabled={!!busy || !reason.trim()}>Challenge</Button>
          </form>
        )}

        {/* Release (client) */}
        {isClient && (m.status === "verified" || m.status === "needs_review") && (
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="flex-1 text-sm">
              {m.status === "verified" ? "Every criterion passed. Approve to release payment (it auto-releases after 72 hours)." : "The checker couldn't verify everything. Review the delivery and decide."}
            </p>
            <Button disabled={!!busy} onClick={() => run("approve", `/api/milestones/${m.id}/approve`)}>{busy === "approve" ? "Releasing…" : "Approve and release"}</Button>
            <Button variant="danger" disabled={!!busy} onClick={() => { const r = prompt("What's wrong with the delivery?"); if (r) void run("dispute", `/api/milestones/${m.id}/dispute`, { reason: r }); }}>Dispute</Button>
          </div>
        )}
        {isClient && settled && (
          <div className="flex items-center gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            {m.rating ? (
              <span>You rated this {"★".repeat(m.rating)}</span>
            ) : (
              <>
                <span>Rate the work:</span>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} className="text-lg text-amber-500 hover:scale-110" aria-label={`${s} stars`} disabled={!!busy} onClick={() => run("rate", `/api/milestones/${m.id}/rate`, { stars: s })}>★</button>
                ))}
              </>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

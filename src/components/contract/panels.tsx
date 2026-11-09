"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { Button, Card, StatusPill, inputClass } from "../ui";
import { useAction } from "./use-action";

const VERDICT: Record<string, { label: string; cls: string }> = {
  in_scope: { label: "In scope", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  out_of_scope: { label: "Out of scope → change order", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  unclear: { label: "Unclear", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  not_a_request: { label: "Not a request", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export function MessagesPanel({ view, onChange, onError }: { view: ContractView; onChange: () => void; onError: (m: string | null) => void }) {
  const { busy, run } = useAction(onChange, onError);
  const [body, setBody] = useState("");
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Messages</h2>
        <p className="text-xs text-zinc-500">The client&apos;s requests are checked against the contract. WhatsApp and email come in through Zapier.</p>
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
        {view.messages.length === 0 && <li className="text-zinc-500">No messages yet.</li>}
        {view.messages.map((m) => (
          <li key={m.id} className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>{m.sender}{m.channel === "zapier" ? " · via Zapier" : ""}</span>
              <span>{new Date(m.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <p>{m.body}</p>
            {m.scope && (
              <p className="mt-1 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-medium ${VERDICT[m.scope.verdict]?.cls ?? ""}`}>{VERDICT[m.scope.verdict]?.label ?? m.scope.verdict}</span>{" "}
                <span className="text-zinc-500">{m.scope.reasoning} (search: {m.scope.searchMode})</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {view.contract.status !== "cancelled" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("msg", `/api/contracts/${view.contract.id}/messages`, { body }).then(() => setBody(""));
          }}
        >
          <input className={`${inputClass} flex-1`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={view.role === "client" ? "e.g. Can you also add a blog?" : "Write a message"} />
          <Button type="submit" disabled={!!busy || !body.trim()}>{busy ? "Checking…" : "Send"}</Button>
        </form>
      )}
    </Card>
  );
}

export function ChangeRequestsPanel({ view, viewerId, onChange, onError }: { view: ContractView; viewerId: string | null; onChange: () => void; onError: (m: string | null) => void }) {
  const { busy, run } = useAction(onChange, onError);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", criteria: "", o: "", m: "", p: "", days: "3" });
  const isClient = view.role === "client";
  const crs = view.changeRequests;
  void viewerId;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Change requests</h2>
          <p className="text-xs text-zinc-500">Out-of-scope work becomes a priced change order; dragging a deadline on the timeline proposes a schedule change.</p>
        </div>
        {!isClient && view.contract.status === "active" && <Button variant="secondary" onClick={() => setOpen(!open)}>Raise one</Button>}
      </div>
      {open && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("raise", `/api/contracts/${view.contract.id}/change-requests`, {
              kind: "work",
              title: form.title,
              description: form.description,
              skill: "web_dev",
              complexityTags: ["standard"],
              durationDays: Number(form.days),
              estimate: { optimistic: Number(form.o), likely: Number(form.m), pessimistic: Number(form.p) },
              criteria: form.criteria.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, method: "browser" })),
            }).then((r) => r && setOpen(false));
          }}
        >
          <input className={inputClass} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={inputClass} placeholder="Days" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          <textarea className={`${inputClass} sm:col-span-2`} placeholder="What the client asked for" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className={`${inputClass} sm:col-span-2`} placeholder="Acceptance criteria, one per line" value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <input className={inputClass} placeholder="Optimistic h" value={form.o} onChange={(e) => setForm({ ...form, o: e.target.value })} />
            <input className={inputClass} placeholder="Likely h" value={form.m} onChange={(e) => setForm({ ...form, m: e.target.value })} />
            <input className={inputClass} placeholder="Pessimistic h" value={form.p} onChange={(e) => setForm({ ...form, p: e.target.value })} />
          </div>
          <Button type="submit" disabled={!!busy}>Propose change order</Button>
        </form>
      )}
      <ul className="space-y-2 text-sm">
        {crs.length === 0 && <li className="text-zinc-500">None.</li>}
        {crs.map((c) => (
          <li key={c.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{c.title}</span>
              <span className="text-xs text-zinc-500">
                {c.source === "detector" ? "flagged by the scope detector" : c.source === "gantt" ? "schedule change" : "raised by the freelancer"} · {c.status.replace("_", " ")}
                {c.priceMinor !== null ? ` · ${formatMoney(c.priceMinor)} + ${formatMoney(c.feeMinor ?? 0)} fee` : ""}
              </span>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">{c.description}</p>
            {c.status === "proposed" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {c.source === "gantt" ? (
                  <>
                    <Button disabled={!!busy} onClick={() => run("cra", `/api/change-requests/${c.id}/accept`)}>Accept new date</Button>
                    <Button variant="secondary" disabled={!!busy} onClick={() => run("crd", `/api/change-requests/${c.id}/decline`)}>Decline</Button>
                  </>
                ) : (
                  <>
                    {isClient && <Button disabled={!!busy} onClick={() => run("cra", `/api/change-requests/${c.id}/accept`)}>Accept and add milestone</Button>}
                    {isClient && <Button variant="secondary" disabled={!!busy} onClick={() => run("crd", `/api/change-requests/${c.id}/decline`)}>Decline</Button>}
                    <Button variant="secondary" disabled={!!busy} onClick={() => run("cri", `/api/change-requests/${c.id}/in_scope`)}>It&apos;s in scope</Button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OfferPanel({ view, onChange, onError }: { view: ContractView; onChange: () => void; onError: (m: string | null) => void }) {
  const { busy, run } = useAction(onChange, onError);
  const isWorker = view.role !== "client";
  const [collab, setCollab] = useState({ name: "", email: "", pct: "" });
  const collaborators = view.contract.collaborators;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {view.contract.status === "offered"
            ? isWorker
              ? "Review the milestones. Counter-offer a price if needed, then accept to start."
              : "Waiting for the freelancer to accept (offers expire after 48 hours)."
            : `Contract ${view.contract.status}.`}
        </p>
        {isWorker && view.contract.status === "offered" && (
          <div className="flex gap-2">
            <Button disabled={!!busy} onClick={() => run("accept", `/api/contracts/${view.contract.id}/accept`)}>Accept contract</Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => run("decline", `/api/contracts/${view.contract.id}/decline`)}>Decline</Button>
          </div>
        )}
      </div>
      {(collaborators.length > 0 || (isWorker && ["offered", "active"].includes(view.contract.status))) && (
        <div className="border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          <h3 className="font-medium">Payout split</h3>
          <p className="text-xs text-zinc-500">
            Lead freelancer {100 - collaborators.reduce((a, c) => a + c.bps, 0) / 100}%
            {collaborators.map((c) => ` · ${c.name} ${c.bps / 100}%`).join("")}. Each milestone locks the split when it&apos;s funded.
          </p>
          {isWorker && ["offered", "active"].includes(view.contract.status) && (
            <form
              className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("collab", `/api/contracts/${view.contract.id}/collaborators`, {
                  collaborators: [...collaborators.map((c) => ({ name: c.name, paypalEmail: c.paypalEmail, bps: c.bps })), { name: collab.name, paypalEmail: collab.email, bps: Math.round(Number(collab.pct) * 100) }],
                }).then((r) => r && setCollab({ name: "", email: "", pct: "" }));
              }}
            >
              <input className={`${inputClass} w-40`} placeholder="Collaborator" value={collab.name} onChange={(e) => setCollab({ ...collab, name: e.target.value })} />
              <input className={`${inputClass} w-56`} placeholder="PayPal email" value={collab.email} onChange={(e) => setCollab({ ...collab, email: e.target.value })} />
              <input className={`${inputClass} w-20`} placeholder="%" value={collab.pct} onChange={(e) => setCollab({ ...collab, pct: e.target.value })} />
              <Button variant="secondary" type="submit" disabled={!!busy || !collab.name || !collab.email || !Number(collab.pct)}>Add</Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

export function AuditTrail({ view }: { view: ContractView }) {
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Audit trail</h2>
      {view.events.length === 0 ? (
        <p className="text-sm text-zinc-500">No events yet.</p>
      ) : (
        <ul className="space-y-1.5 font-mono text-xs">
          {view.events.map((e) => {
            const ms = view.milestones.find((x) => x.id === e.milestoneId);
            return (
              <li key={e.eventId} className="flex flex-wrap gap-x-3 text-zinc-600 dark:text-zinc-400">
                <span className="tabular-nums">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" })}</span>
                <span className="text-zinc-900 dark:text-zinc-100">{e.type}</span>
                <span>{ms ? `#${ms.position + 1}` : ""}</span>
                <StatusPill status={e.toStatus} />
                <span>by {e.actorKind}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { ContractView } from "@/server/contracts";
import { GooLoader } from "../goo";
import { Button, Card, StatusPill, inputClass } from "../ui";
import { useAction } from "./use-action";

const VERDICT: Record<string, { label: string; color: string }> = {
  in_scope: { label: "In scope", color: "var(--tone-paid)" },
  out_of_scope: { label: "Out of scope → change order", color: "var(--tone-lilac)" },
  unclear: { label: "Unclear", color: "var(--tone-check)" },
  not_a_request: { label: "Not a request", color: "var(--tone-neutral)" },
};

export function MessagesPanel({ view, onChange, onError }: { view: ContractView; onChange: () => void; onError: (m: string | null) => void }) {
  const { busy, run } = useAction(onChange, onError);
  const [body, setBody] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const count = view.messages.length;
  // Keep the newest message in view, like a chat.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [count]);
  const fromClient = (sender: string) => sender.startsWith(view.clientName);
  return (
    <Card className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <h2 className="cond text-lg font-semibold">Messages</h2>
        <p className="text-sm text-subtle">The client&apos;s requests are checked against the contract. WhatsApp and email come in through Zapier.</p>
      </div>
      <ul ref={list} className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
        {count === 0 && <li className="label py-6 text-center text-subtle">No messages yet</li>}
        {view.messages.map((m) => {
          const mine = fromClient(m.sender) === (view.role === "client");
          const verdict = m.scope ? VERDICT[m.scope.verdict] : null;
          return (
            <li key={m.id} className={`bubble-in flex max-w-[88%] flex-col gap-1.5 ${mine ? "items-end self-end [--origin:right_bottom]" : "items-start self-start"}`}>
              <p className={`px-4 py-3 text-[15px] leading-normal [overflow-wrap:anywhere] ${mine ? "rounded-[14px_14px_4px_14px] bg-[var(--c-bubble)]" : "rounded-[14px_14px_14px_4px] bg-well"}`}>{m.body}</p>
              {m.scope && (
                <p className={`flex flex-wrap items-center gap-2 text-xs text-subtle ${mine ? "justify-end text-right" : ""}`}>
                  <span className="chip whitespace-normal text-[11px]"><span className="sw size-3" style={{ background: verdict?.color ?? "var(--tone-neutral)" }} />{verdict?.label ?? m.scope.verdict}</span>
                  <span>{m.scope.reasoning}</span>
                </p>
              )}
              <span className="label text-[10px] text-subtle/80">
                {mine ? "You" : m.sender}{m.channel === "zapier" ? " · via Zapier" : ""} · {new Date(m.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          );
        })}
      </ul>
      {view.contract.status !== "cancelled" && (
        <form
          className="mt-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("msg", `/api/contracts/${view.contract.id}/messages`, { body }).then(() => setBody(""));
          }}
        >
          <input
            className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-[var(--c-input)] px-5 text-[15px] text-paper placeholder:text-subtle/70 focus:border-magenta focus:outline-none focus:ring-4 focus:ring-magenta/15"
            aria-label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={view.role === "client" ? "e.g. Can you also add a blog?" : "Write a message"}
          />
          <button type="submit" disabled={!!busy || !body.trim()} className="jelly min-h-10 rounded-lg bg-butter px-4 font-semibold text-plum disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <GooLoader kind="drip" size={9} label="Checking scope" showLabel={false} /> : "Send"}
          </button>
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
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="cond text-lg font-semibold">Change requests</h2>
          <p className="text-sm text-subtle">Out-of-scope work becomes a priced change order; dragging a deadline on the timeline proposes a schedule change.</p>
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
      <ul className="space-y-3 [overflow-wrap:anywhere]">
        {crs.length === 0 && <li className="label py-6 text-center text-subtle">None yet</li>}
        {crs.map((c) => (
          <li key={c.id} className="bubble-in space-y-2.5 rounded-xl border border-line-soft bg-well p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <strong className="text-[15px] font-semibold">{c.title}</strong>
              {c.priceMinor !== null && (
                <span className="flex items-baseline gap-2">
                  <span className="money text-xl leading-none">{formatMoney(c.priceMinor)}</span>
                  <span className="label text-subtle">+ {formatMoney(c.feeMinor ?? 0)} fee</span>
                </span>
              )}
            </div>
            <span className="chip whitespace-normal text-left text-[11px]">
              <span className={`sw size-3 ${c.status === "proposed" ? "sw-live" : ""}`} style={{ background: c.status === "proposed" ? "var(--tone-held)" : c.status === "accepted" ? "var(--tone-paid)" : "var(--tone-neutral)" }} />
              {c.source === "detector" ? "Flagged by the scope detector" : c.source === "gantt" ? "Schedule change" : "Raised by the freelancer"} · {c.status.replace("_", " ")}
            </span>
            <p className="text-sm leading-normal text-muted">{c.description}</p>
            {c.status === "proposed" && (
              <div className="flex flex-wrap gap-2 pt-1">
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
  const offered = view.contract.status === "offered";
  const canSplit = isWorker && ["offered", "active"].includes(view.contract.status);
  if (!offered && !canSplit && collaborators.length === 0) return null;
  const leadPct = 100 - collaborators.reduce((a, c) => a + c.bps, 0) / 100;
  return (
    <Card className="space-y-5">
      {offered && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="cond max-w-2xl text-xl font-semibold leading-[1.05]">
            {isWorker ? "Review the milestones. Counter-offer a price if needed, then accept to start." : "Waiting for the freelancer to accept. Offers expire after 48 hours."}
          </p>
          {isWorker && (
            <div className="flex gap-2">
              <Button disabled={!!busy} onClick={() => run("accept", `/api/contracts/${view.contract.id}/accept`)}>Accept contract</Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => run("decline", `/api/contracts/${view.contract.id}/decline`)}>Decline</Button>
            </div>
          )}
        </div>
      )}
      {(collaborators.length > 0 || canSplit) && (
        <div className={`space-y-3 ${offered ? "border-t border-line-soft pt-5" : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="label text-peach">Payout split</h3>
            <span className="label text-subtle">Each milestone locks the split when it&apos;s funded</span>
          </div>
          {/* One bar, split in proportion: the lead's share, then each collaborator's. */}
          <div className="flex h-3.5 gap-1 overflow-hidden rounded-full" aria-hidden>
            <span className="rounded-full bg-magenta transition-[flex-grow] duration-700" style={{ flexGrow: leadPct }} />
            {collaborators.map((c, i) => (
              <span key={c.name} className="rounded-full transition-[flex-grow] duration-700" style={{ flexGrow: c.bps / 100, background: i % 2 ? "var(--tone-paid)" : "var(--tone-check)" }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-2">
            <li className="chip"><span className="sw" style={{ background: "var(--tone-held)" }} />Lead freelancer {leadPct}%</li>
            {collaborators.map((c, i) => (
              <li key={c.name} className="chip"><span className="sw" style={{ background: i % 2 ? "var(--tone-paid)" : "var(--tone-check)" }} />{c.name} {c.bps / 100}%</li>
            ))}
          </ul>
          {canSplit && (
            <form
              className="flex flex-wrap gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                void run("collab", `/api/contracts/${view.contract.id}/collaborators`, {
                  collaborators: [...collaborators.map((c) => ({ name: c.name, paypalEmail: c.paypalEmail, bps: c.bps })), { name: collab.name, paypalEmail: collab.email, bps: Math.round(Number(collab.pct) * 100) }],
                }).then((r) => r && setCollab({ name: "", email: "", pct: "" }));
              }}
            >
              <input className={`${inputClass} w-40!`} placeholder="Collaborator" aria-label="Collaborator name" value={collab.name} onChange={(e) => setCollab({ ...collab, name: e.target.value })} />
              <input className={`${inputClass} w-56!`} placeholder="PayPal email" aria-label="Collaborator PayPal email" value={collab.email} onChange={(e) => setCollab({ ...collab, email: e.target.value })} />
              <input className={`${inputClass} w-20!`} placeholder="%" aria-label="Collaborator share in percent" value={collab.pct} onChange={(e) => setCollab({ ...collab, pct: e.target.value })} />
              <Button variant="secondary" type="submit" disabled={!!busy || !collab.name || !collab.email || !Number(collab.pct)}>Add</Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

const TRAIL_PREVIEW = 6;

/** The event log: the latest few lines, with the rest one tap away. */
export function AuditTrail({ view }: { view: ContractView }) {
  const [all, setAll] = useState(false);
  const events = all ? view.events : view.events.slice(0, TRAIL_PREVIEW);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="cond text-lg font-semibold">Audit trail</h2>
        <span className="label text-subtle">{view.events.length} events · every money move is logged</span>
      </div>
      {view.events.length === 0 ? (
        <p className="label py-4 text-center text-subtle">No events yet</p>
      ) : (
        <ol className="font-mono text-xs">
          {events.map((e, i) => {
            const ms = view.milestones.find((x) => x.id === e.milestoneId);
            return (
              <li key={e.eventId} className="rise grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-line-soft py-2.5 first:border-0 sm:grid-cols-[9.5rem_2.5rem_minmax(0,1fr)_auto_auto]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <span className="text-subtle">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="text-magenta max-sm:text-right">{ms ? `#${String(ms.position + 1).padStart(2, "0")}` : ""}</span>
                <span className="text-paper">{e.type.replaceAll("_", " ").toLowerCase()}</span>
                <span className="text-subtle max-sm:hidden">by {e.actorKind.replaceAll("_", " ")}</span>
                <StatusPill status={e.toStatus} />
              </li>
            );
          })}
        </ol>
      )}
      {view.events.length > TRAIL_PREVIEW && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="label py-2 text-peach hover:text-butter">
          {all ? "Show fewer" : `Show all ${view.events.length}`}
        </button>
      )}
    </Card>
  );
}

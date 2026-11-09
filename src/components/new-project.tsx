"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { SKILL_LABELS } from "@/lib/pricing/config";
import type { QuoteView } from "@/server/quotes";
import { api } from "./api";
import { Button, Card, ErrorNote, inputClass } from "./ui";
import { GooLoader } from "./goo";

const EXAMPLE =
  "Website for my dance studio, Jaya Dance & Fitness: home, classes and contact pages, online class booking with a deposit through PayPal, a photo gallery of our shows, and live on our own domain with good SEO. We have a logo and photos.";

export function NewProject() {
  const router = useRouter();
  const [brief, setBrief] = useState(EXAMPLE);
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [budget, setBudget] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setQuote(null);
    try {
      const budgetMinor = budget.trim() ? Math.round(Number(budget) * 100) : undefined;
      if (budgetMinor !== undefined && !(budgetMinor >= 0)) throw new Error("Budget must be a number");
      setQuote(await api<QuoteView>("/api/quotes", { body: { brief, deadlineDays, budgetMinor } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="animate-rise font-display text-4xl font-bold tracking-tight sm:text-5xl">New project</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Describe it in plain language. The AI scopes it; the price is computed, not guessed.</p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What do you need?</span>
            <textarea className={`${inputClass} min-h-32`} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={5000} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Deadline (days from signing)</span>
              <input className={inputClass} type="number" min={1} max={365} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Budget in ₹ (optional)</span>
              <input className={inputClass} inputMode="decimal" placeholder="e.g. 18000" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy}>{busy ? <><GooLoader size={20} label="Scoping" /> Scoping…</> : "Scope and price it"}</Button>
        </form>
      </Card>

      {quote && <QuoteResult quote={quote} onContract={(id) => router.push(`/contracts/${id}`)} />}
    </div>
  );
}

function QuoteResult({ quote, onContract }: { quote: QuoteView; onContract: (id: string) => void }) {
  const { scope, meta } = quote;
  const mock = meta.mode === "mock";
  const badge = (
    <p className="text-xs text-zinc-500">
      Scoped by {mock ? "the demo scoper (no API key set)" : `${meta.model}, prompt ${meta.promptVersion}`}
      {meta.attempts > 1 ? ` · ${meta.attempts} attempts` : ""}
    </p>
  );

  if (scope.status === "needs_info") {
    return (
      <Card className="space-y-3">
        <h2 className="font-semibold">A few questions before pricing</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">{scope.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Add the answers to your brief and scope it again.</p>
        {badge}
      </Card>
    );
  }
  if (scope.status === "refused") {
    return <Card className="space-y-2"><h2 className="font-semibold">We can&apos;t take this project</h2><p className="text-sm">{scope.reason}</p>{badge}</Card>;
  }
  if (scope.status === "manual_quote") {
    return <Card className="space-y-2"><h2 className="font-semibold">This one needs a manual quote</h2><p className="text-sm">{scope.reason}</p><p className="text-sm text-zinc-600 dark:text-zinc-400">No money moves on an unvalidated AI quote.</p>{badge}</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{scope.projectTitle}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{scope.summary}</p>
          {badge}
        </div>
        <ol className="space-y-4">
          {scope.milestones.map((m, i) => (
            <li key={m.title} className="border-t border-zinc-200 pt-4 first:border-0 first:pt-0 dark:border-zinc-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{i + 1}. {m.title}</h3>
                <span className="text-xs text-zinc-500">
                  {SKILL_LABELS[m.skill]} · {m.estimate.optimistic}/{m.estimate.likely}/{m.estimate.pessimistic} hrs · {m.durationDays} days
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{m.description}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {m.criteria.map((c) => (
                  <li key={c.text} className="flex gap-2">
                    <span aria-hidden className="text-emerald-700 dark:text-emerald-400">✓</span>
                    <span>{c.text}{c.method === "client_judged" ? <em className="text-zinc-500"> (client-judged)</em> : null}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>

      <PricingSection quote={quote} onContract={onContract} />
    </div>
  );
}

function PricingSection({ quote, onContract }: { quote: QuoteView; onContract: (id: string) => void }) {
  const [deliveryUrl, setDeliveryUrl] = useState("https://");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pricing } = quote;

  if (pricing.status === "not_priced") return null;
  if (pricing.status === "error") return <Card><ErrorNote error={pricing.message} /></Card>;
  if (pricing.status === "needs_info") {
    return <Card className="text-sm">The estimate range is too wide to price fairly (pessimistic is {pricing.ratio.toFixed(1)}× optimistic). Add detail to the brief.</Card>;
  }
  if (pricing.status === "infeasible") {
    return (
      <Card className="text-sm">
        {pricing.reason === "deadline_passed" ? "That deadline has already passed." : `${pricing.expectedHours.toFixed(0)} hours of work can't be done in ${pricing.availableDays} days.`}{" "}
        The earliest workable deadline is {pricing.earliestDays} days.
      </Card>
    );
  }

  async function offer(freelancerId: string) {
    setBusyId(freelancerId);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/contracts", { body: { quoteId: quote.id, freelancerId, deliveryUrl, allowParallel: false } });
      onContract(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  }

  const base = pricing.base;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Choose a freelancer</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Everyone earns the same {formatMoney(base.baseSubtotalMinor)} base for this work ({base.expectedHours.toFixed(1)} expected hours
          {base.urgency.multiplier > 1 ? `, ×${base.urgency.multiplier.toFixed(2)} urgency` : ""}). A premium is paid only for verified track record. The 5% platform fee is shown separately.
        </p>
      </div>

      <label className="block max-w-xl space-y-1.5">
        <span className="text-sm font-medium">Where will the work be delivered?</span>
        <input className={inputClass} type="url" value={deliveryUrl} onChange={(e) => setDeliveryUrl(e.target.value)} placeholder="https://your-site.example" />
        <span className="block text-xs text-zinc-500">The checker only accepts submissions from this site or repo.</span>
      </label>
      <ErrorNote error={error} />

      <div className="grid gap-4 md:grid-cols-2">
        {pricing.candidates.map(({ candidate, quote: q, receipts }) => (
          <Card key={candidate.id} className="flex flex-col gap-3">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{candidate.name}{candidate.kind === "agent" ? " · AI agent" : ""}</h3>
                <span className="text-lg font-semibold tabular-nums">{formatMoney(q.subtotalMinor)}</span>
              </div>
              <p className="text-xs text-zinc-500">{candidate.why}</p>
              <p className="mt-1 text-xs text-zinc-500 tabular-nums">+ {formatMoney(q.feeMinor)} platform fee = {formatMoney(q.totalMinor)} total</p>
              {q.budget && !q.budget.withinBudget && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {formatMoney(q.budget.shortfallMinor)} over budget. Options: {q.budget.options.map((o) => o.replace("_", " ")).join(", ")}.
                </p>
              )}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Price receipts</summary>
              <div className="mt-2 space-y-3">
                {receipts.map((r) => (
                  <div key={r.title} className="rounded-md bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:bg-zinc-950">
                    <div className="font-semibold">{r.title}</div>
                    {r.lines.map((l) => (
                      <div key={l.text}>  {l.text}{l.amountMinor !== null ? ` = ${formatMoney(l.amountMinor)}` : ""}</div>
                    ))}
                    <div className="text-zinc-500">  {r.fairBand}</div>
                  </div>
                ))}
              </div>
            </details>
            <Button className="mt-auto" disabled={busyId !== null || !/^https:\/\/[^/]+\.[^/]+/.test(deliveryUrl)} onClick={() => offer(candidate.id)}>
              {busyId === candidate.id ? "Creating contract…" : `Offer to ${candidate.name.split(" ")[0]}`}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

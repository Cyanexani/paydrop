"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { SKILL_LABELS } from "@/lib/pricing/config";
import { api } from "./api";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import type { AgentCatalogView, PricedCandidate, QuoteView } from "@/server/quotes";
import { AgentCard, AgentModelPicker, useAgentQuote } from "./agent-quote";
import { GooLoader } from "./goo";
import { PresenceBadge } from "./presence";
import { Button, Card, ErrorNote, PageHeader, inputClass } from "./ui";

const EXAMPLE =
  "A website for my dance studio, Jaya Dance & Fitness: home, classes and contact pages, online class booking with a deposit through PayPal, a photo gallery of our shows, live on our own domain with good SEO. We have a logo and photos.";

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
      const budgetMinor = budget.trim() ? Math.round(Number(budget.replaceAll(",", "")) * 100) : undefined;
      if (budgetMinor !== undefined && !(budgetMinor >= 0)) throw new Error("Budget must be a number");
      setQuote(await api<QuoteView>("/api/quotes", { body: { brief: brief.trim().replace(/,$/, ""), deadlineDays, budgetMinor } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="New project">
        Describe the work in plain language. It is scoped into milestones, and each price is computed from the estimated hours.
      </PageHeader>
      <section className="max-w-3xl rounded-xl border border-line-soft bg-raised">
        <form onSubmit={submit} className="flex flex-col gap-5 p-5 sm:p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">What do you need built?</span>
            <textarea
              className={`${inputClass} min-h-40 resize-y leading-relaxed`}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={5000}
              placeholder="Pages, features, and anything that must work when it's done"
              required
            />
            <span className="text-xs text-subtle">The more specific the brief, the tighter the price. If it&apos;s too vague to price, you&apos;ll get questions instead of a guess.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Deadline (days from signing)</span>
              <input className={inputClass} type="number" min={1} max={365} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Budget in ₹ <span className="font-normal text-subtle">(optional)</span></span>
              <input className={inputClass} inputMode="decimal" placeholder="No limit" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>
          <ErrorNote error={error} />
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Scoping…" : <>Scope and price it <span aria-hidden>→</span></>}
            </Button>
          </div>
        </form>
      </section>

      {busy && <Scoping />}

      {quote && <QuoteResult quote={quote} onContract={(id) => router.push(`/contracts/${id}`)} />}
    </div>
  );
}

const SCOPING_STEPS = [
  { label: "Reading the brief", color: "var(--tone-paid)", headline: "Reading your brief" },
  { label: "Cutting milestones", color: "var(--tone-check)", headline: "Cutting it into milestones" },
  { label: "Estimating hours", color: "var(--tone-held)", headline: "Estimating the hours" },
  { label: "Pricing", color: "var(--tone-white)", headline: "Pricing each milestone" },
];

/** Shown while the scoper runs: the steps light up one after another. */
function Scoping() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, SCOPING_STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="flex flex-col items-center gap-4 py-12">
      <GooLoader size={22} label="Scoping" showLabel={false} />
      <p className="text-center text-base font-semibold">{SCOPING_STEPS[step].headline}</p>
      <ol className="flex flex-wrap justify-center gap-2.5">
        {SCOPING_STEPS.map((s, i) => (
          <li key={s.label} className="chip transition-opacity duration-500" style={{ opacity: i <= step ? 1 : 0.4 }}>
            <span className={`sw transition-colors duration-500 ${i === step ? "sw-live" : ""}`} style={{ background: i <= step ? s.color : "var(--tone-empty)" }} />
            {s.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function QuoteResult({ quote, onContract }: { quote: QuoteView; onContract: (id: string) => void }) {
  const { scope, meta, pricing } = quote;
  const mock = meta.mode === "mock";
  const badge = (
    <span className="label text-subtle">
      Scoped by {mock ? "the demo scoper (no API key set)" : `${meta.model} · prompt ${meta.promptVersion}`}
      {meta.attempts > 1 ? ` · ${meta.attempts} attempts` : ""}
    </span>
  );

  if (scope.status === "needs_info") {
    return (
      <Card className="rise space-y-4">
        <h2 className="text-lg font-semibold">A few questions before pricing</h2>
        <ul className="space-y-2 text-[15px]">
          {scope.questions.map((q) => (
            <li key={q} className="flex gap-3"><span aria-hidden className="mt-2 size-2 flex-none rounded-full bg-peach" />{q}</li>
          ))}
        </ul>
        <p className="text-muted">Add the answers to your brief and scope it again.</p>
        {badge}
      </Card>
    );
  }
  if (scope.status === "refused") {
    return <Card className="rise space-y-3"><h2 className="text-lg font-semibold">We can&apos;t take this project</h2><p>{scope.reason}</p>{badge}</Card>;
  }
  if (scope.status === "manual_quote") {
    return (
      <Card className="rise space-y-3">
        <h2 className="text-lg font-semibold">This one needs a manual quote</h2>
        <p>{scope.reason}</p>
        <p className="text-muted">No money moves on an unvalidated AI quote.</p>
        {badge}
      </Card>
    );
  }

  const priced = pricing.status === "priced" ? pricing.base : null;
  const values = scope.milestones.map((m, i) => priced?.milestones.find((p) => p.title === m.title)?.taskValueMinor ?? priced?.milestones[i]?.taskValueMinor ?? null);
  const n = scope.milestones.length;
  const hours = scope.milestones.reduce((a, m) => [a[0] + m.estimate.optimistic, a[1] + m.estimate.pessimistic], [0, 0]);

  return (
    <section className="space-y-10">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-5 rounded-xl border border-line-soft bg-raised p-5 shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 max-sm:basis-full">
            <h2 className="cond text-3xl font-extrabold">{scope.projectTitle}</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-muted">{scope.summary}</p>
            <span className="pt-1 text-xs text-subtle">{n} milestones · {hours[0]}–{hours[1]} hours</span>
            {badge}
          </div>
          {priced && (
            <div className="sm:text-right">
              <span className="money block text-5xl leading-none text-butter">{formatMoney(priced.baseSubtotalMinor)}</span>
              <span className="text-xs text-subtle">Base pay for this scope · + 5% fee</span>
            </div>
          )}
        </div>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {scope.milestones.map((m, i) => (
            <li key={m.title} className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-raised p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-subtle">Milestone {i + 1} · {m.durationDays} days</span>
                {values[i] !== null && <span className="money text-2xl leading-none">{formatMoney(values[i]!)}</span>}
              </div>
              <h3 className="cond text-xl font-bold">{m.title}</h3>
              {m.briefQuote && <p className="border-l-2 border-magenta/60 pl-3 text-[13px] italic leading-snug text-muted"><span className="not-italic text-subtle">From your brief: </span>“{m.briefQuote}”</p>}
              <span className="label text-subtle">{SKILL_LABELS[m.skill]} · {m.estimate.optimistic}/{m.estimate.likely}/{m.estimate.pessimistic} hrs</span>
              <ul className="space-y-2 text-sm leading-snug text-muted">
                {m.criteria.map((c) => (
                  <li key={c.text} className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] size-1.5 flex-none rounded-full bg-subtle" />
                    <span>{c.text}{c.method === "client_judged" ? <em className="text-subtle"> (your call)</em> : null}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      <PricingSection quote={quote} onContract={onContract} />
    </section>
  );
}

function PricingSection({ quote, onContract }: { quote: QuoteView; onContract: (id: string) => void }) {
  const [deliveryUrl, setDeliveryUrl] = useState("https://");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pricing } = quote;

  if (pricing.status === "not_priced") return null;
  if (pricing.status === "error") return <ErrorNote error={pricing.message} />;
  if (pricing.status === "needs_info") {
    return <Card className="text-[15px]">The estimate range is too wide to price fairly (pessimistic is {pricing.ratio.toFixed(1)}× optimistic). Add detail to the brief.</Card>;
  }
  if (pricing.status === "infeasible") {
    return (
      <Card className="text-[15px]">
        {pricing.reason === "deadline_passed" ? "That deadline has already passed." : `${pricing.expectedHours.toFixed(0)} hours of work can't be done in ${pricing.availableDays} days.`}{" "}
        The earliest workable deadline is {pricing.earliestDays} days.
      </Card>
    );
  }

  async function offer(freelancerId: string, agentModels?: string[]) {
    setBusyId(freelancerId);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/contracts", { body: { quoteId: quote.id, freelancerId, deliveryUrl, allowParallel: false, agentModels } });
      onContract(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  }

  const base = pricing.base;
  const scopeDrafts = quote.scope.status === "scoped" ? quote.scope.milestones : [];
  const humanPrices = base.milestones.map((m) => m.priceMinor);
  const urlOk = /^https:\/\/[^/]+\.[^/]+/.test(deliveryUrl);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="cond text-[28px] font-extrabold">Choose who does the work</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Same work, same base pay: everyone earns {formatMoney(base.baseSubtotalMinor)} for this scope ({base.expectedHours.toFixed(1)} expected hours
          {base.urgency.multiplier > 1 ? `, ×${base.urgency.multiplier.toFixed(2)} urgency` : ""}). A premium is paid only for a verified track record, shown line by line on the receipt.
        </p>
      </div>

      <label className="flex max-w-2xl flex-col gap-2">
        <span className="text-sm font-medium">Where will the work be delivered?</span>
        <input
          className={inputClass}
          type="url"
          value={deliveryUrl}
          onChange={(e) => setDeliveryUrl(e.target.value)}
          placeholder="https://your-site.example"
        />
        <span className="text-xs text-subtle">The checker only accepts submissions from this site or repo.</span>
      </label>
      <ErrorNote error={error} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pricing.candidates.map((pc) => {
          const { candidate, quote: q, receipts } = pc;
          const offerButton = (ids?: string[]) => (
            <button
              type="button"
              disabled={busyId !== null || !urlOk}
              onClick={() => offer(candidate.id, ids)}
              className="jelly mt-auto min-h-10 rounded-lg bg-butter text-sm font-semibold text-plum hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyId === candidate.id ? "Creating contract…" : `Offer to ${candidate.name.split(" ")[0]}`}
            </button>
          );
          if (candidate.kind === "agent" && pc.agent && pricing.agentCatalog) {
            return (
              <AgentSlot
                key={candidate.id}
                pc={pc}
                catalog={pricing.agentCatalog}
                drafts={scopeDrafts}
                humanPricesMinor={humanPrices}
                humanBaseMinor={base.baseSubtotalMinor}
                offerButton={offerButton}
              />
            );
          }
          return (
          <article key={candidate.id} className="flex flex-col gap-4 rounded-xl border border-line-soft bg-raised p-5 shadow-[var(--shadow-card)] transition-colors hover:border-line">
            <div className="flex items-center gap-3.5">
              <span aria-hidden className="grid size-10 flex-none place-items-center rounded-full bg-magenta/15 text-sm font-semibold text-magenta">
                {candidate.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/u/${candidate.id}`} target="_blank" className="text-[15px] font-bold underline-offset-2 hover:text-butter hover:underline">{candidate.name}</Link>
                <PresenceBadge presence={candidate.presence} kind={candidate.kind} />
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-y border-line-soft py-3">
              <span className="label text-subtle">+ {formatMoney(q.feeMinor)} fee</span>
              <span className="money text-3xl leading-none">{formatMoney(q.subtotalMinor)}</span>
            </div>
            <p className="text-sm leading-normal text-muted">{candidate.why}. <Link href={`/u/${candidate.id}`} target="_blank" className="font-semibold text-peach underline-offset-2 hover:text-butter hover:underline">View profile</Link></p>
            {q.budget && !q.budget.withinBudget && (
              <p className="text-sm text-butter">
                {formatMoney(q.budget.shortfallMinor)} over budget. Options: {q.budget.options.map((o) => o.replace("_", " ")).join(", ")}.
              </p>
            )}
            <details className="text-sm">
              <summary className="label text-peach">Price receipt</summary>
              <div className="mt-3 space-y-3">
                {receipts.map((r) => (
                  <div key={r.title} className="rounded-lg bg-well p-3.5 font-mono text-xs leading-relaxed">
                    <div className="font-semibold">{r.title}</div>
                    {r.lines.map((l) => (
                      <div key={l.text}>  {l.text}{l.amountMinor !== null ? ` = ${formatMoney(l.amountMinor)}` : ""}</div>
                    ))}
                    <div className="text-subtle">  {r.fairBand}</div>
                  </div>
                ))}
              </div>
            </details>
            {offerButton()}
          </article>
          );
        })}
      </div>
      {!urlOk && <p className="label text-subtle">Add a delivery link above to make an offer</p>}
    </div>
  );
}

/** BuildBot's card plus, when open, the full model list on its own row under the cards. */
function AgentSlot({ pc, catalog, drafts, humanPricesMinor, humanBaseMinor, offerButton }: {
  pc: PricedCandidate;
  catalog: AgentCatalogView;
  drafts: MilestoneDraft[];
  humanPricesMinor: number[];
  humanBaseMinor: number;
  offerButton: (ids?: string[]) => React.ReactNode;
}) {
  const [ids, setIds] = useState<string[]>(() => pc.agent?.ladder.map((r) => r.modelId) ?? []);
  const [picking, setPicking] = useState(false);
  const { quote, error } = useAgentQuote(catalog, drafts, ids, pc.candidate.ownerName ?? "the agent's owner", humanPricesMinor);
  return (
    <>
      <AgentCard pc={pc} quote={quote} error={error} humanBaseMinor={humanBaseMinor} picking={picking} onPick={() => setPicking(!picking)} offer={offerButton(quote ? ids : undefined)} />
      {picking && (
        <div className="md:col-span-2 lg:col-span-3">
          <AgentModelPicker catalog={catalog} drafts={drafts} ids={ids} onChange={setIds} />
        </div>
      )}
    </>
  );
}

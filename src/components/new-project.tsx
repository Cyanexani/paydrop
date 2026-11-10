"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { SKILL_LABELS } from "@/lib/pricing/config";
import { api } from "./api";
import type { MilestoneDraft } from "@/lib/ai/scoping-schema";
import type { AgentCatalogView, PricedCandidate, QuoteView } from "@/server/quotes";
import { AgentCard, AgentModelPicker, useAgentQuote } from "./agent-quote";
import { GooLoader } from "./goo";
import { Button, Card, ErrorNote, PageHeader } from "./ui";

const EXAMPLE =
  "a website for my dance studio, Jaya Dance & Fitness: home, classes and contact pages, online class booking with a deposit through PayPal, a photo gallery of our shows, live on our own domain with good SEO. We have a logo and photos,";

const DROP_COLORS = ["var(--tone-held)", "var(--tone-check)", "var(--tone-white)", "var(--tone-paid)"];

/** An inline "blank" in the sentence form. */
const blank =
  "border-0 border-b-[3px] border-dotted border-butter/60 bg-transparent px-1 text-butter outline-none transition-colors focus:border-solid focus:border-butter";

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
    <div className="space-y-24">
      <PageHeader eyebrow="01 · New project" title={<>Scope it.<br />Price it.</>}>
        Describe it in plain language. Claude scopes it into milestones; the price is computed, not guessed.
      </PageHeader>
      <section className="poster -mt-12">
        <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-7 sm:px-9">
          <span>New project<br /><span className="opacity-75">Fill in the blanks</span></span>
          <span className="text-right">Priced by<br /><span className="opacity-75">Formula, not guesswork</span></span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-9 px-6 pb-10 pt-12 sm:px-9">
          <div className="cond text-[clamp(34px,4.6vw,60px)] font-bold leading-[1.12]">
            I need
            <label className="block">
              <span className="sr-only">What do you need built?</span>
              <textarea
                className={`${blank} my-2 block min-h-56 w-full resize-y text-[clamp(20px,3vw,36px)] sm:min-h-36 font-semibold leading-tight [font-stretch:85%]`}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                maxLength={5000}
                required
              />
            </label>
            done in{" "}
            <label>
              <span className="sr-only">Deadline in days from signing</span>
              <input className={`${blank} w-[2.4em] text-center`} type="number" min={1} max={365} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} required />
            </label>{" "}
            days, for about ₹
            <label>
              <span className="sr-only">Budget in rupees (optional)</span>
              <input className={`${blank} w-[4.6em]`} inputMode="decimal" placeholder="any" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            .
          </div>
          <ErrorNote error={error} />
          <div className="flex flex-wrap items-center gap-5">
            <Button type="submit" disabled={busy} className="min-h-14 px-8 text-[17px]">
              {busy ? "Scoping…" : <>Scope and price it <span aria-hidden>→</span></>}
            </Button>
            <span className="max-w-[420px] text-[15px] leading-snug">Too vague to price? Claude asks questions instead of guessing.</span>
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
    <section className="rise flex flex-col items-center gap-7 py-16">
      <GooLoader size={36} label="Scoping" showLabel={false} />
      <p key={step} className="cond rise text-center text-[40px] font-bold leading-none">{SCOPING_STEPS[step].headline}</p>
      <ol className="flex flex-wrap justify-center gap-2.5">
        {SCOPING_STEPS.map((s, i) => (
          <li key={s.label} className="chip transition-opacity duration-500" style={{ opacity: i <= step ? 1 : 0.4 }}>
            <span className={`sw transition-colors duration-500 ${i === step ? "sw-live" : ""}`} style={{ background: i <= step ? s.color : "#6a1452" }} />
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
        <h2 className="cond text-4xl font-extrabold">A few questions before pricing</h2>
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
    return <Card className="rise space-y-3"><h2 className="cond text-4xl font-extrabold">We can&apos;t take this project</h2><p>{scope.reason}</p>{badge}</Card>;
  }
  if (scope.status === "manual_quote") {
    return (
      <Card className="rise space-y-3">
        <h2 className="cond text-4xl font-extrabold">This one needs a manual quote</h2>
        <p>{scope.reason}</p>
        <p className="text-muted">No money moves on an unvalidated AI quote.</p>
        {badge}
      </Card>
    );
  }

  const priced = pricing.status === "priced" ? pricing.base : null;
  const values = scope.milestones.map((m, i) => priced?.milestones.find((p) => p.title === m.title)?.taskValueMinor ?? priced?.milestones[i]?.taskValueMinor ?? null);
  const maxValue = Math.max(1, ...values.map((v) => v ?? 0));
  const n = scope.milestones.length;
  const hours = scope.milestones.reduce((a, m) => [a[0] + m.estimate.optimistic, a[1] + m.estimate.pessimistic], [0, 0]);

  return (
    <section className="rise space-y-24">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="label text-peach">{n} milestones · {hours[0]}–{hours[1]} hrs</span>
            <h2 className="cond text-[clamp(44px,6vw,80px)] font-extrabold leading-[0.9]">{scope.projectTitle}</h2>
            {badge}
          </div>
          {priced && (
            <div className="text-right">
              <span className="money block text-7xl leading-none text-butter">{formatMoney(priced.baseSubtotalMinor)}</span>
              <span className="label text-subtle">base pay for this scope · + 5% fee</span>
            </div>
          )}
        </div>
        <p className="mt-4 max-w-3xl text-muted">{scope.summary}</p>

        {/* The milestones as a liquid chain of drops, sized by price */}
        <div aria-hidden className="relative my-6 h-60">
          <div className="goo-lg absolute inset-0">
            {n > 1 && <span className="chain-string" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />}
            {scope.milestones.map((m, i) => {
              const size = 64 + 84 * Math.sqrt((values[i] ?? maxValue / 2) / maxValue);
              return (
                <span
                  key={m.title}
                  className="chain-drop"
                  style={{ left: `${((i + 0.5) / n) * 100}%`, width: `min(${size}px, ${Math.floor(78 / n)}vw)`, height: `min(${size}px, ${Math.floor(78 / n)}vw)`, background: DROP_COLORS[i % DROP_COLORS.length], animationDelay: `${0.1 + i * 0.25}s` }}
                />
              );
            })}
          </div>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {scope.milestones.map((m, i) => (
            <li key={m.title} className="rise flex flex-col gap-3 border-t border-line py-5 pr-5" style={{ animationDelay: `${300 + i * 250}ms` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="label" style={{ color: DROP_COLORS[i % DROP_COLORS.length].replace("--tone-", "--ink-") }}>0{i + 1} · {m.durationDays} days</span>
                {values[i] !== null && <span className="money text-[34px] leading-none">{formatMoney(values[i]!)}</span>}
              </div>
              <h3 className="cond text-[28px] font-bold leading-none">{m.title}</h3>
              <span className="label text-subtle">{SKILL_LABELS[m.skill]} · {m.estimate.optimistic}/{m.estimate.likely}/{m.estimate.pessimistic} hrs</span>
              <ul className="space-y-2 text-sm leading-snug text-muted">
                {m.criteria.map((c) => (
                  <li key={c.text} className="flex gap-2.5">
                    <span aria-hidden className="mt-1.5 size-2 flex-none rounded-full" style={{ background: DROP_COLORS[i % DROP_COLORS.length] }} />
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
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <h2 className="cond text-[clamp(40px,5vw,64px)] font-extrabold leading-[0.92]">
          Same work,<br /><span className="money text-magenta [font-stretch:100%]">same base pay.</span>
        </h2>
        <p className="max-w-[400px] text-[15px] leading-relaxed text-muted">
          Everyone earns {formatMoney(base.baseSubtotalMinor)} for this scope ({base.expectedHours.toFixed(1)} expected hours
          {base.urgency.multiplier > 1 ? `, ×${base.urgency.multiplier.toFixed(2)} urgency` : ""}). A premium is paid only for a verified track record, line by line on the receipt.
        </p>
      </div>

      <label className="flex max-w-2xl flex-col gap-2">
        <span className="label text-peach">Where will the work be delivered?</span>
        <input
          className="min-h-12 rounded-full border border-line bg-[var(--c-input)] px-5 text-[15px] text-paper focus:border-magenta focus:outline-none focus:ring-4 focus:ring-magenta/15"
          type="url"
          value={deliveryUrl}
          onChange={(e) => setDeliveryUrl(e.target.value)}
          placeholder="https://your-site.example"
        />
        <span className="text-sm text-subtle">The checker only accepts submissions from this site or repo.</span>
      </label>
      <ErrorNote error={error} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pricing.candidates.map((pc, i) => {
          const { candidate, quote: q, receipts } = pc;
          const offerButton = (ids?: string[]) => (
            <button
              type="button"
              disabled={busyId !== null || !urlOk}
              onClick={() => offer(candidate.id, ids)}
              className="jelly mt-auto min-h-12 rounded-full border border-butter font-bold text-butter hover:bg-butter hover:text-plum disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-butter"
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
          <article key={candidate.id} className="rise flex flex-col gap-[18px] rounded-[28px] border border-line-soft bg-raised p-6 transition-[border-color,translate] duration-300 hover:-translate-y-1 hover:border-wine" style={{ animationDelay: `${i * 110}ms` }}>
            <div className="flex items-center gap-3.5">
              <span aria-hidden className="relative size-[52px] flex-none">
                <span className="absolute inset-0 rounded-full" style={{ background: DROP_COLORS[i % DROP_COLORS.length] }} />
                <span className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full shadow-[0_0_0_3px_var(--color-raised)]" style={{ background: candidate.kind === "agent" ? "var(--tone-held)" : "var(--tone-paid)" }} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="text-[19px]">{candidate.name}</strong>
                <span className="label text-subtle">{candidate.kind === "agent" ? "AI agent" : "Freelancer"}</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-y border-dashed border-line py-3.5">
              <span className="label text-subtle">+ {formatMoney(q.feeMinor)} fee</span>
              <span className="money text-[36px] leading-none">{formatMoney(q.subtotalMinor)}</span>
            </div>
            <p className="text-sm leading-normal text-muted">{candidate.why}</p>
            {q.budget && !q.budget.withinBudget && (
              <p className="text-sm text-butter">
                {formatMoney(q.budget.shortfallMinor)} over budget. Options: {q.budget.options.map((o) => o.replace("_", " ")).join(", ")}.
              </p>
            )}
            <details className="text-sm">
              <summary className="label text-peach">Price receipt</summary>
              <div className="mt-3 space-y-3">
                {receipts.map((r) => (
                  <div key={r.title} className="rounded-2xl bg-well p-3.5 font-mono text-xs leading-relaxed">
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

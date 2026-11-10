"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api } from "./api";
import { GooLoader } from "./goo";
import { ErrorNote } from "./ui";

type Phase = "confirming" | "funded" | "cancelled";

const COPY: Record<Phase, { eyebrow: string; title: string; accent: string; body: string }> = {
  confirming: { eyebrow: "One moment", title: "Confirming", accent: "with PayPal.", body: "We're checking the payment with PayPal. This usually takes a few seconds." },
  funded: { eyebrow: "Funded", title: "The money", accent: "is held.", body: "PayPal is holding it. Nothing is taken until the work is verified and you approve it." },
  cancelled: { eyebrow: "Cancelled", title: "Nothing", accent: "was charged.", body: "You cancelled at PayPal. The milestone is still waiting to be funded." },
};

/** PayPal sends the payer here after approving (or cancelling) a payment link. */
export function PayPalReturn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("confirming");
  const [error, setError] = useState<string | null>(null);
  const milestone = search.get("milestone");
  const token = search.get("token");
  const cancelled = !!search.get("cancelled");

  useEffect(() => {
    if (!milestone) return;
    const done = () => router.replace(`/contracts/${id}`);
    if (cancelled) {
      api(`/api/milestones/${milestone}/abandon`, { body: {} })
        .catch(() => undefined)
        .finally(() => {
          setPhase("cancelled");
          setTimeout(done, 1800);
        });
      return;
    }
    if (!token) return;
    api(`/api/milestones/${milestone}/authorize`, { body: { orderId: token } })
      .then(() => {
        setPhase("funded");
        setTimeout(done, 1800);
      })
      .catch((e: Error) => setError(e.message));
  }, [id, router, milestone, token, cancelled]);

  // Opened without PayPal's parameters: there is nothing to confirm.
  const stray = !milestone || (!token && !cancelled);
  const copy = COPY[phase];
  return (
    <section className="poster poster-money mx-auto flex min-h-[520px] max-w-3xl flex-col">
      <div className="label flex justify-between gap-4 border-b border-paper/20 px-6 pb-4 pt-7 sm:px-9">
        <span>PayPal<br /><span className="opacity-75">{stray ? "No payment to confirm" : copy.eyebrow}</span></span>
        <span className="text-right">Sandbox<br /><span className="opacity-75">No real money moves</span></span>
      </div>
      <div className="flex flex-1 flex-col items-start justify-center gap-7 px-6 py-12 sm:px-9">
        {/* The drop: swaying while PayPal answers, settled in its ring once held */}
        <div aria-hidden className="relative h-24 w-full">
          {phase === "confirming" && !error && !stray ? (
            <GooLoader kind="drip" size={30} label="Confirming with PayPal" showLabel={false} />
          ) : (
            <span className="relative block size-24">
              <span className="absolute inset-0 rounded-full border-[1.5px] border-dashed border-paper/45" />
              <span key={phase} className="pop-in absolute inset-5 rounded-full" style={{ background: error ? "#ff6b6b" : phase === "funded" ? "#ff49c1" : "#6a4560" }} />
            </span>
          )}
        </div>
        <h1 key={phase} className="cond rise text-[clamp(52px,8vw,104px)] font-extrabold leading-[0.86]" aria-live="polite">
          {stray ? "Nothing" : error ? "That didn't" : copy.title}<br />
          <span className="money text-butter [font-stretch:100%]">{stray ? "to confirm." : error ? "go through." : copy.accent}</span>
        </h1>
        <p className="max-w-md text-lg leading-relaxed">
          {stray ? "This page finishes a PayPal payment, and this link doesn't carry one." : error ? "PayPal didn't confirm the payment, so nothing is held. You can try funding the milestone again." : copy.body}
        </p>
        <ErrorNote error={error} />
        <Link href={`/contracts/${id}`} className="jelly inline-flex min-h-12 items-center gap-2 rounded-full border border-paper/50 px-6 font-semibold hover:border-paper">
          <span aria-hidden>←</span> Back to the contract
        </Link>
      </div>
    </section>
  );
}

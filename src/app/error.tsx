"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-danger/15 text-[#ffc2c2]" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm leading-relaxed text-muted">
        The page hit an error while loading. No money moves on a failed page: payments only change when PayPal confirms them.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <button type="button" onClick={() => retry()} className="jelly inline-flex min-h-10 items-center rounded-lg bg-butter px-4 text-sm font-semibold text-plum hover:bg-white">
          Try again
        </button>
        <Link href="/contracts" className="jelly inline-flex min-h-10 items-center rounded-lg border border-line bg-raised px-4 text-sm font-semibold hover:bg-well">
          View contracts
        </Link>
      </div>
    </section>
  );
}

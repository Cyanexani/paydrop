"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="rise flex flex-col gap-7 border-y border-line py-14">
      <span className="label flex items-center gap-2.5 text-peach">
        <span aria-hidden className="size-2.5 rounded-full bg-danger" />
        Something broke on this page
      </span>
      <h1 className="cond text-[clamp(52px,8vw,112px)] font-extrabold leading-[0.86]">
        That didn&apos;t<br />
        <span className="money text-magenta [font-stretch:100%]">go through.</span>
      </h1>
      <p className="max-w-lg text-lg leading-relaxed text-muted">
        The page hit an error while loading. No money moves on a failed page: payments only change when PayPal confirms them.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="jelly inline-flex min-h-[52px] items-center rounded-full bg-butter px-7 font-bold text-plum hover:bg-white">
          Try again
        </button>
        <Link href="/contracts" className="jelly inline-flex min-h-[52px] items-center rounded-full border border-paper/35 px-7 font-semibold hover:border-paper/70">
          Your contracts
        </Link>
      </div>
    </section>
  );
}

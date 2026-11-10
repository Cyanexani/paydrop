"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { GooBlock } from "./goo";
import { Card } from "./ui";

/** Uses up the link from the verification email and says what happened. */
export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<{ ok: true; email: string } | { ok: false; message: string } | null>(token ? null : { ok: false, message: "This link is incomplete. Open the link from your email again, or ask for a new one in Settings." });
  const sent = useRef(false);

  useEffect(() => {
    // The link works once, so make sure React's double-run in development doesn't use it twice.
    if (!token || sent.current) return;
    sent.current = true;
    api<{ email: string }>("/api/auth/verify-email", { body: { token } })
      .then((r) => setState({ ok: true, email: r.email }))
      .catch((e: Error) => setState({ ok: false, message: e.message }));
  }, [token]);

  if (!state) return <GooBlock label="Checking your link" />;
  return (
    <Card className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 px-6 py-12 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-full" style={{ background: state.ok ? "var(--tone-paid)" : "var(--tone-bad)", color: "#22071d" }}>
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d={state.ok ? "M5 12.5l4.5 4.5L19 7.5" : "M6 6l12 12M18 6L6 18"} />
        </svg>
      </span>
      <h1 className="cond text-3xl font-extrabold">{state.ok ? "Email verified" : "This link didn't work"}</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-muted">
        {state.ok ? <>We&apos;ve confirmed <strong className="text-paper">{state.email}</strong>. Your profile now shows a verified email badge.</> : state.message}
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link href="/settings" className="jelly inline-flex min-h-10 items-center bg-butter px-5 text-[15px] font-bold text-plum hover:bg-white">{state.ok ? "Go to settings" : "Send a new link"}</Link>
        <Link href="/contracts" className="jelly inline-flex min-h-10 items-center border border-paper/35 px-5 text-[15px] font-semibold hover:border-paper/70">Your contracts</Link>
      </div>
    </Card>
  );
}

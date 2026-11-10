"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type Session } from "./api";
import { hardNavigate, initials } from "./auth/forms";
import { GooLoader } from "./goo";

const AVATAR = { client: "#fff7ad", freelancer: "#ffb3ae" } as const;

/** Top-right: sign-in links, or the signed-in account's menu. */
export function AccountMenu() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => {
    api<Session>("/api/session").then(setSession).catch(() => setSession({ viewer: null, personas: [], demoEnabled: false }));
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[role=menu] a, [role=menu] button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session) return <GooLoader size={10} label="Loading your account" showLabel={false} />;
  const v = session.viewer;

  if (!v) {
    if (/^\/(login|signup)/.test(path)) return <span className="w-10" />;
    return (
      <div className="flex items-center gap-1.5">
        <Link href={`/login${path !== "/" ? `?next=${encodeURIComponent(path)}` : ""}`} className="label px-3 py-3 text-muted hover:text-butter">Sign in</Link>
        <Link href="/signup" className="jelly inline-flex min-h-10 items-center rounded-full bg-butter px-4 text-sm font-bold text-plum hover:bg-white">Create account</Link>
      </div>
    );
  }

  async function signOut() {
    setBusy("out");
    await api("/api/auth/logout", { body: {} }).catch(() => undefined);
    hardNavigate("/");
  }
  async function switchTo(id: string) {
    setBusy(id);
    await api("/api/auth/demo", { body: { userId: id } }).catch(() => undefined);
    window.location.reload();
  }

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] hover:bg-white/5 focus:bg-white/5 focus:outline-none";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full border border-line bg-raised py-1.5 pl-1.5 pr-3.5 transition-colors hover:border-butter"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full text-[13px] font-bold text-plum" style={{ background: AVATAR[v.role] }}>{initials(v.name)}</span>
        <span className="max-w-[10rem] truncate text-sm font-semibold max-sm:hidden">{v.name}</span>
        {v.demo && <span className="label rounded-full bg-magenta/20 px-2 py-0.5 text-[10px] text-magenta max-sm:hidden">Demo</span>}
        <svg aria-hidden viewBox="0 0 24 24" className={`size-4 text-subtle transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="rise absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-[22px] border border-line bg-raised p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)] [animation-duration:0.25s]">
          <div className="flex items-center gap-3 border-b border-line-soft px-3 pb-3 pt-2">
            <span aria-hidden className="grid size-10 flex-none place-items-center rounded-full text-sm font-bold text-plum" style={{ background: AVATAR[v.role] }}>{initials(v.name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{v.name}</span>
              <span className="block truncate text-xs text-subtle">{v.demo ? "Demo account · no password" : v.email}</span>
            </span>
          </div>
          <div className="py-1.5">
            <Link role="menuitem" href="/contracts" className={item} onClick={() => setOpen(false)}>Your contracts</Link>
            {v.role === "client" && <Link role="menuitem" href="/new" className={item} onClick={() => setOpen(false)}>New project</Link>}
            <Link role="menuitem" href="/ledger" className={item} onClick={() => setOpen(false)}>Money ledger</Link>
          </div>
          {v.demo && session.personas.length > 1 && (
            <div className="border-t border-line-soft py-1.5">
              <span className="label block px-3 pb-1 pt-2 text-peach">Switch demo account</span>
              {session.personas.filter((p) => p.id !== v.id).map((p) => (
                <button key={p.id} role="menuitem" type="button" className={item} disabled={busy !== null} onClick={() => switchTo(p.id)}>
                  <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full text-[11px] font-bold text-plum" style={{ background: AVATAR[p.role] }}>
                    {busy === p.id ? <GooLoader kind="orbit" size={5} label="Switching" showLabel={false} /> : initials(p.name)}
                  </span>
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="label ml-auto text-[10px] text-subtle">{p.role === "client" ? "Client" : "Freelancer"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-line-soft pt-1.5">
            <button role="menuitem" type="button" className={`${item} text-[#ffc2c2]`} disabled={busy !== null} onClick={signOut}>
              {busy === "out" ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

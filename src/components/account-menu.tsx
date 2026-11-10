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
        <Link href={`/login${path !== "/" ? `?next=${encodeURIComponent(path)}` : ""}`} className="px-3 py-2 text-sm font-medium text-muted hover:text-paper">Sign in</Link>
        <Link href="/signup" className="jelly inline-flex min-h-9 items-center rounded-lg bg-butter px-3.5 text-sm font-semibold text-plum hover:bg-white"><span className="max-sm:hidden">Create account</span><span className="sm:hidden">Sign up</span></Link>
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

  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 focus:bg-white/5 focus:outline-none";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/5"
      >
        <span aria-hidden className="relative grid size-7 place-items-center rounded-full text-[13px] font-semibold text-plum" style={{ background: AVATAR[v.role] }}>
          {initials(v.name)}
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-[#3ddc84] shadow-[0_0_0_2px_var(--color-ink)]" />
        </span>
        <span className="max-w-[10rem] truncate text-sm font-semibold max-sm:hidden">{v.name}</span>
        {v.demo && <span className="rounded-md bg-magenta/15 px-1.5 py-0.5 text-[11px] font-medium text-magenta max-sm:hidden">Demo</span>}
        <svg aria-hidden viewBox="0 0 24 24" className={`size-4 text-subtle transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="rise absolute right-0 top-[calc(100%+8px)] z-50 w-[280px] rounded-xl border border-line bg-raised p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)]">
          <div className="flex items-center gap-3 border-b border-line-soft px-3 pb-3 pt-2">
            <span aria-hidden className="grid size-10 flex-none place-items-center rounded-full text-sm font-semibold text-plum" style={{ background: AVATAR[v.role] }}>{initials(v.name)}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{v.name}</span>
              <span className="block truncate text-xs text-subtle">{v.demo ? "Demo account · no password" : v.email}</span>
              <span className="flex items-center gap-1.5 pt-0.5 text-xs font-semibold"><span aria-hidden className="size-2 rounded-full bg-[#3ddc84]" />Online now</span>
            </span>
          </div>
          <div className="py-1.5">
            <Link role="menuitem" href="/contracts" className={item} onClick={() => setOpen(false)}>Your contracts</Link>
            {v.role === "client" && <Link role="menuitem" href="/new" className={item} onClick={() => setOpen(false)}>New project</Link>}
            <Link role="menuitem" href="/ledger" className={item} onClick={() => setOpen(false)}>Money ledger</Link>
            {v.role === "freelancer" && <Link role="menuitem" href={`/u/${v.id}`} className={item} onClick={() => setOpen(false)}>Your public profile</Link>}
            <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
              Settings
              {!v.demo && !v.emailVerified && <span className="ml-auto text-xs text-peach">Verify email</span>}
            </Link>
          </div>
          {v.demo && session.personas.length > 1 && (
            <div className="border-t border-line-soft py-1.5">
              <span className="block px-3 pb-1 pt-2 text-xs font-medium text-subtle">Switch demo account</span>
              {session.personas.filter((p) => p.id !== v.id).map((p) => (
                <button key={p.id} role="menuitem" type="button" className={item} disabled={busy !== null} onClick={() => switchTo(p.id)}>
                  <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full text-[11px] font-semibold text-plum" style={{ background: AVATAR[p.role] }}>
                    {busy === p.id ? <GooLoader kind="orbit" size={5} label="Switching" showLabel={false} /> : initials(p.name)}
                  </span>
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="ml-auto text-xs text-subtle">{p.role === "client" ? "Client" : "Freelancer"}</span>
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

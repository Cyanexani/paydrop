"use client";

import { useEffect, useState } from "react";
import { api, type Session } from "./api";
import { GooLoader } from "./goo";

export function PersonaSwitcher() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    api<Session>("/api/session").then(setSession).catch(() => setSession({ viewer: null, personas: [] }));
  }, []);

  async function choose(userId: string) {
    if (!userId) {
      await api("/api/session", { method: "DELETE" });
    } else {
      await api("/api/session", { body: { userId } });
    }
    window.location.reload();
  }

  if (!session) return <GooLoader size={22} label="Loading personas" />;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-zinc-400 sm:inline">Viewing as</span>
      <select
        aria-label="Viewing as"
        className="max-w-[12rem] cursor-pointer rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-magenta/50"
        value={session.viewer?.id ?? ""}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">Pick a persona…</option>
        <optgroup label="Clients">
          {session.personas.filter((p) => p.role === "client").map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
        <optgroup label="Freelancers">
          {session.personas.filter((p) => p.role === "freelancer").map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.kind === "agent" ? " (AI agent)" : ""}</option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

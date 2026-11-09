"use client";

import { useEffect, useState } from "react";
import { api, type Session } from "./api";

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

  if (!session) return <span className="text-sm text-zinc-500">…</span>;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-zinc-500 sm:inline">Viewing as</span>
      <select
        aria-label="Viewing as"
        className="max-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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

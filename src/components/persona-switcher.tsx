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

  if (!session) return <GooLoader size={10} label="Loading personas" showLabel={false} />;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="label hidden text-subtle sm:inline">Viewing as</span>
      <select
        aria-label="Viewing as"
        className="label max-w-[13rem] cursor-pointer rounded-full border border-line bg-raised px-4 py-3 text-paper transition-colors hover:border-butter focus:outline-none focus:ring-2 focus:ring-magenta/50"
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

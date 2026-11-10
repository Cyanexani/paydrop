/** "Online now" or "Active 2h ago", from the last time any of the user's devices made a request. */
export interface PresenceInfo {
  online: boolean;
  lastSeenAt: string | null;
}

export function agoLabel(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function presenceLabel(p: PresenceInfo, kind: "human" | "agent" = "human"): string {
  if (kind === "agent") return "Runs on demand";
  if (p.online) return "Online now";
  return p.lastSeenAt ? `Active ${agoLabel(p.lastSeenAt)}` : "Not active yet";
}

export function PresenceBadge({ presence, kind = "human", className = "" }: { presence: PresenceInfo; kind?: "human" | "agent"; className?: string }) {
  const on = kind === "human" && presence.online;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] ${on ? "font-semibold text-paper" : "text-subtle"} ${className}`}>
      <span aria-hidden className={`size-2 flex-none rounded-full ${on ? "sw-live" : ""}`} style={{ background: on ? "#3ddc84" : "var(--tone-neutral)" }} />
      {presenceLabel(presence, kind)}
    </span>
  );
}

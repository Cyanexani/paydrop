import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { Skill } from "@/lib/pricing/config";
import type { StoredOutcome } from "./reputation";

/** Builds a track record: `n` milestones spread over the last `spanDays` days. */
function outcomes(skill: Skill, n: number, firstPass: number, onTime: number, stars: number[], spanDays: number, now: Date): StoredOutcome[] {
  return Array.from({ length: n }, (_, i) => ({
    skill,
    firstPass: i < firstPass,
    verified: true,
    onTime: i < onTime,
    stars: stars[i] ?? null,
    completedAt: new Date(now.getTime() - Math.round(((i + 1) / n) * spanDays) * 86_400_000).toISOString(),
  }));
}

export function personas(now: Date): Array<typeof users.$inferInsert> {
  return [
    { id: "client-jaya", name: "Jaya Dance & Fitness", role: "client", email: "jaya@jayadance.example", contactEmail: "jaya@jayadance.example", contactPhone: "+919800000001" },
    { id: "client-demo", name: "Demo Client", role: "client", email: "demo.client@example.com", contactEmail: "demo.client@example.com", contactPhone: "+919800000002" },
    {
      id: "fl-meera",
      name: "Meera Iyer",
      role: "freelancer",
      headline: "Senior web developer · booking and payments",
      skills: ["web_dev", "ui_design"],
      paypalEmail: "meera.freelancer@example.com",
      email: "meera.freelancer@example.com",
      // 18 milestones: 17 first-pass, 16 on time, 10 rated averaging 4.7 stars.
      outcomes: outcomes("web_dev", 18, 17, 16, [5, 5, 5, 5, 5, 5, 5, 4, 4, 4], 30, now),
    },
    {
      id: "fl-ravi",
      name: "Ravi Kumar",
      role: "freelancer",
      headline: "Full-stack web developer",
      skills: ["web_dev"],
      paypalEmail: "ravi.freelancer@example.com",
      email: "ravi.freelancer@example.com",
      outcomes: outcomes("web_dev", 2, 2, 2, [5, 5], 6, now),
    },
    {
      id: "fl-asha",
      name: "Asha Patel",
      role: "freelancer",
      headline: "Web developer, new to Paydrop",
      skills: ["web_dev"],
      paypalEmail: "asha.freelancer@example.com",
      email: "asha.freelancer@example.com",
      outcomes: [],
    },
    {
      id: "agent-buildbot",
      name: "BuildBot",
      role: "freelancer",
      headline: "AI coding agent · paid only for verified output",
      skills: ["web_dev"],
      kind: "agent",
      ownerId: "fl-ravi",
      paypalEmail: null,
      outcomes: [],
    },
  ];
}

/** Insert the demo personas, and refresh their profile fields (never their track record) on later runs. */
export async function ensureSeeded(db: Db, now = new Date()): Promise<void> {
  for (const p of personas(now)) {
    await db
      .insert(users)
      .values(p)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: p.name,
          headline: p.headline ?? null,
          skills: p.skills ?? [],
          kind: p.kind ?? "human",
          ownerId: p.ownerId ?? null,
          paypalEmail: p.paypalEmail ?? null,
          contactEmail: p.contactEmail ?? null,
          contactPhone: p.contactPhone ?? null,
          email: p.email ?? null,
        },
      });
  }
}

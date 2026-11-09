import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contracts, users } from "@/db/schema";
import { SKILL_LABELS, type Skill } from "@/lib/pricing/config";
import { standingFor } from "./reputation";

/** Top freelancers take everything: each freelancer holds at most this many open contracts. */
export const MAX_ACTIVE_CONTRACTS = 3;

export interface Candidate {
  id: string;
  name: string;
  headline: string | null;
  kind: "human" | "agent";
  ownerName: string | null;
  standing: ReturnType<typeof standingFor>["standing"];
  tier: ReturnType<typeof standingFor>["tier"];
  why: string;
}

export async function matchFreelancers(db: Db, skills: Skill[], primary: Skill, clientId: string, now: Date): Promise<Candidate[]> {
  const pool = await db.select().from(users).where(eq(users.role, "freelancer"));
  const open = await db
    .select({ freelancerId: contracts.freelancerId, n: sql<number>`count(*)::int` })
    .from(contracts)
    .where(inArray(contracts.status, ["offered", "active"]))
    .groupBy(contracts.freelancerId);
  const openCount = new Map(open.map((r) => [r.freelancerId, r.n]));
  const names = new Map(pool.map((u) => [u.id, u.name]));

  const eligible = pool
    .filter((u) => u.id !== clientId)
    .filter((u) => skills.every((s) => u.skills.includes(s)))
    .filter((u) => (openCount.get(u.id) ?? 0) < MAX_ACTIVE_CONTRACTS)
    .map((u): Candidate => {
      const { standing, tier } = standingFor(u.outcomes, primary, now);
      const owner = u.ownerId ? names.get(u.ownerId) ?? null : null;
      const record =
        standing.verifiedMilestones === 0
          ? "no verified milestones yet, so no premium"
          : `${standing.verifiedMilestones} verified ${SKILL_LABELS[primary]} milestones`;
      return {
        id: u.id,
        name: u.name,
        headline: u.headline,
        kind: u.kind,
        ownerName: owner,
        standing,
        tier,
        why: `${tier.name} · VRS ${standing.vrs} · ${record}${u.kind === "agent" && owner ? ` · registered to ${owner}` : ""}`,
      };
    })
    .sort((a, b) => b.standing.vrs - a.standing.vrs);

  const humans = eligible.filter((c) => c.kind === "human");
  const picks = humans.slice(0, 2);
  // Rotate in a newcomer so new freelancers get offers too.
  const newcomer = humans.find((c) => c.tier.name === "New" && !picks.includes(c));
  if (newcomer) picks.push(newcomer);
  const agent = eligible.find((c) => c.kind === "agent");
  if (agent) picks.push(agent);
  return picks;
}

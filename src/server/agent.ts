import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { deliveries, users } from "@/db/schema";
import { buildMilestone, type SiteFiles } from "@/lib/ai/agent-worker";
import { loadMilestoneFor } from "./contracts";
import { AppError, badRequest, forbidden, newId } from "./errors";
import { submitWork } from "./milestone-actions";
import type { Viewer } from "./session";

/** Agent loops or never finishes: at most this many builds per milestone; unpaid unless verified. */
export const MAX_AGENT_RUNS = 3;

export function deliveryBase(baseUrl: string, contractId: string) {
  return `${baseUrl}/deliveries/${contractId}`;
}

export async function siteFiles(db: Db, contractId: string): Promise<SiteFiles> {
  const rows = await db.select().from(deliveries).where(eq(deliveries.contractId, contractId)).orderBy(asc(deliveries.createdAt));
  return rows.reduce<SiteFiles>((acc, r) => ({ ...acc, ...(JSON.parse(r.html) as SiteFiles) }), {});
}

/** The agent's owner starts a run: BuildBot builds the milestone, hosts it, and submits it for checking. */
export async function runAgent(db: Db, viewer: Viewer, milestoneId: string, baseUrl: string) {
  const { row, state, contract, role } = await loadMilestoneFor(db, viewer, milestoneId);
  const [worker] = await db.select().from(users).where(eq(users.id, contract.freelancerId));
  if (worker?.kind !== "agent") throw badRequest("This milestone isn't assigned to an AI agent");
  if (role !== "agent_owner" && viewer.id !== worker.id) throw forbidden("Only the agent's owner can start it");
  if (!["funded", "changes_requested"].includes(state.status)) throw badRequest("The agent works only on funded milestones");
  const runs = (await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.milestoneId, milestoneId))).length;
  if (runs >= MAX_AGENT_RUNS) throw new AppError(409, "agent_limit", `BuildBot has used its ${MAX_AGENT_RUNS} attempts; reassign the milestone to a person`);

  const previous = await siteFiles(db, contract.id);
  const { files, notes, mode } = await buildMilestone(contract.title, row.draft, previous);
  await db.insert(deliveries).values({ id: newId("dl"), milestoneId, contractId: contract.id, workerId: worker.id, html: JSON.stringify(files) });
  // The agent submits like any freelancer; the state machine refuses it anything that moves money.
  const submitted = await submitWork(db, worker, milestoneId, { evidenceUrl: `${deliveryBase(baseUrl, contract.id)}/` });
  return { ...submitted, files: Object.keys(files), notes, mode };
}

import { rename } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db/client";
import { checkRuns, type milestones } from "@/db/schema";
import { runCheck } from "@/lib/checker/run";
import type { CriterionResult } from "@/lib/milestones/state-machine";
import { newId } from "./errors";

/** Criterion ids are positional: c1, c2, ... in the order the contract lists them. */
export function criterionId(index: number): string {
  return `c${index + 1}`;
}

export const REPLAY_DIR = path.join(process.cwd(), ".data", "replays");

/** Run the checker on a submission and keep the run (steps, replay) as dispute evidence. */
export async function checkDelivery(
  db: Db,
  row: typeof milestones.$inferSelect,
  evidenceUrl: string,
  attempt: number,
  commitSha?: string,
): Promise<CriterionResult[]> {
  const startedAt = new Date();
  const id = newId("cr");
  const out = await runCheck({
    evidenceUrl,
    criteria: row.draft.criteria.map((c, i) => ({ id: criterionId(i), text: c.text, method: c.method })),
    replayDir: path.join(REPLAY_DIR, "tmp"),
  });

  let replayUrl = out.replayUrl;
  if (out.replayFile) {
    await rename(out.replayFile, path.join(REPLAY_DIR, `${id}.webm`)).catch(() => undefined);
    replayUrl = `/api/check-runs/${id}/replay`;
  }
  const results = out.results.map((r) => ({ ...r, replayUrl: replayUrl ?? undefined }));
  await db.insert(checkRuns).values({
    id,
    milestoneId: row.id,
    attempt,
    mode: out.mode,
    evidenceUrl,
    commitSha: commitSha ?? null,
    replayUrl,
    results,
    steps: [
      { at: startedAt.toISOString(), action: "start", detail: `judge: ${out.judge}` },
      ...out.steps,
      ...out.injection.map((f) => ({ at: new Date().toISOString(), action: "injection", detail: `${f.where} on ${f.url}: ${f.snippet}` })),
    ],
    startedAt,
    finishedAt: new Date(),
  });
  return results;
}

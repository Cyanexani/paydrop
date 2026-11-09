import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { checkRuns, milestones } from "@/db/schema";
import { appDb } from "@/server/app-db";
import { REPLAY_DIR } from "@/server/checker";
import { loadContractFor } from "@/server/contracts";
import { notFound } from "@/server/errors";
import { route } from "@/server/http";
import { requireViewer } from "@/server/session";

/** Local replay video of a check run; only parties to the contract can watch it. */
export const GET = route(async (_req, ctx: RouteContext<"/api/check-runs/[id]/replay">) => {
  const { id } = await ctx.params;
  if (!/^cr_[a-z0-9]+$/i.test(id)) throw notFound("Replay");
  const db = await appDb();
  const viewer = await requireViewer(db);
  const [run] = await db.select().from(checkRuns).where(eq(checkRuns.id, id));
  if (!run) throw notFound("Replay");
  const [m] = await db.select({ contractId: milestones.contractId }).from(milestones).where(eq(milestones.id, run.milestoneId));
  await loadContractFor(db, viewer, m.contractId);
  const file = await readFile(path.join(REPLAY_DIR, `${id}.webm`)).catch(() => null);
  if (!file) throw notFound("Replay");
  return new Response(new Uint8Array(file), { headers: { "Content-Type": "video/webm", "Cache-Control": "private, max-age=3600" } });
});

import { z } from "zod";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { FreelancerChangeRequest, ScheduleChangeRequest, proposeScheduleChange, raiseChangeRequest } from "@/server/scope";
import { requireViewer } from "@/server/session";

/** Freelancer raises a change order by hand, or either party proposes a schedule change (Gantt drag). */
export const POST = route(async (req, ctx: RouteContext<"/api/contracts/[id]/change-requests">) => {
  const { id } = await ctx.params;
  const body = z.object({ kind: z.enum(["work", "schedule"]) }).passthrough().parse(await readJson(req));
  const db = await appDb();
  const viewer = await requireViewer(db);
  return body.kind === "schedule"
    ? proposeScheduleChange(db, viewer, id, ScheduleChangeRequest.parse(body))
    : raiseChangeRequest(db, viewer, id, FreelancerChangeRequest.parse(body));
});

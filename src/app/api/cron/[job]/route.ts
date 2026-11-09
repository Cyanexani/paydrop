import { appDb } from "@/server/app-db";
import { forbidden, notFound } from "@/server/errors";
import { route } from "@/server/http";
import { JOBS, runJobs, type JobName } from "@/server/jobs";

/** Cron entry point: POST /api/cron/all (or one job name) with `Authorization: Bearer $CRON_SECRET`. */
export const POST = route(async (req, ctx: RouteContext<"/api/cron/[job]">) => {
  const { job } = await ctx.params;
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw forbidden("Bad cron secret");
  if (job !== "all" && !(job in JOBS)) throw notFound("Job");
  return runJobs(await appDb(), job === "all" ? undefined : [job as JobName]);
});

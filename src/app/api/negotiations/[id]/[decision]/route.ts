import { appDb } from "@/server/app-db";
import { notFound } from "@/server/errors";
import { route } from "@/server/http";
import { respondToCounter } from "@/server/negotiation";
import { requireViewer } from "@/server/session";

export const POST = route(async (_req, ctx: RouteContext<"/api/negotiations/[id]/[decision]">) => {
  const { id, decision } = await ctx.params;
  if (decision !== "accept" && decision !== "reject") throw notFound("Decision");
  const db = await appDb();
  return respondToCounter(db, await requireViewer(db), id, decision === "accept");
});

import { appDb } from "@/server/app-db";
import { route } from "@/server/http";
import { ChangeDecision, decideChangeRequest } from "@/server/scope";
import { requireViewer } from "@/server/session";

export const POST = route(async (_req, ctx: RouteContext<"/api/change-requests/[id]/[decision]">) => {
  const { id, decision } = await ctx.params;
  const db = await appDb();
  return decideChangeRequest(db, await requireViewer(db), id, ChangeDecision.parse(decision));
});

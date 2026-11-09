import { appDb } from "@/server/app-db";
import { ResolveRequest, resolveDispute } from "@/server/contract-actions";
import { readJson, route } from "@/server/http";

/** Platform staff resolve a dispute. Send the ADMIN_SECRET in the x-admin-secret header. */
export const POST = route(async (req, ctx: RouteContext<"/api/admin/milestones/[id]/resolve">) => {
  const { id } = await ctx.params;
  const { outcome } = ResolveRequest.parse(await readJson(req));
  return resolveDispute(await appDb(), req.headers.get("x-admin-secret"), id, outcome);
});

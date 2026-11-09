import { appDb } from "@/server/app-db";
import { getContractView } from "@/server/contracts";
import { route } from "@/server/http";
import { requireViewer } from "@/server/session";

export const GET = route(async (_req, ctx: RouteContext<"/api/contracts/[id]">) => {
  const { id } = await ctx.params;
  const db = await appDb();
  return getContractView(db, await requireViewer(db), id);
});

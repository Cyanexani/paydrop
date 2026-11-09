import { appDb } from "@/server/app-db";
import { CollaboratorsRequest, disputePack, setCollaborators } from "@/server/contract-actions";
import { acceptContract, declineContract } from "@/server/contracts";
import { notFound } from "@/server/errors";
import { readJson, route } from "@/server/http";
import { requireViewer } from "@/server/session";

export const GET = route(async (_req, ctx: RouteContext<"/api/contracts/[id]/[action]">) => {
  const { id, action } = await ctx.params;
  if (action !== "dispute-pack") throw notFound("Action");
  const db = await appDb();
  return disputePack(db, await requireViewer(db), id);
});

export const POST = route(async (req, ctx: RouteContext<"/api/contracts/[id]/[action]">) => {
  const { id, action } = await ctx.params;
  const db = await appDb();
  const viewer = await requireViewer(db);
  switch (action) {
    case "accept":
      await acceptContract(db, viewer, id);
      return { ok: true };
    case "decline":
      await declineContract(db, viewer, id);
      return { ok: true };
    case "collaborators":
      return setCollaborators(db, viewer, id, CollaboratorsRequest.parse(await readJson(req)));
    default:
      throw notFound("Action");
  }
});

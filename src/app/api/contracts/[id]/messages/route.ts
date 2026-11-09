import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { MessageRequest, postMessage } from "@/server/scope";
import { requireViewer } from "@/server/session";

/** A message on the contract thread; the client's messages run through the scope-creep detector. */
export const POST = route(async (req, ctx: RouteContext<"/api/contracts/[id]/messages">) => {
  const { id } = await ctx.params;
  const { body } = MessageRequest.parse(await readJson(req));
  const db = await appDb();
  return postMessage(db, await requireViewer(db), id, body);
});

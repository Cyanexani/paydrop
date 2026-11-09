import { z } from "zod";
import { gridAssist } from "@/lib/ai/grid-assist";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { requireViewer } from "@/server/session";

export const POST = route(async (req) => {
  const db = await appDb();
  await requireViewer(db);
  const body = z.object({ query: z.string().trim().min(1).max(500), schema: z.unknown(), state: z.unknown() }).parse(await readJson(req));
  return gridAssist(body.query, body.schema, body.state);
});

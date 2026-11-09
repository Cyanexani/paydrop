import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertQuoteRequest, createQuote } from "@/server/quotes";
import { requireViewer } from "@/server/session";

export const POST = route(async (req) => {
  const input = assertQuoteRequest(await readJson(req));
  const db = await appDb();
  return createQuote(db, await requireViewer(db), input);
});

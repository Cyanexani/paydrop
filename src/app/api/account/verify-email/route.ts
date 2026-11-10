import { requestEmailVerification } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { appBaseUrl, route } from "@/server/http";
import { assertSameOrigin, requireSession } from "@/server/session";

/** Email the signed-in account a link that marks its address verified. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const db = await appDb();
  const s = await requireSession(db);
  return await requestEmailVerification(db, s.viewer, s.demo, appBaseUrl(req));
});

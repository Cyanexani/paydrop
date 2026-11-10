import { PasswordChange, changePassword } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, clientIp, requireSession } from "@/server/session";

/** Change the password; every other device is signed out, this one stays signed in. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const db = await appDb();
  const s = await requireSession(db);
  await changePassword(db, s.viewer, s.demo, PasswordChange.parse(await readJson(req)), s.token, clientIp(req));
  return { ok: true };
});

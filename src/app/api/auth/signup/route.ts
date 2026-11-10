import { SignUpRequest, signUp } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { requestEmailVerification } from "@/server/auth/profile";
import { appBaseUrl, readJson, route } from "@/server/http";
import { assertSameOrigin, clientIp, signIn } from "@/server/session";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = SignUpRequest.parse(await readJson(req));
  const db = await appDb();
  const user = await signUp(db, input, clientIp(req));
  await signIn(db, user.id, req);
  // Best effort: a failed email must not undo the sign-up. The link can be re-sent from Settings.
  await requestEmailVerification(db, user, false, appBaseUrl(req)).catch((error) => console.error("Verification email failed", error));
  return { user: { id: user.id, name: user.name, role: user.role } };
});

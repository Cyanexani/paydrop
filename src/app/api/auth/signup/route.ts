import { SignUpRequest, signUp } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, clientIp, signIn } from "@/server/session";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = SignUpRequest.parse(await readJson(req));
  const db = await appDb();
  const user = await signUp(db, input, clientIp(req));
  await signIn(db, user.id, req);
  return { user: { id: user.id, name: user.name, role: user.role } };
});

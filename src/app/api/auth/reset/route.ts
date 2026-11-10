import { ResetRequest, resetPassword } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, signIn } from "@/server/session";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { token, password } = ResetRequest.parse(await readJson(req));
  const db = await appDb();
  const user = await resetPassword(db, token, password);
  await signIn(db, user.id, req);
  return { user: { id: user.id, name: user.name, role: user.role } };
});

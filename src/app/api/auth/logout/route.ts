import { appDb } from "@/server/app-db";
import { route } from "@/server/http";
import { assertSameOrigin, signOut } from "@/server/session";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await signOut(await appDb());
  return { ok: true };
});

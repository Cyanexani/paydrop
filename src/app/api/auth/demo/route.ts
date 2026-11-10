import { z } from "zod";
import { demoUser } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, signIn } from "@/server/session";

/** One-click sign-in as a demo persona (no password). Turned off with DEMO_LOGIN=off. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = z.object({ userId: z.string().min(1) }).parse(await readJson(req));
  const db = await appDb();
  const user = await demoUser(db, userId);
  await signIn(db, user.id, req, true);
  return { user: { id: user.id, name: user.name, role: user.role } };
});

import { asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { demoLoginEnabled, demoPersonaIds, demoUser } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, currentSession, signIn, signOut } from "@/server/session";

/** Who is signed in, plus the demo accounts (when demo sign-in is on). */
export const GET = route(async () => {
  const db = await appDb();
  const s = await currentSession(db);
  const demoEnabled = demoLoginEnabled();
  const personas = demoEnabled
    ? await db
        .select({ id: users.id, name: users.name, role: users.role, kind: users.kind, headline: users.headline })
        .from(users)
        .where(inArray(users.id, [...demoPersonaIds()]))
        .orderBy(asc(users.role), asc(users.name))
    : [];
  return {
    viewer: s ? { id: s.viewer.id, name: s.viewer.name, role: s.viewer.role, kind: s.viewer.kind, email: s.viewer.email, demo: s.demo } : null,
    personas,
    demoEnabled,
  };
});

/** Kept for scripts and the Postman collection: sign in as a demo persona. Same as POST /api/auth/demo. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { userId } = z.object({ userId: z.string().min(1) }).parse(await readJson(req));
  const db = await appDb();
  const user = await demoUser(db, userId);
  await signIn(db, user.id, req, true);
  return { ok: true };
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  await signOut(await appDb());
  return { ok: true };
});

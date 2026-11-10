import { z } from "zod";
import { listDevices, signOutDevices } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, requireSession } from "@/server/session";

/** Where this account is signed in. */
export const GET = route(async () => {
  const db = await appDb();
  const s = await requireSession(db);
  return { devices: await listDevices(db, s.viewer.id, s.token) };
});

/** Sign out one other device (`sessionId`), or every other device when it's left out. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { sessionId } = z.object({ sessionId: z.string().min(10).max(128).optional() }).parse(await readJson(req));
  const db = await appDb();
  const s = await requireSession(db);
  const signedOut = await signOutDevices(db, s.viewer.id, s.token, sessionId);
  return { signedOut, devices: await listDevices(db, s.viewer.id, s.token) };
});

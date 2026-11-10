import { z } from "zod";
import { listDevices, signOutDevices } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import type { Db } from "@/db/client";
import { AppError } from "@/server/errors";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, requireSession } from "@/server/session";

/** Where this account is signed in. */
export const GET = route(async () => {
  const db = await appDb();
  const s = await requireSession(db);
  return { devices: await devicesFor(db, s) };
});

/** Sign out one other device (`sessionId`), or every other device when it's left out. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { sessionId } = z.object({ sessionId: z.string().min(10).max(128).optional() }).parse(await readJson(req));
  const db = await appDb();
  const s = await requireSession(db);
  // A demo account is shared by everyone trying the app: one visitor must not sign the others out.
  if (s.demo) throw new AppError(403, "demo_read_only", "Demo accounts are shared, so other visitors can't be signed out.");
  const signedOut = await signOutDevices(db, s.viewer.id, s.token, sessionId);
  return { signedOut, devices: await devicesFor(db, s) };
});

/** On a shared demo account, show only the visitor's own device, not everyone else trying the demo. */
async function devicesFor(db: Db, s: { viewer: { id: string }; demo: boolean; token: string }) {
  const devices = await listDevices(db, s.viewer.id, s.token);
  return s.demo ? devices.filter((d) => d.current) : devices;
}

import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { users } from "@/db/schema";
import { appDb } from "@/server/app-db";
import { notFound } from "@/server/errors";
import { readJson, route } from "@/server/http";
import { SESSION_COOKIE, currentViewer } from "@/server/session";

export const GET = route(async () => {
  const db = await appDb();
  const viewer = await currentViewer(db);
  const personas = await db
    .select({ id: users.id, name: users.name, role: users.role, kind: users.kind, headline: users.headline })
    .from(users)
    .orderBy(asc(users.role), asc(users.name));
  return { viewer: viewer ? { id: viewer.id, name: viewer.name, role: viewer.role, kind: viewer.kind } : null, personas };
});

export const POST = route(async (req) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(await readJson(req));
  const db = await appDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!user) throw notFound("Persona");
  (await cookies()).set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
});

export const DELETE = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
});

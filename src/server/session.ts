import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "./errors";

/**
 * Demo sign-in: the viewer picks a persona and we keep its id in an httpOnly cookie.
 * There are no passwords; this is a hackathon demo, and the README says so.
 */
export const SESSION_COOKIE = "mp_user";

export type Viewer = typeof users.$inferSelect;

export async function currentViewer(db: Db): Promise<Viewer | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function requireViewer(db: Db): Promise<Viewer> {
  const viewer = await currentViewer(db);
  if (!viewer) throw new AppError(401, "signed_out", "Pick a persona first");
  return viewer;
}

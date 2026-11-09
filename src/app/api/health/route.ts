import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { appDb } from "@/server/app-db";

/** Render health check: the app is up and the database answers. */
export async function GET() {
  await connection();
  try {
    const db = await appDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}

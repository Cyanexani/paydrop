import { getDb, type Db } from "@/db/client";
import { ensureSeeded } from "./seed";

const g = globalThis as unknown as { __mpSeeded?: Promise<void> };

/** The app database, migrated and seeded with demo personas on first use. */
export async function appDb(): Promise<Db> {
  const db = await getDb();
  g.__mpSeeded ??= ensureSeeded(db).catch((error) => {
    g.__mpSeeded = undefined;
    throw error;
  });
  await g.__mpSeeded;
  return db;
}

import { appDb } from "@/server/app-db";
import { route } from "@/server/http";
import { fairnessRows } from "@/server/ledger";
import { requireViewer } from "@/server/session";

/** Pricing transparency across the platform (no names, no clients). */
export const GET = route(async () => {
  const db = await appDb();
  await requireViewer(db);
  return { rows: await fairnessRows(db) };
});

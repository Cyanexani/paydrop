import { ProfileUpdate, accountView, updateProfile } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin, requireSession } from "@/server/session";

/** The signed-in account, as the settings page shows it. */
export const GET = route(async () => {
  const s = await requireSession(await appDb());
  return { account: accountView(s.viewer, s.demo) };
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const db = await appDb();
  const s = await requireSession(db);
  const updated = await updateProfile(db, s.viewer, s.demo, ProfileUpdate.parse(await readJson(req)));
  return { account: accountView(updated, s.demo) };
});

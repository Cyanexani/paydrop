import { z } from "zod";
import { verifyEmail } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { assertSameOrigin } from "@/server/session";

/** Use up a verification link. No sign-in needed: holding the link is the proof. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { token } = z.object({ token: z.string().min(20).max(200) }).parse(await readJson(req));
  const { email } = await verifyEmail(await appDb(), token);
  return { ok: true, email };
});

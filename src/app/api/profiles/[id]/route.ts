import { publicProfile } from "@/server/auth/profile";
import { appDb } from "@/server/app-db";
import { route } from "@/server/http";

/** A freelancer's or agent's public profile. No sign-in needed; no contact details in it. */
export const GET = route(async (_req, ctx: RouteContext<"/api/profiles/[id]">) => {
  const { id } = await ctx.params;
  return { profile: await publicProfile(await appDb(), id) };
});

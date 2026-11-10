import { ForgotRequest, requestPasswordReset } from "@/server/auth/accounts";
import { appDb } from "@/server/app-db";
import { appBaseUrl, readJson, route } from "@/server/http";
import { assertSameOrigin, clientIp } from "@/server/session";

/** Always the same answer, whether or not the email has an account. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { email } = ForgotRequest.parse(await readJson(req));
  const { delivery } = await requestPasswordReset(await appDb(), email, appBaseUrl(req), clientIp(req));
  return { ok: true, delivery };
});

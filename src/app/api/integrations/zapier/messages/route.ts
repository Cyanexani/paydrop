import { appDb } from "@/server/app-db";
import { readJson, route } from "@/server/http";
import { ZapierMessage, zapierInbound } from "@/server/scope";

/**
 * Zapier "Webhooks by Zapier → POST" target. Map the WhatsApp/email sender to `from` and the
 * message to `text`; send ZAPIER_SECRET in the x-zapier-secret header.
 */
export const POST = route(async (req) => {
  const input = ZapierMessage.parse(await readJson(req));
  return zapierInbound(await appDb(), req.headers.get("x-zapier-secret"), input);
});

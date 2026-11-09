import { appDb } from "@/server/app-db";
import { errorResponse } from "@/server/http";
import { handlePayPalWebhook } from "@/server/webhooks";

export async function POST(req: Request) {
  try {
    const db = await appDb();
    const { status, outcome } = await handlePayPalWebhook(db, req.headers, await req.text());
    return Response.json({ outcome }, { status });
  } catch (error) {
    return errorResponse(error);
  }
}

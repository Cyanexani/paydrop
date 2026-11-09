import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ScopingUnavailableError } from "@/lib/ai/scoping";
import { PricingError } from "@/lib/pricing/engine";
import { PayPalError, PayPalNotConfiguredError } from "@/lib/paypal/client";
import { AppError, badRequest } from "./errors";

type ErrorBody = { error: { code: string; message: string; debugId?: string | null } };

export function errorResponse(error: unknown): Response {
  const json = (status: number, body: ErrorBody) => Response.json(body, { status });
  if (error instanceof AppError) return json(error.status, { error: { code: error.code, message: error.message } });
  if (error instanceof PayPalNotConfiguredError) {
    return json(503, { error: { code: "paypal_not_configured", message: error.message } });
  }
  if (error instanceof PayPalError) {
    console.error("PayPal error", error.status, error.issue, error.debugId, error.details);
    return json(502, { error: { code: error.issue, message: `PayPal: ${error.message}`, debugId: error.debugId } });
  }
  if (error instanceof ScopingUnavailableError) {
    return json(503, { error: { code: error.retryable ? "ai_unavailable" : "ai_error", message: error.message } });
  }
  if (error instanceof PricingError) return json(400, { error: { code: error.code, message: error.message } });
  if (error instanceof ZodError) {
    return json(400, { error: { code: "invalid_input", message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
  }
  console.error(error);
  return json(500, { error: { code: "internal", message: "Something went wrong" } });
}

export function route<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const data = await fn(req, ctx);
      return data instanceof Response ? data : Response.json(data ?? { ok: true });
    } catch (error) {
      // Let Next.js's own control-flow errors (e.g. dynamic-rendering bailouts) through.
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

/** Public base URL: APP_URL, else Render's external URL, else the request's own origin. */
export function appBaseUrl(req: Request): string {
  return (process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
}

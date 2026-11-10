/**
 * Minimal, typed PayPal REST client (Orders v2, Payments v2, Payouts v1, Webhooks v1).
 * Every write sends a PayPal-Request-Id so a retried request can't charge or pay twice.
 */
import { z } from "zod";
import { minorToDecimalString, majorToMinor, type CurrencyCode, type Minor } from "@/lib/money";

const BASE_URL = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  env: keyof typeof BASE_URL;
  webhookId: string | null;
}

export function paypalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  return { clientId, clientSecret, env, webhookId: process.env.PAYPAL_WEBHOOK_ID ?? null };
}

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
    message: string,
    readonly debugId: string | null,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

export class PayPalNotConfiguredError extends Error {
  constructor() {
    super("PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
    this.name = "PayPalNotConfiguredError";
  }
}

const Amount = z.object({ currency_code: z.string(), value: z.string() });
export type PayPalAmount = z.infer<typeof Amount>;

export function toPayPalAmount(amountMinor: Minor, currency: CurrencyCode): PayPalAmount {
  return { currency_code: currency, value: minorToDecimalString(amountMinor) };
}

export function fromPayPalAmount(a: PayPalAmount): { amountMinor: Minor; currency: string } {
  return { amountMinor: majorToMinor(Number(a.value)), currency: a.currency_code };
}

const Link = z.object({ href: z.string(), rel: z.string() }).passthrough();

const Authorization = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: Amount.optional(),
    custom_id: z.string().optional(),
    expiration_time: z.string().optional(),
  })
  .passthrough();

const Capture = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: Amount.optional(),
    custom_id: z.string().optional(),
    status_details: z.object({ reason: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const Order = z
  .object({
    id: z.string(),
    status: z.string(),
    links: z.array(Link).optional(),
    purchase_units: z
      .array(
        z
          .object({
            reference_id: z.string().optional(),
            custom_id: z.string().optional(),
            amount: Amount.optional(),
            payments: z
              .object({
                authorizations: z.array(Authorization).optional(),
                captures: z.array(Capture).optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type PayPalOrder = z.infer<typeof Order>;

const TokenResponse = z.object({ access_token: z.string(), expires_in: z.number() });

const tokenCache: { token: string | null; expiresAt: number } = { token: null, expiresAt: 0 };

async function accessToken(cfg: PayPalConfig): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const res = await fetch(`${BASE_URL[cfg.env]}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw await toError(res);
  const body = TokenResponse.parse(await res.json());
  tokenCache.token = body.access_token;
  tokenCache.expiresAt = Date.now() + body.expires_in * 1000;
  return body.access_token;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T> | null,
  opts: { body?: unknown; requestId?: string } = {},
): Promise<T> {
  const cfg = paypalConfig();
  if (!cfg) throw new PayPalNotConfiguredError();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken(cfg)}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  let res: Response | null = null;
  // 5xx and network errors are retried with the same request id, which PayPal deduplicates.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${BASE_URL[cfg.env]}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if (res.status < 500) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  if (!res) throw new PayPalError(503, "NETWORK", "Couldn't reach PayPal", null, null);
  if (!res.ok) throw await toError(res);
  if (schema === null || res.status === 204) return undefined as T;
  return schema.parse(await res.json());
}

async function toError(res: Response): Promise<PayPalError> {
  let body: { name?: string; message?: string; debug_id?: string; details?: Array<{ issue?: string; description?: string }>; error?: string; error_description?: string } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body
  }
  const issue = body.details?.[0]?.issue ?? body.name ?? body.error ?? `HTTP_${res.status}`;
  const message = body.details?.[0]?.description ?? body.message ?? body.error_description ?? res.statusText;
  return new PayPalError(res.status, issue, message, body.debug_id ?? res.headers.get("paypal-debug-id"), body.details ?? null);
}

/** Create an order the client approves with the PayPal buttons; the money is held, not taken. */
export function createAuthorizeOrder(input: {
  milestoneId: string;
  description: string;
  amountMinor: Minor;
  currency: CurrencyCode;
  requestId: string;
  /** For a shareable payment link: PayPal sends the payer back here with ?token=<order id>. */
  returnUrl?: string;
  cancelUrl?: string;
}): Promise<PayPalOrder> {
  return request("POST", "/v2/checkout/orders", Order, {
    requestId: input.requestId,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.milestoneId,
          custom_id: input.milestoneId,
          description: input.description.slice(0, 127),
          amount: toPayPalAmount(input.amountMinor, input.currency),
        },
      ],
      ...(input.returnUrl
        ? {
            payment_source: {
              paypal: {
                experience_context: {
                  brand_name: "Paydrop",
                  shipping_preference: "NO_SHIPPING",
                  user_action: "CONTINUE",
                  return_url: input.returnUrl,
                  cancel_url: input.cancelUrl ?? input.returnUrl,
                },
              },
            },
          }
        : {}),
    },
  });
}

/** The URL the payer opens to approve an order (payer-action for links, approve for buttons). */
export function approvalLink(order: PayPalOrder): string | null {
  return order.links?.find((l) => l.rel === "payer-action")?.href ?? order.links?.find((l) => l.rel === "approve")?.href ?? null;
}

export function getOrder(orderId: string): Promise<PayPalOrder> {
  return request("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`, Order);
}

export function authorizeOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
  return request("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, Order, {
    requestId,
    body: {},
  });
}

export function captureAuthorization(input: {
  authorizationId: string;
  amountMinor: Minor;
  currency: CurrencyCode;
  requestId: string;
}): Promise<z.infer<typeof Capture>> {
  return request("POST", `/v2/payments/authorizations/${encodeURIComponent(input.authorizationId)}/capture`, Capture, {
    requestId: input.requestId,
    body: { amount: toPayPalAmount(input.amountMinor, input.currency), final_capture: true },
  });
}

/** Issues a new authorization id and restarts the 3-day honor period (within the 29-day validity). */
export function reauthorize(authorizationId: string, requestId: string): Promise<z.infer<typeof Authorization>> {
  return request("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`, Authorization, {
    requestId,
    body: {},
  });
}

export function voidAuthorization(authorizationId: string, requestId: string): Promise<void> {
  return request("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, null, {
    requestId,
  });
}

export function getCapture(captureId: string): Promise<z.infer<typeof Capture>> {
  return request("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`, Capture);
}

export function getAuthorization(authorizationId: string): Promise<z.infer<typeof Authorization>> {
  return request("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`, Authorization);
}

const PayoutBatch = z
  .object({
    batch_header: z.object({
      payout_batch_id: z.string(),
      batch_status: z.string(),
      sender_batch_header: z.object({ sender_batch_id: z.string() }).passthrough().optional(),
    }).passthrough(),
  })
  .passthrough();

/**
 * PayPal rejects a sender_batch_id reused within 30 days, so retrying a timed-out request
 * with the same id can't pay twice. Each item's sender_item_id is the milestone/payee pair.
 */
export function createPayout(input: {
  senderBatchId: string;
  items: Array<{ receiverEmail: string; amountMinor: Minor; currency: CurrencyCode; senderItemId: string; note: string }>;
}): Promise<z.infer<typeof PayoutBatch>> {
  return request("POST", "/v1/payments/payouts", PayoutBatch, {
    body: {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: "You've been paid for a verified milestone",
      },
      items: input.items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.receiverEmail,
        amount: { currency: i.currency, value: minorToDecimalString(i.amountMinor) },
        sender_item_id: i.senderItemId,
        note: i.note.slice(0, 4000),
      })),
    },
  });
}

const Verification = z.object({ verification_status: z.string() });

/** Ask PayPal whether a webhook really came from PayPal (POST /v1/notifications/verify-webhook-signature). */
export async function verifyWebhookSignature(headers: Headers, event: unknown): Promise<boolean> {
  const cfg = paypalConfig();
  if (!cfg?.webhookId) return false;
  const h = (name: string) => headers.get(name) ?? "";
  const result = await request("POST", "/v1/notifications/verify-webhook-signature", Verification, {
    body: {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: cfg.webhookId,
      webhook_event: event,
    },
  });
  return result.verification_status === "SUCCESS";
}

export function firstAuthorization(order: PayPalOrder) {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0] ?? null;
}

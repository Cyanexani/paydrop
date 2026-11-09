import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { payouts, webhookEvents } from "@/db/schema";
import type { MilestoneEvent } from "@/lib/milestones/state-machine";
import type { CurrencyCode } from "@/lib/money";
import { fromPayPalAmount, getCapture, verifyWebhookSignature } from "@/lib/paypal/client";
import { runEffects } from "./effects";
import { applyMilestoneEvent } from "./milestone-store";

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

interface WebhookEnvelope {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown> & {
    id?: string;
    custom_id?: string;
    payout_item?: { sender_item_id?: string };
    errors?: { name?: string; message?: string };
  };
}

const PAYOUT_FAILURES = new Set([
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.DENIED",
  "PAYMENT.PAYOUTS-ITEM.CANCELED",
]);

/**
 * PayPal webhooks: verified with PayPal's verify-webhook-signature API, stored once per
 * PayPal event id, and the capture's state is re-fetched from PayPal before any transition.
 */
export async function handlePayPalWebhook(db: Db, headers: Headers, rawBody: string): Promise<{ status: number; outcome: string }> {
  let event: WebhookEnvelope;
  try {
    event = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return { status: 400, outcome: "invalid_json" };
  }
  if (!event.id || !event.event_type) return { status: 400, outcome: "not_a_paypal_event" };

  const verified = await verifyWebhookSignature(headers, event).catch(() => false);
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, eventType: event.event_type, verified, payload: event as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return { status: 200, outcome: "duplicate" };
  if (!verified) {
    await setOutcome(db, event.id, "rejected_unverified");
    return { status: 400, outcome: "rejected_unverified" };
  }

  const outcome = await dispatch(db, event).catch((error: unknown) => `error: ${error instanceof Error ? error.message : String(error)}`);
  await setOutcome(db, event.id, outcome);
  return { status: 200, outcome };
}

async function dispatch(db: Db, event: WebhookEnvelope): Promise<string> {
  const type = event.event_type!;
  const resource = event.resource ?? {};
  const eventId = `wh-${event.id}`;
  const actor = { kind: "paypal", id: "webhook" } as const;

  if (type.startsWith("PAYMENT.CAPTURE.")) {
    if (!resource.id || !resource.custom_id) return "ignored: capture without milestone";
    const capture = await getCapture(resource.id);
    const milestoneId = capture.custom_id ?? resource.custom_id;
    let body: Body;
    if (capture.status === "COMPLETED" && capture.amount) {
      const { amountMinor, currency } = fromPayPalAmount(capture.amount);
      body = { type: "CAPTURE_COMPLETED", captureId: capture.id, amountMinor, currency: currency as CurrencyCode };
    } else if (capture.status === "PENDING") {
      body = { type: "CAPTURE_PENDING", captureId: capture.id };
    } else if (capture.status === "DECLINED" || capture.status === "FAILED") {
      body = { type: "CAPTURE_FAILED", reason: capture.status };
    } else {
      return `ignored: capture ${capture.status}`;
    }
    return applyAndRun(db, milestoneId, body, eventId, actor);
  }

  if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    // sender_item_id is our payout row id: each payee's item is tracked on its own.
    const payoutId = resource.payout_item?.sender_item_id;
    if (!payoutId) return "ignored: payout item without id";
    const [row] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
    if (!row) return "ignored: unknown payout item";
    if (type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
      await db.update(payouts).set({ status: "succeeded", failure: null, updatedAt: new Date() }).where(eq(payouts.id, row.id));
      const all = await db.select({ status: payouts.status }).from(payouts).where(eq(payouts.milestoneId, row.milestoneId));
      if (!all.every((p) => p.status === "succeeded")) return "payout item succeeded; others pending";
      return applyAndRun(db, row.milestoneId, { type: "PAYOUT_COMPLETED" }, eventId, actor);
    }
    if (PAYOUT_FAILURES.has(type)) {
      const reason = resource.errors?.name ?? type.replace("PAYMENT.PAYOUTS-ITEM.", "");
      await db.update(payouts).set({ status: "failed", failure: reason, updatedAt: new Date() }).where(eq(payouts.id, row.id));
      return applyAndRun(db, row.milestoneId, { type: "PAYOUT_FAILED", reason }, eventId, actor);
    }
    return `ignored: ${type}`;
  }

  if (type === "PAYMENT.AUTHORIZATION.VOIDED" && resource.custom_id) {
    return applyAndRun(db, resource.custom_id, { type: "VOID", reason: "authorization_expired" }, eventId, { kind: "system", id: "webhook" });
  }

  return `ignored: ${type}`;
}

async function applyAndRun(db: Db, milestoneId: string, body: Body, eventId: string, actor: MilestoneEvent["actor"]) {
  const result = await applyMilestoneEvent(db, milestoneId, { ...body, eventId, at: new Date(), actor } as MilestoneEvent);
  if (!result.ok) return `rejected: ${result.code}`;
  if (result.duplicate) return "applied earlier";
  if (result.effects.length) await runEffects(db, milestoneId, result.effects);
  return `applied: ${body.type} → ${result.state.status}`;
}

async function setOutcome(db: Db, id: string, outcome: string) {
  await db.update(webhookEvents).set({ outcome }).where(eq(webhookEvents.id, id));
}

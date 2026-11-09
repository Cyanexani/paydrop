import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { milestones, payouts } from "@/db/schema";
import type { Effect, MilestoneEvent } from "@/lib/milestones/state-machine";
import {
  PayPalError,
  captureAuthorization,
  createPayout,
  reauthorize,
  voidAuthorization,
} from "@/lib/paypal/client";
import { checkDelivery } from "./checker";
import { pendingPayouts } from "./hooks";
import { applyMilestoneEvent } from "./milestone-store";

const PAYPAL_ACTOR = { kind: "paypal", id: "api" } as const;

export interface EffectLog {
  effect: Effect["type"];
  ok: boolean;
  detail: string;
}

/**
 * Perform the side effects a transition asked for, feeding each PayPal or checker result
 * back into the state machine as a new event. Effects produced by those events run too.
 */
export async function runEffects(db: Db, milestoneId: string, effects: readonly Effect[], log: EffectLog[] = []): Promise<EffectLog[]> {
  let reauthorizedId: string | null = null;
  for (const effect of effects) {
    switch (effect.type) {
      case "paypal.reauthorize": {
        try {
          const auth = await reauthorize(effect.authorizationId, effect.idempotencyKey);
          reauthorizedId = auth.id;
          await apply(db, milestoneId, { type: "REAUTHORIZED", authorizationId: auth.id }, `reauth-${auth.id}`, log);
          log.push({ effect: effect.type, ok: true, detail: `new authorization ${auth.id}` });
        } catch (error) {
          log.push({ effect: effect.type, ok: false, detail: describe(error) });
        }
        break;
      }

      case "paypal.capture": {
        const authorizationId = reauthorizedId ?? effect.authorizationId;
        try {
          const capture = await captureAuthorization({
            authorizationId,
            amountMinor: effect.amountMinor,
            currency: effect.currency,
            requestId: effect.idempotencyKey,
          });
          if (capture.status === "COMPLETED") {
            await apply(
              db,
              milestoneId,
              { type: "CAPTURE_COMPLETED", captureId: capture.id, amountMinor: effect.amountMinor, currency: effect.currency },
              `capture-completed-${capture.id}`,
              log,
            );
          } else if (capture.status === "PENDING") {
            await apply(db, milestoneId, { type: "CAPTURE_PENDING", captureId: capture.id }, `capture-pending-${capture.id}`, log);
          } else {
            await apply(db, milestoneId, { type: "CAPTURE_FAILED", reason: capture.status }, `capture-failed-${capture.id}`, log);
          }
          log.push({ effect: effect.type, ok: true, detail: `capture ${capture.id} ${capture.status}` });
        } catch (error) {
          // 5xx/network: leave it "releasing"; the capture is retried with the same request id.
          if (error instanceof PayPalError && error.status < 500) {
            await apply(db, milestoneId, { type: "CAPTURE_FAILED", reason: error.issue }, `capture-failed-${effect.idempotencyKey}-${error.issue}`, log);
          }
          log.push({ effect: effect.type, ok: false, detail: describe(error) });
        }
        break;
      }

      case "paypal.void": {
        try {
          await voidAuthorization(effect.authorizationId, effect.idempotencyKey);
          log.push({ effect: effect.type, ok: true, detail: `voided ${effect.authorizationId}` });
        } catch (error) {
          log.push({ effect: effect.type, ok: false, detail: describe(error) });
        }
        break;
      }

      case "payout.send": {
        // One batch per attempt; only queued or failed items go in it. A timed-out request is
        // retried with the same sender_batch_id, which PayPal refuses to pay twice for 30 days.
        const rows = await pendingPayouts(db, milestoneId);
        if (rows.length === 0) {
          log.push({ effect: effect.type, ok: true, detail: "nothing left to pay" });
          break;
        }
        const attempt = Math.max(...rows.map((r) => r.attempt)) + 1;
        const senderBatchId = attempt === 1 ? effect.idempotencyKey : `${effect.idempotencyKey}-retry-${attempt}`;
        const ids = rows.map((r) => r.id);
        try {
          const batch = await createPayout({
            senderBatchId,
            items: rows.map((r) => ({
              receiverEmail: r.email,
              amountMinor: r.amountMinor,
              currency: r.currency,
              senderItemId: r.id,
              note: "Payment for a verified MilestonePay milestone",
            })),
          });
          const batchId = batch.batch_header.payout_batch_id;
          await db.update(payouts).set({ status: "sent", batchId, attempt, failure: null, updatedAt: new Date() }).where(inArray(payouts.id, ids));
          await apply(db, milestoneId, { type: "PAYOUT_SENT", batchId }, `payout-sent-${senderBatchId}`, log, { kind: "system", id: "payouts" });
          log.push({ effect: effect.type, ok: true, detail: `batch ${batchId} (${rows.length} item${rows.length > 1 ? "s" : ""})` });
        } catch (error) {
          await db.update(payouts).set({ status: "failed", attempt, failure: describe(error), updatedAt: new Date() }).where(inArray(payouts.id, ids));
          await apply(db, milestoneId, { type: "PAYOUT_FAILED", reason: describe(error) }, `payout-failed-${senderBatchId}`, log, { kind: "system", id: "payouts" });
          log.push({ effect: effect.type, ok: false, detail: describe(error) });
        }
        break;
      }

      case "checker.run": {
        const [row] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
        if (!row) break;
        const results = await checkDelivery(db, row, effect.evidenceUrl, effect.attempt, effect.commitSha);
        await apply(
          db,
          milestoneId,
          { type: "CHECK_COMPLETED", results, commitSha: effect.commitSha },
          `check-${milestoneId}-${effect.attempt}`,
          log,
          { kind: "ai_checker", id: "basic-checker" },
        );
        log.push({ effect: effect.type, ok: true, detail: `attempt ${effect.attempt}` });
        break;
      }

      case "notify":
        console.info(`[notify ${effect.to}] ${milestoneId}: ${effect.message}`);
        log.push({ effect: effect.type, ok: true, detail: effect.message });
        break;
    }
  }
  return log;
}

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

async function apply(
  db: Db,
  milestoneId: string,
  body: Body,
  eventId: string,
  log: EffectLog[],
  actor: MilestoneEvent["actor"] = PAYPAL_ACTOR,
) {
  const result = await applyMilestoneEvent(db, milestoneId, { ...body, eventId, at: new Date(), actor } as MilestoneEvent);
  if (!result.ok) {
    log.push({ effect: "notify", ok: false, detail: `${body.type} rejected: ${result.message}` });
    return;
  }
  if (result.effects.length) await runEffects(db, milestoneId, result.effects, log);
}

function describe(error: unknown): string {
  if (error instanceof PayPalError) return `${error.issue}: ${error.message}${error.debugId ? ` (debug ${error.debugId})` : ""}`;
  return error instanceof Error ? error.message : String(error);
}

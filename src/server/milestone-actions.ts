import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { milestones } from "@/db/schema";
import { transition, type Actor, type MilestoneEvent } from "@/lib/milestones/state-machine";
import {
  PayPalError,
  approvalLink,
  authorizeOrder,
  createAuthorizeOrder,
  firstAuthorization,
  fromPayPalAmount,
  getOrder,
  voidAuthorization,
} from "@/lib/paypal/client";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { loadMilestoneFor } from "./contracts";
import { AppError, badRequest, forbidden } from "./errors";
import { defer } from "./defer";
import { BlockedUrlError, assertPublicUrl } from "@/lib/checker/net-guard";
import { runEffects } from "./effects";
import { applyMilestoneEvent } from "./milestone-store";
import type { Viewer } from "./session";

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

async function act(db: Db, milestoneId: string, body: Body, eventId: string, actor: Actor) {
  const result = await applyMilestoneEvent(db, milestoneId, { ...body, eventId, at: new Date(), actor } as MilestoneEvent);
  if (!result.ok) throw new AppError(result.code === "not_found" ? 404 : 409, result.code, result.message);
  // The browser checker takes a while: run it after responding; the page polls for the result.
  const slow = result.effects.filter((e) => e.type === "checker.run");
  const fast = result.effects.filter((e) => e.type !== "checker.run");
  const log = fast.length ? await runEffects(db, milestoneId, fast) : [];
  if (slow.length) await defer(() => runEffects(db, milestoneId, slow));
  return { status: result.state.status, duplicate: result.duplicate, log };
}

function workerActor(role: string, viewer: Viewer, freelancerId: string): Actor {
  if (role === "freelancer") return { kind: viewer.kind === "agent" ? "agent" : "freelancer", id: viewer.id };
  if (role === "agent_owner") return { kind: "agent", id: freelancerId };
  throw forbidden("Only the freelancer can do this");
}

/**
 * Client funds a milestone: create (or reuse) an AUTHORIZE order for the locked amount.
 * With `link`, the order carries return/cancel URLs and the result includes a shareable
 * PayPal payment link (used for change orders sent over WhatsApp or email).
 */
export async function startFunding(db: Db, viewer: Viewer, milestoneId: string, link?: { baseUrl: string }) {
  const { row, state, contract, role, earlierReleased } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client") throw forbidden("Only the client funds milestones");
  // A second click while the PayPal window is open reuses the same order.
  if (state.status === "funding" && state.orderId && !link) return { orderId: state.orderId, approveUrl: null };
  // Change orders can be paid as soon as they're agreed, alongside the original milestones.
  const allowParallel = contract.allowParallel || row.kind === "change_order";
  if (state.status === "funding" && state.orderId && link) {
    // Switching from the buttons to a payment link: retire the unapproved order first.
    await act(db, milestoneId, { type: "FUNDING_ABANDONED" }, `abandon-${state.orderId}`, { kind: "client", id: viewer.id });
    return startFunding(db, viewer, milestoneId, link);
  }

  // Dry-run the transition first so a refused funding never creates a PayPal order.
  const dryRun = transition(state, {
    type: "START_FUNDING",
    orderId: "dry-run",
    earlierMilestonesReleased: earlierReleased,
    allowParallel,
    eventId: `dry-run-${milestoneId}-${state.version}`,
    at: new Date(),
    actor: { kind: "client", id: viewer.id },
  });
  if (!dryRun.ok) throw new AppError(409, dryRun.code, dryRun.message);

  const order = await createAuthorizeOrder({
    milestoneId,
    description: `${contract.title}: ${row.draft.title}`,
    amountMinor: state.fundMinor,
    currency: state.currency,
    requestId: `order-${milestoneId}-v${state.version}${link ? "-link" : ""}`,
    returnUrl: link ? `${link.baseUrl}/contracts/${contract.id}/paypal-return?milestone=${milestoneId}` : undefined,
    cancelUrl: link ? `${link.baseUrl}/contracts/${contract.id}/paypal-return?milestone=${milestoneId}&cancelled=1` : undefined,
  });
  await act(
    db,
    milestoneId,
    { type: "START_FUNDING", orderId: order.id, earlierMilestonesReleased: earlierReleased, allowParallel },
    `start-funding-${order.id}`,
    { kind: "client", id: viewer.id },
  );
  return { orderId: order.id, approveUrl: link ? approvalLink(order) : null };
}

/** Freelancer agrees to a change order (original milestones are accepted with the contract). */
export async function acceptMilestone(db: Db, viewer: Viewer, milestoneId: string) {
  const { role, contract } = await loadMilestoneFor(db, viewer, milestoneId);
  const actor = workerActor(role, viewer, contract.freelancerId);
  return act(db, milestoneId, { type: "ACCEPT" }, `accept-${milestoneId}`, actor);
}

/** Client approved in the PayPal window: authorize (hold) the money. Amounts come from PayPal, not the browser. */
export async function confirmFunding(db: Db, viewer: Viewer, milestoneId: string, orderId: string) {
  const { state, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client") throw forbidden("Only the client funds milestones");
  if (state.orderId !== orderId) throw badRequest("That PayPal order isn't this milestone's");

  let order;
  try {
    order = await authorizeOrder(orderId, `authorize-${orderId}`);
  } catch (error) {
    // Already authorized (e.g. a retried request): read the existing authorization instead.
    if (error instanceof PayPalError && error.issue === "ORDER_ALREADY_AUTHORIZED") order = await getOrder(orderId);
    else throw error;
  }
  const auth = firstAuthorization(order);
  if (!auth?.amount || auth.status !== "CREATED") {
    await act(db, milestoneId, { type: "FUNDING_FAILED", reason: auth?.status ?? order.status }, `funding-failed-${orderId}`, { kind: "paypal", id: "api" });
    throw new AppError(402, "funding_failed", `PayPal didn't hold the money (status ${auth?.status ?? order.status})`);
  }
  const { amountMinor, currency } = fromPayPalAmount(auth.amount);
  if (!CURRENCIES.includes(currency as CurrencyCode)) throw badRequest(`Unexpected currency ${currency}`);

  const result = await applyMilestoneEvent(db, milestoneId, {
    type: "AUTHORIZED",
    orderId,
    authorizationId: auth.id,
    amountMinor,
    currency: currency as CurrencyCode,
    eventId: `authorized-${auth.id}`,
    at: new Date(),
    actor: { kind: "paypal", id: "api" },
  });
  if (!result.ok) {
    if (result.code === "amount_mismatch") {
      // Amount changed in the browser: release the hold and refuse.
      await voidAuthorization(auth.id, `void-mismatch-${auth.id}`).catch(() => undefined);
      await act(db, milestoneId, { type: "FUNDING_FAILED", reason: "amount_mismatch" }, `funding-failed-${orderId}`, { kind: "system", id: "funding" });
    }
    throw new AppError(409, result.code, result.message);
  }
  if (result.effects.length) await runEffects(db, milestoneId, result.effects);
  return { status: result.state.status };
}

export async function abandonFunding(db: Db, viewer: Viewer, milestoneId: string) {
  const { state, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client") throw forbidden();
  if (state.status !== "funding") return { status: state.status, duplicate: true, log: [] };
  return act(db, milestoneId, { type: "FUNDING_ABANDONED" }, `abandon-${state.orderId}`, { kind: "client", id: viewer.id });
}

export const SubmitRequest = z.object({
  evidenceUrl: z.string().url(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "commit SHA must be 7–40 hex characters")
    .optional(),
  /** Hours actually spent; feeds the estimator's calibration examples. */
  actualHours: z.number().positive().max(1000).optional(),
});

export async function submitWork(db: Db, viewer: Viewer, milestoneId: string, input: z.infer<typeof SubmitRequest>) {
  const { state, role, contract } = await loadMilestoneFor(db, viewer, milestoneId);
  const actor = workerActor(role, viewer, contract.freelancerId);
  // Refuse links into our own network before the checker is ever pointed at them. A name that
  // doesn't resolve right now is let through: the checker reports it as unreachable.
  await assertPublicUrl(input.evidenceUrl).catch((error) => {
    if (error instanceof BlockedUrlError && error.kind === "blocked") throw badRequest(error.message, "blocked_url");
  });
  if (input.actualHours) await db.update(milestones).set({ actualHours: input.actualHours }).where(eq(milestones.id, milestoneId));
  return act(
    db,
    milestoneId,
    { type: "SUBMIT", evidenceUrl: input.evidenceUrl, commitSha: input.commitSha },
    `submit-${milestoneId}-${state.checkAttempts + 1}`,
    actor,
  );
}

export async function challengeCheck(db: Db, viewer: Viewer, milestoneId: string, reason: string) {
  const { state, role, contract } = await loadMilestoneFor(db, viewer, milestoneId);
  const actor = workerActor(role, viewer, contract.freelancerId);
  if (!reason.trim()) throw badRequest("Say why the check is wrong");
  return act(db, milestoneId, { type: "CHALLENGE", reason: reason.trim().slice(0, 500) }, `challenge-${milestoneId}-${state.checkAttempts}`, actor);
}

/** Client approves release. The event id is tied to the version, so a double click is one release. */
export async function approveRelease(db: Db, viewer: Viewer, milestoneId: string) {
  const { state, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role !== "client") throw forbidden("Only the client can approve a release");
  return act(db, milestoneId, { type: "CLIENT_APPROVE" }, `approve-${milestoneId}-v${state.version}`, { kind: "client", id: viewer.id });
}

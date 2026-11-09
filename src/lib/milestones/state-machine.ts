/**
 * The milestone state machine: the only code allowed to decide that money moves.
 *
 * `transition()` is pure. It takes the current state and one event and returns the
 * next state plus the side effects to perform (PayPal calls, checker runs). Callers
 * persist the new state with compare-and-set on `version` and then run the effects.
 *
 * Rules it enforces (each maps to a row in the brief's edge-case table):
 * - AI never releases money: only a client approval, or a system timeout after every
 *   check passed, can start a release. Agents and the checker cannot.
 * - Every event carries an idempotency key; replays are no-ops, and a second capture
 *   report for the same capture is a no-op, so RELEASED happens once.
 * - Funded amount and currency must match the price locked at signing.
 * - Work is submitted only on funded milestones, only from the contracted origin,
 *   at most 3 checks a day.
 */
import type { CurrencyCode, Minor } from "@/lib/money";

export const MILESTONE_RULES = {
  /** PayPal: capture within 3 days of authorizing ("honor period"); the hold is valid 29 days. */
  honorPeriodDays: 3,
  authorizationValidDays: 29,
  /** Client has this long to review a verified milestone before it auto-releases. */
  reviewWindowHours: 72,
  maxChecksPerDay: 3,
  appliedEventMemory: 500,
} as const;

export const MILESTONE_STATUSES = [
  "offered",
  "accepted",
  "funding",
  "funded",
  "submitted",
  "changes_requested",
  "needs_review",
  "verified",
  "releasing",
  "release_pending",
  "release_failed",
  "released",
  "payout_pending",
  "paid_out",
  "disputed",
  "voided",
  "cancelled",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export type ActorKind = "client" | "freelancer" | "agent" | "ai_checker" | "system" | "paypal";
export interface Actor {
  kind: ActorKind;
  id: string;
}

export type CriterionOutcome = "pass" | "fail" | "couldnt_check";
export interface CriterionResult {
  criterionId: string;
  outcome: CriterionOutcome;
  note?: string;
  replayUrl?: string;
}

export interface Authorization {
  authorizationId: string;
  authorizedAt: Date;
  honorUntil: Date;
  expiresAt: Date;
  amountMinor: Minor;
  currency: CurrencyCode;
}

export interface Submission {
  at: Date;
  evidenceUrl: string;
  commitSha?: string;
}

export interface MilestoneState {
  id: string;
  status: MilestoneStatus;
  /** Incremented on every applied transition; persist with compare-and-set. */
  version: number;
  /** What the client authorizes and we capture: milestone price + platform fee. Locked at signing. */
  fundMinor: Minor;
  /** The freelancer's share of `fundMinor`, paid out after capture. */
  payoutMinor: Minor;
  /** Currency PayPal holds the money in. */
  currency: CurrencyCode;
  /** Origins (https://host) or repo URL prefixes the delivery must come from. */
  contractedOrigins: string[];
  orderId: string | null;
  authorization: Authorization | null;
  captureId: string | null;
  submissions: Submission[];
  checkAttempts: number;
  lastCheck: { at: Date; attempt: number; results: CriterionResult[]; commitSha?: string } | null;
  verifiedAt: Date | null;
  firstPass: boolean | null;
  payoutFailures: number;
  /** Status to return to if a dispute resolves in the freelancer's favour. */
  disputedFrom: MilestoneStatus | null;
  appliedEventIds: string[];
}

type EventBody =
  | { type: "ACCEPT" }
  | { type: "CANCEL" }
  | { type: "START_FUNDING"; orderId: string; earlierMilestonesReleased: boolean; allowParallel: boolean }
  | { type: "FUNDING_ABANDONED" }
  | { type: "FUNDING_FAILED"; reason: string }
  | { type: "AUTHORIZED"; orderId: string; authorizationId: string; amountMinor: Minor; currency: CurrencyCode }
  | { type: "REAUTHORIZED"; authorizationId: string }
  | { type: "SUBMIT"; evidenceUrl: string; commitSha?: string }
  | { type: "CHECK_COMPLETED"; results: CriterionResult[]; commitSha?: string }
  | { type: "CHALLENGE"; reason: string }
  | { type: "CLIENT_APPROVE" }
  | { type: "AUTO_RELEASE" }
  | { type: "CAPTURE_PENDING"; captureId: string }
  | { type: "CAPTURE_COMPLETED"; captureId: string; amountMinor: Minor; currency: CurrencyCode }
  | { type: "CAPTURE_FAILED"; reason: string }
  | { type: "PAYOUT_SENT"; batchId: string }
  | { type: "PAYOUT_COMPLETED" }
  | { type: "PAYOUT_FAILED"; reason: string }
  | { type: "VOID"; reason: "freelancer_silent" | "client_cancelled" | "freelancer_withdrew" | "authorization_expired" }
  | { type: "OPEN_DISPUTE"; reason: string }
  | { type: "RESOLVE_DISPUTE"; outcome: "release" | "void" | "reject_dispute" };

export type MilestoneEvent = EventBody & { eventId: string; at: Date; actor: Actor };
export type MilestoneEventType = EventBody["type"];

export type Effect =
  | { type: "paypal.capture"; authorizationId: string; amountMinor: Minor; currency: CurrencyCode; idempotencyKey: string }
  | { type: "paypal.reauthorize"; authorizationId: string; idempotencyKey: string }
  | { type: "paypal.void"; authorizationId: string; idempotencyKey: string }
  | { type: "checker.run"; evidenceUrl: string; attempt: number; commitSha?: string }
  | { type: "payout.send"; amountMinor: Minor; currency: CurrencyCode; idempotencyKey: string }
  | { type: "notify"; to: "client" | "freelancer"; message: string };

export type TransitionErrorCode =
  | "invalid_transition"
  | "forbidden_actor"
  | "amount_mismatch"
  | "funding_out_of_order"
  | "origin_not_contracted"
  | "check_limit_reached"
  | "review_window_open"
  | "authorization_expired"
  | "invalid_event";

export type TransitionResult =
  | { ok: true; state: MilestoneState; effects: Effect[]; duplicate: boolean }
  | { ok: false; code: TransitionErrorCode; message: string };

/** Which actors may send which events. Money-moving events never include `agent` or `ai_checker`. */
const ALLOWED_ACTORS: Record<MilestoneEventType, readonly ActorKind[]> = {
  ACCEPT: ["freelancer", "agent"],
  CANCEL: ["client", "system"],
  START_FUNDING: ["client"],
  FUNDING_ABANDONED: ["client", "system"],
  FUNDING_FAILED: ["paypal", "system"],
  AUTHORIZED: ["paypal", "system"],
  REAUTHORIZED: ["paypal", "system"],
  SUBMIT: ["freelancer", "agent"],
  CHECK_COMPLETED: ["ai_checker", "system"],
  CHALLENGE: ["freelancer", "agent"],
  CLIENT_APPROVE: ["client"],
  AUTO_RELEASE: ["system"],
  CAPTURE_PENDING: ["paypal", "system"],
  CAPTURE_COMPLETED: ["paypal", "system"],
  CAPTURE_FAILED: ["paypal", "system"],
  PAYOUT_SENT: ["system"],
  PAYOUT_COMPLETED: ["paypal", "system"],
  PAYOUT_FAILED: ["paypal", "system"],
  VOID: ["client", "freelancer", "system"],
  OPEN_DISPUTE: ["client", "freelancer"],
  RESOLVE_DISPUTE: ["system"],
};

export function newMilestoneState(init: {
  id: string;
  fundMinor: Minor;
  payoutMinor: Minor;
  currency: CurrencyCode;
  contractedOrigins: string[];
}): MilestoneState {
  if (!(init.payoutMinor > 0 && init.payoutMinor <= init.fundMinor)) {
    throw new RangeError("Payout must be positive and no more than the funded amount");
  }
  return {
    ...init,
    status: "offered",
    version: 0,
    orderId: null,
    authorization: null,
    captureId: null,
    submissions: [],
    checkAttempts: 0,
    lastCheck: null,
    verifiedAt: null,
    firstPass: null,
    payoutFailures: 0,
    disputedFrom: null,
    appliedEventIds: [],
  };
}

export type AuthorizationHealth = "none" | "honored" | "needs_reauthorization" | "expired";

/** Inside 3 days: capture directly. Days 3–29: reauthorize first. After 29: re-fund. */
export function authorizationHealth(state: MilestoneState, now: Date): AuthorizationHealth {
  const auth = state.authorization;
  if (!auth) return "none";
  if (now >= auth.expiresAt) return "expired";
  if (now >= auth.honorUntil) return "needs_reauthorization";
  return "honored";
}

export function transition(state: MilestoneState, event: MilestoneEvent): TransitionResult {
  if (!event.eventId) return fail("invalid_event", "Every event needs an idempotency key");
  if (state.appliedEventIds.includes(event.eventId)) {
    return { ok: true, state, effects: [], duplicate: true };
  }
  if (!ALLOWED_ACTORS[event.type].includes(event.actor.kind)) {
    return fail("forbidden_actor", `${event.actor.kind} cannot send ${event.type}`);
  }

  const outcome = apply(state, event);
  if (!outcome.ok) return outcome;
  if (outcome.duplicate) return { ok: true, state, effects: [], duplicate: true };

  const applied = [...state.appliedEventIds, event.eventId].slice(-MILESTONE_RULES.appliedEventMemory);
  return {
    ok: true,
    duplicate: false,
    effects: outcome.effects,
    state: { ...outcome.state, version: state.version + 1, appliedEventIds: applied },
  };
}

type ApplyResult =
  | { ok: true; duplicate: false; state: MilestoneState; effects: Effect[] }
  | { ok: true; duplicate: true }
  | { ok: false; code: TransitionErrorCode; message: string };

function apply(s: MilestoneState, e: MilestoneEvent): ApplyResult {
  switch (e.type) {
    case "ACCEPT":
      if (s.status !== "offered") return badState(s, e);
      return next({ ...s, status: "accepted" });

    case "CANCEL":
      if (s.status !== "offered" && s.status !== "accepted") return badState(s, e);
      return next({ ...s, status: "cancelled" });

    case "START_FUNDING": {
      // Re-funding after a failed or expired release keeps the passed check.
      if (s.status !== "accepted" && s.status !== "release_failed") return badState(s, e);
      if (!e.earlierMilestonesReleased && !e.allowParallel) {
        return fail("funding_out_of_order", "Earlier milestones must be released first, unless the client funds in parallel");
      }
      return next({ ...s, status: "funding", orderId: e.orderId });
    }

    case "FUNDING_ABANDONED":
    case "FUNDING_FAILED": {
      if (s.status !== "funding") return badState(s, e);
      const back: MilestoneStatus = s.verifiedAt ? "release_failed" : "accepted";
      return next({ ...s, status: back, orderId: null }, [
        { type: "notify", to: "freelancer", message: "Funding did not complete. Don't start work until the milestone is funded." },
      ]);
    }

    case "AUTHORIZED": {
      if (s.authorization?.authorizationId === e.authorizationId) return { ok: true, duplicate: true };
      if (s.status !== "funding") return badState(s, e);
      if (e.orderId !== s.orderId) return fail("invalid_event", "Authorization is for a different PayPal order");
      if (e.amountMinor !== s.fundMinor || e.currency !== s.currency) {
        return fail(
          "amount_mismatch",
          `Authorized ${e.amountMinor} ${e.currency} but the locked price is ${s.fundMinor} ${s.currency}`,
        );
      }
      const authorization = makeAuthorization(e.authorizationId, e.at, e.amountMinor, e.currency);
      // A milestone verified before a release failure goes straight back to verified.
      const status: MilestoneStatus = s.verifiedAt ? "verified" : "funded";
      return next({ ...s, status, authorization }, [
        { type: "notify", to: "freelancer", message: "Milestone funded. You can start work." },
      ]);
    }

    case "REAUTHORIZED": {
      if (!s.authorization) return badState(s, e);
      if (s.authorization.authorizationId === e.authorizationId) return { ok: true, duplicate: true };
      if (!["funded", "submitted", "changes_requested", "needs_review", "verified", "releasing"].includes(s.status)) {
        return badState(s, e);
      }
      // A reauthorization issues a new ID and restarts the honor period; the 29-day validity does not move.
      const honorUntil = addDays(e.at, MILESTONE_RULES.honorPeriodDays);
      return next({
        ...s,
        authorization: {
          ...s.authorization,
          authorizationId: e.authorizationId,
          honorUntil: honorUntil < s.authorization.expiresAt ? honorUntil : s.authorization.expiresAt,
        },
      });
    }

    case "SUBMIT": {
      if (!["funded", "changes_requested", "needs_review"].includes(s.status)) {
        return fail(
          "invalid_transition",
          s.status === "accepted" || s.status === "funding" || s.status === "offered"
            ? "Work can be submitted only once the milestone is funded"
            : `Cannot submit while ${s.status}`,
        );
      }
      if (!originAllowed(e.evidenceUrl, s.contractedOrigins)) {
        return fail("origin_not_contracted", `${e.evidenceUrl} is not the contracted project`);
      }
      const dayAgo = e.at.getTime() - 86_400_000;
      const recent = s.submissions.filter((x) => x.at.getTime() > dayAgo).length;
      if (recent >= MILESTONE_RULES.maxChecksPerDay) {
        return fail("check_limit_reached", `At most ${MILESTONE_RULES.maxChecksPerDay} checks a day per milestone`);
      }
      const attempt = s.checkAttempts + 1;
      const submission: Submission = { at: e.at, evidenceUrl: e.evidenceUrl, commitSha: e.commitSha };
      return next({ ...s, status: "submitted", submissions: [...s.submissions, submission], checkAttempts: attempt }, [
        { type: "checker.run", evidenceUrl: e.evidenceUrl, attempt, commitSha: e.commitSha },
      ]);
    }

    case "CHECK_COMPLETED": {
      if (s.status !== "submitted") return badState(s, e);
      if (e.results.length === 0) return fail("invalid_event", "A check must report at least one criterion");
      const lastCheck = { at: e.at, attempt: s.checkAttempts, results: e.results, commitSha: e.commitSha };
      if (e.results.some((r) => r.outcome === "fail")) {
        return next({ ...s, status: "changes_requested", lastCheck }, [
          { type: "notify", to: "freelancer", message: "Some criteria failed. Fix them and resubmit, or challenge the result." },
        ]);
      }
      // "Couldn't check" is never "failed": a person decides.
      if (e.results.some((r) => r.outcome === "couldnt_check")) {
        return next({ ...s, status: "needs_review", lastCheck }, [
          { type: "notify", to: "client", message: "The checker couldn't verify every criterion. Please review." },
        ]);
      }
      return next({ ...s, status: "verified", lastCheck, verifiedAt: e.at, firstPass: s.checkAttempts === 1 }, [
        { type: "notify", to: "client", message: "Every criterion passed. Approve to release payment." },
      ]);
    }

    case "CHALLENGE":
      if (s.status !== "changes_requested") return badState(s, e);
      return next({ ...s, status: "needs_review" }, [
        { type: "notify", to: "client", message: `The freelancer challenged the check: ${e.reason}` },
      ]);

    case "CLIENT_APPROVE":
      // The client may approve a verified milestone, or judge one the checker couldn't.
      if (s.status !== "verified" && s.status !== "needs_review") return badState(s, e);
      return startRelease(s, e, s.verifiedAt ?? e.at);

    case "AUTO_RELEASE": {
      // Only when every check passed; never from needs_review.
      if (s.status !== "verified" || !s.verifiedAt) return badState(s, e);
      const opensAt = s.verifiedAt.getTime() + MILESTONE_RULES.reviewWindowHours * 3_600_000;
      if (e.at.getTime() < opensAt) {
        return fail("review_window_open", "The client's review window has not ended");
      }
      return startRelease(s, e, s.verifiedAt);
    }

    case "CAPTURE_PENDING":
      if (s.captureId === e.captureId && s.status !== "releasing") return { ok: true, duplicate: true };
      if (s.status !== "releasing") return badState(s, e);
      return next({ ...s, status: "release_pending", captureId: e.captureId });

    case "CAPTURE_COMPLETED": {
      if (s.captureId === e.captureId && ["released", "payout_pending", "paid_out"].includes(s.status)) {
        return { ok: true, duplicate: true };
      }
      if (s.status !== "releasing" && s.status !== "release_pending") return badState(s, e);
      if (e.amountMinor !== s.fundMinor || e.currency !== s.currency) {
        return fail("amount_mismatch", "Captured amount differs from the locked price");
      }
      return next({ ...s, status: "released", captureId: e.captureId }, [
        { type: "payout.send", amountMinor: s.payoutMinor, currency: s.currency, idempotencyKey: `payout-${s.id}` },
      ]);
    }

    case "CAPTURE_FAILED":
      if (s.status !== "releasing" && s.status !== "release_pending") return badState(s, e);
      return next({ ...s, status: "release_failed", authorization: null, captureId: null }, [
        { type: "notify", to: "client", message: `Payment could not be released (${e.reason}). Please fund the milestone again.` },
      ]);

    case "PAYOUT_SENT":
      if (s.status === "payout_pending") return { ok: true, duplicate: true };
      if (s.status !== "released") return badState(s, e);
      return next({ ...s, status: "payout_pending" });

    case "PAYOUT_COMPLETED":
      if (s.status === "paid_out") return { ok: true, duplicate: true };
      if (s.status !== "payout_pending") return badState(s, e);
      return next({ ...s, status: "paid_out" });

    case "PAYOUT_FAILED":
      // Money stays captured and owed; retried after the freelancer fixes their account.
      if (s.status !== "payout_pending" && s.status !== "released") return badState(s, e);
      return next({ ...s, status: "payout_pending", payoutFailures: s.payoutFailures + 1 }, [
        { type: "notify", to: "freelancer", message: `Payout failed (${e.reason}). Check your PayPal account; we'll retry.` },
      ]);

    case "VOID": {
      if (!["funding", "funded", "submitted", "changes_requested"].includes(s.status)) return badState(s, e);
      const effects: Effect[] = s.authorization
        ? [{ type: "paypal.void", authorizationId: s.authorization.authorizationId, idempotencyKey: `void-${s.id}-${s.authorization.authorizationId}` }]
        : [];
      return next({ ...s, status: "voided" }, effects);
    }

    case "OPEN_DISPUTE": {
      if (!["changes_requested", "needs_review", "verified", "released", "payout_pending"].includes(s.status)) {
        return badState(s, e);
      }
      return next({ ...s, status: "disputed", disputedFrom: s.status });
    }

    case "RESOLVE_DISPUTE": {
      if (s.status !== "disputed" || !s.disputedFrom) return badState(s, e);
      if (e.outcome === "reject_dispute") return next({ ...s, status: s.disputedFrom, disputedFrom: null });
      if (e.outcome === "void") {
        if (["released", "payout_pending"].includes(s.disputedFrom)) {
          return fail("invalid_transition", "Captured money is refunded through PayPal, not voided");
        }
        const effects: Effect[] = s.authorization
          ? [{ type: "paypal.void", authorizationId: s.authorization.authorizationId, idempotencyKey: `void-${s.id}-${s.authorization.authorizationId}` }]
          : [];
        return next({ ...s, status: "voided", disputedFrom: null }, effects);
      }
      // outcome === "release"
      if (["released", "payout_pending"].includes(s.disputedFrom)) {
        return next({ ...s, status: s.disputedFrom, disputedFrom: null });
      }
      const released = startRelease({ ...s, disputedFrom: null }, e, s.verifiedAt ?? e.at);
      return released;
    }
  }
}

function startRelease(s: MilestoneState, e: MilestoneEvent, verifiedAt: Date): ApplyResult {
  const health = authorizationHealth(s, e.at);
  if (health === "none" || health === "expired" || !s.authorization) {
    return fail("authorization_expired", "The PayPal hold has expired; the client must fund the milestone again");
  }
  const auth = s.authorization;
  const effects: Effect[] = [];
  if (health === "needs_reauthorization") {
    effects.push({ type: "paypal.reauthorize", authorizationId: auth.authorizationId, idempotencyKey: `reauth-${s.id}-${auth.authorizationId}` });
  }
  effects.push({
    type: "paypal.capture",
    authorizationId: auth.authorizationId,
    amountMinor: s.fundMinor,
    currency: s.currency,
    idempotencyKey: `capture-${s.id}`,
  });
  return next({ ...s, status: "releasing", verifiedAt }, effects);
}

function makeAuthorization(authorizationId: string, at: Date, amountMinor: Minor, currency: CurrencyCode): Authorization {
  return {
    authorizationId,
    authorizedAt: at,
    honorUntil: addDays(at, MILESTONE_RULES.honorPeriodDays),
    expiresAt: addDays(at, MILESTONE_RULES.authorizationValidDays),
    amountMinor,
    currency,
  };
}

export function originAllowed(evidenceUrl: string, contracted: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(evidenceUrl);
  } catch {
    return false;
  }
  // https only; plain http just for a local dev server (agent deliveries hosted by the app itself).
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return false;
  const normalized = `${url.origin}${url.pathname}`.toLowerCase();
  return contracted.some((allowed) => {
    let a: URL;
    try {
      a = new URL(allowed);
    } catch {
      return false;
    }
    if (a.origin.toLowerCase() !== url.origin.toLowerCase()) return false;
    const prefix = `${a.origin}${a.pathname}`.toLowerCase().replace(/\/$/, "");
    return normalized === prefix || normalized.startsWith(`${prefix}/`) || a.pathname === "/";
  });
}

function next(state: MilestoneState, effects: Effect[] = []): ApplyResult {
  return { ok: true, duplicate: false, state, effects };
}

function fail(code: TransitionErrorCode, message: string): { ok: false; code: TransitionErrorCode; message: string } {
  return { ok: false, code, message };
}

function badState(s: MilestoneState, e: MilestoneEvent) {
  return fail("invalid_transition", `Cannot apply ${e.type} while the milestone is ${s.status}`);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

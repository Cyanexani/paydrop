/**
 * Background jobs. Each is idempotent (event ids are derived from the milestone version or
 * PayPal ids) so the Render worker, the cron job and the /api/cron endpoints can overlap safely.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contracts, milestones, payouts } from "@/db/schema";
import { authorizationHealth, MILESTONE_RULES, type MilestoneEvent } from "@/lib/milestones/state-machine";
import { fromPayPalAmount, getCapture } from "@/lib/paypal/client";
import type { CurrencyCode } from "@/lib/money";
import { runEffects } from "./effects";
import { applyMilestoneEvent, fromStored } from "./milestone-store";

const SYSTEM = { kind: "system", id: "jobs" } as const;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const JOB_RULES = {
  staleFundingHours: 3,
  offerExpiryHours: 48,
  silentAfterDueDays: 3,
  payoutRetryMinutes: 60,
  maxPayoutAttempts: 5,
  stuckCheckMinutes: 15,
  holdWarningDays: 4,
};

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

async function fire(db: Db, milestoneId: string, body: Body, eventId: string, now: Date, actor: MilestoneEvent["actor"] = SYSTEM) {
  const r = await applyMilestoneEvent(db, milestoneId, { ...body, eventId, at: now, actor } as MilestoneEvent);
  if (r.ok && !r.duplicate && r.effects.length) await runEffects(db, milestoneId, r.effects);
  return r.ok && !r.duplicate;
}

const rowsIn = (db: Db, statuses: string[]) => db.select().from(milestones).where(inArray(milestones.status, statuses));

/** Client never approves: release automatically once the review window passes, only if every check passed. */
export async function autoRelease(db: Db, now = new Date()) {
  let n = 0;
  for (const row of await rowsIn(db, ["verified"])) {
    const s = fromStored(row.state);
    if (!s.verifiedAt || now.getTime() < s.verifiedAt.getTime() + MILESTONE_RULES.reviewWindowHours * HOUR) continue;
    if (s.lastCheck?.results.some((r) => r.outcome !== "pass")) continue;
    if (await fire(db, row.id, { type: "AUTO_RELEASE" }, `auto-release-${row.id}-v${row.version}`, now)) n++;
  }
  return n;
}

/** Holds: void expired ones on unfinished work; warn the client before a hold on finished work expires. */
export async function holds(db: Db, now = new Date()) {
  let voided = 0;
  let warned = 0;
  for (const row of await rowsIn(db, ["funded", "submitted", "changes_requested", "needs_review", "verified"])) {
    const s = fromStored(row.state);
    const health = authorizationHealth(s, now);
    if (health === "expired" && ["funded", "submitted", "changes_requested"].includes(s.status)) {
      if (await fire(db, row.id, { type: "VOID", reason: "authorization_expired" }, `expire-${row.id}-${s.authorization?.authorizationId}`, now)) voided++;
    } else if (s.authorization && s.authorization.expiresAt.getTime() - now.getTime() < JOB_RULES.holdWarningDays * DAY && health !== "expired") {
      console.info(`[notify client] ${row.id}: PayPal hold expires ${s.authorization.expiresAt.toISOString()}; approve or re-fund before then`);
      warned++;
    }
  }
  return { voided, warned };
}

/** Client abandons PayPal checkout: clear orders left unapproved for hours. */
export async function staleFunding(db: Db, now = new Date()) {
  let n = 0;
  const cutoff = new Date(now.getTime() - JOB_RULES.staleFundingHours * HOUR);
  for (const row of await db.select().from(milestones).where(and(eq(milestones.status, "funding"), lt(milestones.updatedAt, cutoff)))) {
    const s = fromStored(row.state);
    if (await fire(db, row.id, { type: "FUNDING_ABANDONED" }, `abandon-${s.orderId}`, now)) n++;
  }
  return n;
}

/** Offer gets no reply: expire it after 48 hours. */
export async function offerExpiry(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - JOB_RULES.offerExpiryHours * HOUR);
  const stale = await db.select().from(contracts).where(and(eq(contracts.status, "offered"), lt(contracts.createdAt, cutoff)));
  for (const c of stale) {
    for (const m of await db.select().from(milestones).where(eq(milestones.contractId, c.id))) {
      await fire(db, m.id, { type: "CANCEL" }, `expire-offer-${m.id}`, now);
    }
    await db.update(contracts).set({ status: "cancelled" }).where(eq(contracts.id, c.id));
  }
  return stale.length;
}

/** Freelancer goes silent: nothing submitted 3 days past the due date → void the hold so the client can reassign. */
export async function silentFreelancers(db: Db, now = new Date()) {
  let n = 0;
  for (const row of await rowsIn(db, ["funded"])) {
    if (!row.dueAt || now.getTime() < row.dueAt.getTime() + JOB_RULES.silentAfterDueDays * DAY) continue;
    const s = fromStored(row.state);
    if (s.submissions.length > 0) continue;
    if (await fire(db, row.id, { type: "VOID", reason: "freelancer_silent" }, `silent-${row.id}`, now)) n++;
  }
  return n;
}

/** Payout fails: retry failed items (only those) in a new batch, up to 5 attempts. */
export async function retryPayouts(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - JOB_RULES.payoutRetryMinutes * 60_000);
  const failed = await db.select().from(payouts).where(and(eq(payouts.status, "failed"), lt(payouts.updatedAt, cutoff), lt(payouts.attempt, JOB_RULES.maxPayoutAttempts)));
  const ids = [...new Set(failed.map((p) => p.milestoneId))];
  for (const id of ids) {
    const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
    const s = fromStored(row.state);
    await runEffects(db, id, [{ type: "payout.send", amountMinor: s.payoutMinor, currency: s.currency, idempotencyKey: `payout-${id}` }]);
  }
  return ids.length;
}

/** A check that never reported back (crash, deploy) is run again with the same attempt number. */
export async function stuckChecks(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - JOB_RULES.stuckCheckMinutes * 60_000);
  const stuck = await db.select().from(milestones).where(and(eq(milestones.status, "submitted"), lt(milestones.updatedAt, cutoff)));
  for (const row of stuck) {
    const s = fromStored(row.state);
    const last = s.submissions.at(-1);
    if (!last) continue;
    await runEffects(db, row.id, [{ type: "checker.run", evidenceUrl: last.evidenceUrl, attempt: s.checkAttempts, commitSha: last.commitSha }]);
  }
  return stuck.length;
}

/** Missed webhook: ask PayPal for the truth on anything mid-release. */
export async function reconcile(db: Db, now = new Date()) {
  let n = 0;
  for (const row of await rowsIn(db, ["releasing", "release_pending"])) {
    const s = fromStored(row.state);
    if (s.status === "releasing" && s.authorization) {
      // The capture request may have timed out: repeat it with the same PayPal-Request-Id (deduplicated by PayPal).
      await runEffects(db, row.id, [
        { type: "paypal.capture", authorizationId: s.authorization.authorizationId, amountMinor: s.fundMinor, currency: s.currency, idempotencyKey: `capture-${row.id}` },
      ]);
      n++;
    } else if (s.status === "release_pending" && s.captureId) {
      const cap = await getCapture(s.captureId).catch(() => null);
      if (cap?.status === "COMPLETED" && cap.amount) {
        const { amountMinor, currency } = fromPayPalAmount(cap.amount);
        if (await fire(db, row.id, { type: "CAPTURE_COMPLETED", captureId: cap.id, amountMinor, currency: currency as CurrencyCode }, `reconcile-${cap.id}-completed`, now, { kind: "paypal", id: "reconcile" })) n++;
      } else if (cap && ["DECLINED", "FAILED"].includes(cap.status)) {
        if (await fire(db, row.id, { type: "CAPTURE_FAILED", reason: cap.status }, `reconcile-${cap.id}-failed`, now, { kind: "paypal", id: "reconcile" })) n++;
      }
    }
  }
  return n;
}

export const JOBS = {
  "auto-release": autoRelease,
  holds,
  "stale-funding": staleFunding,
  offers: offerExpiry,
  silent: silentFreelancers,
  payouts: retryPayouts,
  checks: stuckChecks,
  reconcile,
} as const;
export type JobName = keyof typeof JOBS;

export async function runJobs(db: Db, names: JobName[] = Object.keys(JOBS) as JobName[], now = new Date()) {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    try {
      out[name] = await JOBS[name](db, now);
    } catch (error) {
      out[name] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return out;
}

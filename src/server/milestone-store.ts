import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { milestoneEvents, milestones } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { afterTransition } from "./hooks";
import { emitEvent } from "./integrations";
import {
  transition,
  type Effect,
  type MilestoneEvent,
  type MilestoneState,
  type TransitionErrorCode,
} from "@/lib/milestones/state-machine";

/** MilestoneState with Dates as ISO strings, as kept in the jsonb column. */
export type StoredMilestoneState = Jsonified<MilestoneState>;
type Jsonified<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;

export function toStored(state: MilestoneState): StoredMilestoneState {
  return JSON.parse(JSON.stringify(state)) as StoredMilestoneState;
}

export function fromStored(s: StoredMilestoneState): MilestoneState {
  return {
    ...s,
    authorization: s.authorization
      ? {
          ...s.authorization,
          authorizedAt: new Date(s.authorization.authorizedAt),
          honorUntil: new Date(s.authorization.honorUntil),
          expiresAt: new Date(s.authorization.expiresAt),
        }
      : null,
    submissions: s.submissions.map((x) => ({ ...x, at: new Date(x.at) })),
    lastCheck: s.lastCheck ? { ...s.lastCheck, at: new Date(s.lastCheck.at) } : null,
    verifiedAt: s.verifiedAt ? new Date(s.verifiedAt) : null,
  };
}

export type ApplyOutcome =
  | { ok: true; state: MilestoneState; effects: Effect[]; duplicate: boolean }
  | { ok: false; code: TransitionErrorCode | "not_found" | "conflict"; message: string };

class VersionConflict extends Error {}

/**
 * Apply one event to a stored milestone.
 * - The event id is the primary key of milestone_events, so a replayed event is a no-op.
 * - The row is written with compare-and-set on `version`; if a webhook and a cron job race,
 *   the loser re-reads and re-applies (up to 3 times).
 */
export async function applyMilestoneEvent(db: Db, milestoneId: string, event: MilestoneEvent): Promise<ApplyOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
    if (!row) return { ok: false, code: "not_found", message: `No milestone ${milestoneId}` };

    const current = fromStored(row.state);
    const [seen] = await db
      .select({ id: milestoneEvents.eventId })
      .from(milestoneEvents)
      .where(eq(milestoneEvents.eventId, event.eventId));
    if (seen) return { ok: true, state: current, effects: [], duplicate: true };

    const result = transition(current, event);
    if (!result.ok) return result;
    if (result.duplicate) return result;

    const { eventId, at, actor, ...body } = event;
    try {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(milestones)
          .set({
            state: toStored(result.state),
            status: result.state.status,
            version: result.state.version,
            updatedAt: at,
          })
          .where(and(eq(milestones.id, milestoneId), eq(milestones.version, row.version)))
          .returning({ id: milestones.id });
        if (updated.length === 0) throw new VersionConflict();
        await afterTransition(tx as unknown as Db, row, current, result.state, event);
        await tx.insert(milestoneEvents).values({
          eventId,
          milestoneId,
          type: event.type,
          actorKind: actor.kind,
          actorId: actor.id,
          fromStatus: current.status,
          toStatus: result.state.status,
          payload: body as Record<string, unknown>,
          createdAt: at,
        });
      });
      if (result.state.status !== current.status) void announce(row, result.state);
      return result;
    } catch (error) {
      if (error instanceof VersionConflict) continue;
      // A concurrent writer recorded the same event id first: treat as a replay.
      if (isUniqueViolation(error)) {
        const [fresh] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
        return { ok: true, state: fromStored(fresh.state), effects: [], duplicate: true };
      }
      throw error;
    }
  }
  return { ok: false, code: "conflict", message: "The milestone kept changing; try again" };
}

/** Outbound integration events (Zapier → Slack/Sheets) after the change is committed. */
async function announce(row: typeof milestones.$inferSelect, state: MilestoneState) {
  const base = { contractId: row.contractId, milestoneId: row.id, title: row.draft.title };
  if (state.status === "verified") await emitEvent({ type: "milestone.verified", ...base });
  if (state.status === "released") {
    await emitEvent({ type: "milestone.released", ...base, amount: formatMoney(state.payoutMinor, state.currency), freelancer: "" });
  }
  if (state.status === "paid_out") await emitEvent({ type: "milestone.paid_out", ...base });
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

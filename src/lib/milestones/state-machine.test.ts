import { describe, expect, it } from "vitest";
import {
  authorizationHealth,
  newMilestoneState,
  originAllowed,
  transition,
  type Actor,
  type MilestoneEvent,
  type MilestoneState,
} from "./state-machine";

const T0 = new Date("2026-11-09T10:00:00Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);
const days = (d: number) => hours(d * 24);

const client: Actor = { kind: "client", id: "c1" };
const freelancer: Actor = { kind: "freelancer", id: "f1" };
const paypal: Actor = { kind: "paypal", id: "webhook" };
const system: Actor = { kind: "system", id: "worker" };
const checker: Actor = { kind: "ai_checker", id: "kernel" };
const agent: Actor = { kind: "agent", id: "coding-agent" };

let n = 0;
type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;
function ev(body: Body, actor: Actor, at: Date = T0, eventId = `e${++n}`): MilestoneEvent {
  return { ...body, eventId, at, actor } as MilestoneEvent;
}

function run(state: MilestoneState, ...events: MilestoneEvent[]): MilestoneState {
  for (const e of events) {
    const r = transition(state, e);
    if (!r.ok) throw new Error(`${e.type}: ${r.code} ${r.message}`);
    state = r.state;
  }
  return state;
}

const fresh = () =>
  newMilestoneState({
    id: "m1",
    fundMinor: 8_360_00,
    payoutMinor: 7_960_00,
    currency: "INR",
    contractedOrigins: ["https://jayadance.example"],
  });

function funded(at: Date = T0): MilestoneState {
  return run(
    fresh(),
    ev({ type: "ACCEPT" }, freelancer, at),
    ev({ type: "START_FUNDING", orderId: "O1", earlierMilestonesReleased: true, allowParallel: false }, client, at),
    ev({ type: "AUTHORIZED", orderId: "O1", authorizationId: "A1", amountMinor: 8_360_00, currency: "INR" }, paypal, at),
  );
}

function verified(at: Date = T0): MilestoneState {
  return run(
    funded(at),
    ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/booking" }, freelancer, at),
    ev({ type: "CHECK_COMPLETED", results: [{ criterionId: "c1", outcome: "pass" }] }, checker, at),
  );
}

describe("happy path", () => {
  it("offered → funded → verified → released → paid out, with the right effects", () => {
    let s = verified();
    expect(s.status).toBe("verified");
    expect(s.firstPass).toBe(true);

    const approve = transition(s, ev({ type: "CLIENT_APPROVE" }, client, hours(1)));
    if (!approve.ok) throw new Error(approve.message);
    expect(approve.state.status).toBe("releasing");
    expect(approve.effects).toEqual([
      { type: "paypal.capture", authorizationId: "A1", amountMinor: 8_360_00, currency: "INR", idempotencyKey: "capture-m1" },
    ]);
    s = approve.state;

    const captured = transition(s, ev({ type: "CAPTURE_COMPLETED", captureId: "CAP1", amountMinor: 8_360_00, currency: "INR" }, paypal));
    if (!captured.ok) throw new Error(captured.message);
    expect(captured.state.status).toBe("released");
    // The freelancer is paid the milestone price; the platform fee stays behind.
    expect(captured.effects[0]).toMatchObject({ type: "payout.send", amountMinor: 7_960_00, idempotencyKey: "payout-m1" });

    s = run(captured.state, ev({ type: "PAYOUT_SENT", batchId: "B1" }, system), ev({ type: "PAYOUT_COMPLETED" }, paypal));
    expect(s.status).toBe("paid_out");
  });
});

describe("edge cases (brief table)", () => {
  it("AI wrongly passes bad work: the checker and agents can never release money", () => {
    const s = verified();
    for (const actor of [checker, agent]) {
      const r = transition(s, ev({ type: "CLIENT_APPROVE" }, actor, hours(1)));
      expect(r).toMatchObject({ ok: false, code: "forbidden_actor" });
    }
    expect(transition(s, ev({ type: "AUTO_RELEASE" }, agent, days(4)))).toMatchObject({ ok: false, code: "forbidden_actor" });
  });

  it("Client never approves: auto-release only after the review window, and only when every check passed", () => {
    const s = verified();
    expect(transition(s, ev({ type: "AUTO_RELEASE" }, system, hours(71)))).toMatchObject({ ok: false, code: "review_window_open" });
    const r = transition(s, ev({ type: "AUTO_RELEASE" }, system, hours(73)));
    expect(r.ok && r.state.status).toBe("releasing");
  });

  it("Live site down / couldn't check: goes to the client, never auto-released, never 'failed'", () => {
    const s = run(
      funded(),
      ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer),
      ev({ type: "CHECK_COMPLETED", results: [{ criterionId: "c1", outcome: "pass" }, { criterionId: "c2", outcome: "couldnt_check" }] }, checker),
    );
    expect(s.status).toBe("needs_review");
    expect(transition(s, ev({ type: "AUTO_RELEASE" }, system, days(10)))).toMatchObject({ ok: false, code: "invalid_transition" });
    const r = transition(s, ev({ type: "CLIENT_APPROVE" }, client, hours(2)));
    expect(r.ok && r.state.status).toBe("releasing");
  });

  it("AI wrongly fails good work: the freelancer challenges and a person decides", () => {
    const s = run(
      funded(),
      ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer),
      ev({ type: "CHECK_COMPLETED", results: [{ criterionId: "c1", outcome: "fail" }] }, checker),
      ev({ type: "CHALLENGE", reason: "The booking form works; the checker used the wrong date" }, freelancer),
    );
    expect(s.status).toBe("needs_review");
  });

  it("Double release (duplicate webhook or click): replayed events and repeat captures are no-ops", () => {
    const releasing = run(verified(), ev({ type: "CLIENT_APPROVE" }, client, hours(1)));
    const capture = ev({ type: "CAPTURE_COMPLETED", captureId: "CAP1", amountMinor: 8_360_00, currency: "INR" }, paypal);
    const first = transition(releasing, capture);
    if (!first.ok) throw new Error(first.message);
    expect(first.effects).toHaveLength(1);

    const sameEvent = transition(first.state, capture);
    expect(sameEvent).toMatchObject({ ok: true, duplicate: true, effects: [] });

    // Same capture reported again under a different event id (webhook after our own API response).
    const sameCapture = transition(first.state, { ...capture, eventId: "webhook-copy" });
    expect(sameCapture).toMatchObject({ ok: true, duplicate: true, effects: [] });
    expect(sameCapture.ok && sameCapture.state.version).toBe(first.state.version);

    // A double click on approve cannot start a second capture.
    const again = transition(first.state, ev({ type: "CLIENT_APPROVE" }, client, hours(2)));
    expect(again).toMatchObject({ ok: false, code: "invalid_transition" });
  });

  it("Amount changed in the browser: a mismatched authorization is rejected", () => {
    const s = run(
      fresh(),
      ev({ type: "ACCEPT" }, freelancer),
      ev({ type: "START_FUNDING", orderId: "O1", earlierMilestonesReleased: true, allowParallel: false }, client),
    );
    const r = transition(s, ev({ type: "AUTHORIZED", orderId: "O1", authorizationId: "A1", amountMinor: 1_00, currency: "INR" }, paypal));
    expect(r).toMatchObject({ ok: false, code: "amount_mismatch" });
    const wrongCurrency = transition(s, ev({ type: "AUTHORIZED", orderId: "O1", authorizationId: "A1", amountMinor: 8_360_00, currency: "USD" }, paypal));
    expect(wrongCurrency).toMatchObject({ ok: false, code: "amount_mismatch" });
  });

  it("Funding fails / client abandons checkout: milestone stays unfunded and work can't be submitted", () => {
    const s = run(
      fresh(),
      ev({ type: "ACCEPT" }, freelancer),
      ev({ type: "START_FUNDING", orderId: "O1", earlierMilestonesReleased: true, allowParallel: false }, client),
      ev({ type: "FUNDING_ABANDONED" }, system),
    );
    expect(s.status).toBe("accepted");
    expect(s.orderId).toBeNull();
    const submit = transition(s, ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer));
    expect(submit).toMatchObject({ ok: false, message: "Work can be submitted only once the milestone is funded" });
  });

  it("Milestones depend on each other: funding waits for earlier releases unless the client funds in parallel", () => {
    const s = run(fresh(), ev({ type: "ACCEPT" }, freelancer));
    expect(
      transition(s, ev({ type: "START_FUNDING", orderId: "O2", earlierMilestonesReleased: false, allowParallel: false }, client)),
    ).toMatchObject({ ok: false, code: "funding_out_of_order" });
    const parallel = transition(s, ev({ type: "START_FUNDING", orderId: "O2", earlierMilestonesReleased: false, allowParallel: true }, client));
    expect(parallel.ok).toBe(true);
  });

  it("Submitted URL isn't the contracted project: rejected", () => {
    const r = transition(funded(), ev({ type: "SUBMIT", evidenceUrl: "https://someone-else.example/" }, freelancer));
    expect(r).toMatchObject({ ok: false, code: "origin_not_contracted" });
    expect(originAllowed("http://jayadance.example/", ["https://jayadance.example"])).toBe(false);
    expect(originAllowed("http://localhost:3000/deliveries/ct_1/", ["http://localhost:3000/deliveries/ct_1"])).toBe(true);
    expect(originAllowed("http://localhost:3000/deliveries/ct_2/", ["http://localhost:3000/deliveries/ct_1"])).toBe(false);
    expect(originAllowed("https://github.com/me/site/tree/main", ["https://github.com/me/site"])).toBe(true);
    expect(originAllowed("https://github.com/me/site-evil", ["https://github.com/me/site"])).toBe(false);
  });

  it("Freelancer resubmits until the AI passes: at most 3 checks a day, first-pass only on attempt 1", () => {
    let s = funded();
    for (let i = 0; i < 3; i++) {
      s = run(
        s,
        ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer, hours(i)),
        ev({ type: "CHECK_COMPLETED", results: [{ criterionId: "c1", outcome: "fail" }] }, checker, hours(i)),
      );
    }
    expect(transition(s, ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer, hours(5)))).toMatchObject({
      ok: false,
      code: "check_limit_reached",
    });
    s = run(
      s,
      ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer, hours(25)),
      ev({ type: "CHECK_COMPLETED", results: [{ criterionId: "c1", outcome: "pass" }] }, checker, hours(25)),
    );
    expect(s.status).toBe("verified");
    expect(s.firstPass).toBe(false);
    expect(s.checkAttempts).toBe(4);
  });

  it("Authorization past the 3-day honor period: reauthorize before capture", () => {
    const s = verified();
    expect(authorizationHealth(s, days(2))).toBe("honored");
    expect(authorizationHealth(s, days(5))).toBe("needs_reauthorization");
    const r = transition(s, ev({ type: "CLIENT_APPROVE" }, client, days(5)));
    if (!r.ok) throw new Error(r.message);
    expect(r.effects.map((e) => e.type)).toEqual(["paypal.reauthorize", "paypal.capture"]);
  });

  it("Authorization expires: release is refused and the client must re-fund", () => {
    const s = verified();
    expect(authorizationHealth(s, days(29))).toBe("expired");
    expect(transition(s, ev({ type: "CLIENT_APPROVE" }, client, days(30)))).toMatchObject({ ok: false, code: "authorization_expired" });
  });

  it("Reauthorization restarts the honor period but never extends the 29-day hold", () => {
    const s = run(verified(), ev({ type: "REAUTHORIZED", authorizationId: "A2" }, paypal, days(27)));
    expect(s.authorization?.authorizationId).toBe("A2");
    expect(s.authorization?.honorUntil.getTime()).toBe(days(29).getTime());
  });

  it("Capture comes back pending: no payout until it completes", () => {
    const s = run(verified(), ev({ type: "CLIENT_APPROVE" }, client), ev({ type: "CAPTURE_PENDING", captureId: "CAP1" }, paypal));
    expect(s.status).toBe("release_pending");
    expect(transition(s, ev({ type: "PAYOUT_SENT", batchId: "B1" }, system))).toMatchObject({ ok: false });
    const done = transition(s, ev({ type: "CAPTURE_COMPLETED", captureId: "CAP1", amountMinor: 8_360_00, currency: "INR" }, paypal));
    expect(done.ok && done.effects[0].type).toBe("payout.send");
  });

  it("Capture fails at release: re-funding keeps the passed check", () => {
    let s = run(verified(), ev({ type: "CLIENT_APPROVE" }, client), ev({ type: "CAPTURE_FAILED", reason: "INSTRUMENT_DECLINED" }, paypal));
    expect(s.status).toBe("release_failed");
    s = run(
      s,
      ev({ type: "START_FUNDING", orderId: "O9", earlierMilestonesReleased: true, allowParallel: false }, client, days(1)),
      ev({ type: "AUTHORIZED", orderId: "O9", authorizationId: "A9", amountMinor: 8_360_00, currency: "INR" }, paypal, days(1)),
    );
    expect(s.status).toBe("verified");
    expect(s.authorization?.authorizationId).toBe("A9");
  });

  it("Payout fails: held as payout pending and retried", () => {
    const s = run(
      verified(),
      ev({ type: "CLIENT_APPROVE" }, client),
      ev({ type: "CAPTURE_COMPLETED", captureId: "CAP1", amountMinor: 8_360_00, currency: "INR" }, paypal),
      ev({ type: "PAYOUT_SENT", batchId: "B1" }, system),
      ev({ type: "PAYOUT_FAILED", reason: "RECEIVER_UNREGISTERED" }, paypal),
    );
    expect(s.status).toBe("payout_pending");
    expect(s.payoutFailures).toBe(1);
  });

  it("Freelancer goes silent: the held payment is voided", () => {
    const r = transition(funded(), ev({ type: "VOID", reason: "freelancer_silent" }, system, days(7)));
    if (!r.ok) throw new Error(r.message);
    expect(r.state.status).toBe("voided");
    expect(r.effects).toEqual([{ type: "paypal.void", authorizationId: "A1", idempotencyKey: "void-m1-A1" }]);
  });

  it("verified work can't be voided quietly; it has to go through a dispute", () => {
    expect(transition(verified(), ev({ type: "VOID", reason: "client_cancelled" }, client))).toMatchObject({ ok: false });
    const disputed = run(verified(), ev({ type: "OPEN_DISPUTE", reason: "Gallery images are placeholders" }, client));
    expect(disputed.status).toBe("disputed");
    expect(transition(disputed, ev({ type: "AUTO_RELEASE" }, system, days(10)))).toMatchObject({ ok: false });
    const resolved = transition(disputed, ev({ type: "RESOLVE_DISPUTE", outcome: "release" }, system, hours(5)));
    expect(resolved.ok && resolved.state.status).toBe("releasing");
  });

  it("Webhook and cron update the same milestone at once: version increments per applied event", () => {
    const s = funded();
    expect(s.version).toBe(3);
    const a = transition(s, ev({ type: "VOID", reason: "freelancer_silent" }, system));
    const b = transition(s, ev({ type: "SUBMIT", evidenceUrl: "https://jayadance.example/" }, freelancer));
    // Both computed from version 3; the store's compare-and-set lets only one of them persist.
    expect(a.ok && a.state.version).toBe(4);
    expect(b.ok && b.state.version).toBe(4);
  });
});

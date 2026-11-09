/**
 * One command to rebuild a demo with contracts at every stage (for recording the video, or
 * after a Render instance restarts):
 *
 *   npm run seed:demo
 *
 * PayPal steps are simulated with clearly labelled DEMO ids, so the ledger, timeline and
 * fairness views have data without sandbox keys. Real funding still works on new contracts.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../src/db/client";
import { milestones, payouts, users } from "../src/db/schema";
import type { MilestoneEvent } from "../src/lib/milestones/state-machine";
import { rateMilestone, setCollaborators } from "../src/server/contract-actions";
import { acceptContract, createContract, getContractView } from "../src/server/contracts";
import { applyMilestoneEvent, fromStored } from "../src/server/milestone-store";
import { counterOffer } from "../src/server/negotiation";
import { createQuote } from "../src/server/quotes";
import { postMessage } from "../src/server/scope";
import { ensureSeeded } from "../src/server/seed";

process.env.AI_MODE ??= "mock";
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const BRIEF =
  "Website for my dance studio, Jaya Dance & Fitness: home, classes and contact pages, online class booking with a deposit through PayPal, a photo gallery of our shows, and live on our own domain with good SEO.";

type Body = MilestoneEvent extends infer E ? (E extends MilestoneEvent ? Omit<E, "eventId" | "at" | "actor"> : never) : never;

async function fire(db: Db, id: string, body: Body, actor: MilestoneEvent["actor"], tag: string) {
  const r = await applyMilestoneEvent(db, id, { ...body, eventId: `demo-${tag}-${id}`, at: new Date(), actor } as MilestoneEvent);
  if (!r.ok) throw new Error(`${body.type} on ${id}: ${r.message}`);
}

async function user(db: Db, id: string) {
  return (await db.select().from(users).where(eq(users.id, id)))[0];
}

/** Simulated PayPal hold on a milestone (DEMO order and authorization ids). */
async function fund(db: Db, id: string) {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  const s = fromStored(row.state);
  await fire(db, id, { type: "START_FUNDING", orderId: `DEMO-O-${id}`, earlierMilestonesReleased: true, allowParallel: true }, { kind: "client", id: "client-jaya" }, "fund");
  await fire(db, id, { type: "AUTHORIZED", orderId: `DEMO-O-${id}`, authorizationId: `DEMO-A-${id}`, amountMinor: s.fundMinor, currency: s.currency }, { kind: "paypal", id: "demo-seed" }, "auth");
}

async function verify(db: Db, id: string, url: string) {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  await fire(db, id, { type: "SUBMIT", evidenceUrl: url }, { kind: "freelancer", id: "fl-ravi" }, "submit");
  await fire(
    db,
    id,
    { type: "CHECK_COMPLETED", results: row.draft.criteria.map((_, i) => ({ criterionId: `c${i + 1}`, outcome: "pass" as const, note: "Seeded demo result" })) },
    { kind: "ai_checker", id: "demo-seed" },
    "check",
  );
}

async function payOut(db: Db, id: string) {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  const s = fromStored(row.state);
  await fire(db, id, { type: "CLIENT_APPROVE" }, { kind: "client", id: "client-jaya" }, "approve");
  await fire(db, id, { type: "CAPTURE_COMPLETED", captureId: `DEMO-C-${id}`, amountMinor: s.fundMinor, currency: s.currency }, { kind: "paypal", id: "demo-seed" }, "capture");
  await fire(db, id, { type: "PAYOUT_SENT", batchId: `DEMO-B-${id}` }, { kind: "system", id: "demo-seed" }, "payout-sent");
  await db.update(payouts).set({ status: "succeeded", batchId: `DEMO-B-${id}` }).where(eq(payouts.milestoneId, id));
  await fire(db, id, { type: "PAYOUT_COMPLETED" }, { kind: "paypal", id: "demo-seed" }, "payout-done");
}

async function main() {
  const db = await getDb();
  await ensureSeeded(db);
  const jaya = await user(db, "client-jaya");
  const ravi = await user(db, "fl-ravi");
  const meera = await user(db, "fl-meera");

  // 1. Ravi: milestone 1 paid out and rated, 2 verified (awaiting approval), 3 funded, 4 not funded yet.
  const q1 = await createQuote(db, jaya, { brief: BRIEF, deadlineDays: 14 });
  const a = await createContract(db, jaya, { quoteId: q1.id, freelancerId: "fl-ravi", deliveryUrl: "https://jayadance.example", allowParallel: false }, { baseUrl: BASE });
  await setCollaborators(db, ravi, a.id, { collaborators: [{ name: "Sana (designer)", paypalEmail: "sana.designer@example.com", bps: 2500 }] });
  await acceptContract(db, ravi, a.id);
  const ms = (await getContractView(db, jaya, a.id)).milestones;
  await fund(db, ms[0].id);
  await verify(db, ms[0].id, "https://jayadance.example/");
  await payOut(db, ms[0].id);
  await rateMilestone(db, jaya, ms[0].id, 5);
  await fund(db, ms[1].id);
  await verify(db, ms[1].id, "https://jayadance.example/booking");
  await fund(db, ms[2].id);
  await postMessage(db, jaya, a.id, "Can you also add a blog to the site?");

  // 2. Meera: offered, with a counter-offer waiting for the client.
  const q2 = await createQuote(db, jaya, { brief: BRIEF, deadlineDays: 10 });
  const b = await createContract(db, jaya, { quoteId: q2.id, freelancerId: "fl-meera", deliveryUrl: "https://jayadance.example", allowParallel: false }, { baseUrl: BASE });
  const bm = (await getContractView(db, jaya, b.id)).milestones[1];
  await counterOffer(db, meera, bm.id, { priceMinor: bm.fairBand.highMinor + 1_000_00, reason: "The studio wants three booking types (trial, drop-in, monthly), not one." });

  // 3. BuildBot: first milestone funded, ready for a live agent run.
  const q3 = await createQuote(db, jaya, { brief: BRIEF, deadlineDays: 14 });
  const c = await createContract(db, jaya, { quoteId: q3.id, freelancerId: "agent-buildbot", deliveryUrl: "https://ignored.example", allowParallel: false }, { baseUrl: BASE });
  await acceptContract(db, ravi, c.id);
  await fund(db, (await getContractView(db, jaya, c.id)).milestones[0].id);

  console.log(`Demo ready:\n  ${BASE}/contracts/${a.id}  (Ravi: paid, verified, funded, blog change order)\n  ${BASE}/contracts/${b.id}  (Meera: counter-offer)\n  ${BASE}/contracts/${c.id}  (BuildBot: run the agent as Ravi)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

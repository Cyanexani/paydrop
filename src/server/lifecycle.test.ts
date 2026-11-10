/**
 * End-to-end money lifecycle against an in-memory database, with PayPal and the browser
 * checker replaced by fakes. Real PayPal sandbox runs need keys; this pins the logic.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type Db } from "@/db/client";
import { changeRequests, contracts, milestones, payouts, users } from "@/db/schema";

const paypal = vi.hoisted(() => ({
  orders: 0,
  captures: [] as Array<{ authorizationId: string; amountMinor: number }>,
  batches: [] as Array<{ senderBatchId: string; items: Array<{ senderItemId: string; amountMinor: number; receiverEmail: string }> }>,
}));

vi.mock("@/lib/paypal/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/paypal/client")>();
  const amount = (minor: number, cur: string) => ({ currency_code: cur, value: (minor / 100).toFixed(2) });
  const orders = new Map<string, { amountMinor: number; currency: string; milestoneId: string }>();
  return {
    ...real,
    createAuthorizeOrder: vi.fn(async (i: { milestoneId: string; amountMinor: number; currency: string; returnUrl?: string }) => {
      const id = `O${++paypal.orders}`;
      orders.set(id, { amountMinor: i.amountMinor, currency: i.currency, milestoneId: i.milestoneId });
      return { id, status: "CREATED", links: i.returnUrl ? [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] : [] };
    }),
    authorizeOrder: vi.fn(async (orderId: string) => {
      const o = orders.get(orderId)!;
      return {
        id: orderId,
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: `A-${orderId}`, status: "CREATED", amount: amount(o.amountMinor, o.currency), custom_id: o.milestoneId }] } }],
      };
    }),
    captureAuthorization: vi.fn(async (i: { authorizationId: string; amountMinor: number; currency: string }) => {
      paypal.captures.push(i);
      return { id: `C-${i.authorizationId}`, status: "COMPLETED", amount: amount(i.amountMinor, i.currency) };
    }),
    createPayout: vi.fn(async (i: (typeof paypal.batches)[number]) => {
      paypal.batches.push(i);
      return { batch_header: { payout_batch_id: `B${paypal.batches.length}`, batch_status: "PENDING" } };
    }),
    voidAuthorization: vi.fn(async () => undefined),
    verifyWebhookSignature: vi.fn(async () => true),
  };
});

vi.mock("@/lib/checker/run", () => ({
  checkerJudge: () => "heuristic",
  runCheck: vi.fn(async (input: { criteria: Array<{ id: string }> }) => ({
    results: input.criteria.map((c) => ({ criterionId: c.id, outcome: "pass", note: "fake checker: observed" })),
    steps: [{ at: new Date().toISOString(), action: "open", detail: "fake" }],
    mode: "local",
    judge: "heuristic",
    replayUrl: "https://replays.example/r1",
    replayFile: null,
    injection: [],
  })),
}));

process.env.AI_MODE = "mock";
process.env.PAYPAL_CURRENCY = "INR";
delete process.env.DEMO_PAYOUT_EMAIL;

const { ensureSeeded } = await import("./seed");
const { createQuote } = await import("./quotes");
const { acceptContract, createContract, getContractView } = await import("./contracts");
const { approveRelease, acceptMilestone, confirmFunding, startFunding, submitWork } = await import("./milestone-actions");
const { setCollaborators, rateMilestone, disputePack } = await import("./contract-actions");
const { handlePayPalWebhook } = await import("./webhooks");
const { postMessage, decideChangeRequest } = await import("./scope");
const { counterOffer, respondToCounter } = await import("./negotiation");

const BRIEF = "Website for my dance studio: class booking with a deposit, a photo gallery of our shows, live on our domain within two weeks.";
let db: Db;
const user = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

async function newContract(freelancerId: string) {
  const client = await user("client-jaya");
  const quote = await createQuote(db, client, { brief: BRIEF, deadlineDays: 14 });
  return createContract(db, client, { quoteId: quote.id, freelancerId, deliveryUrl: "https://jayadance.example", allowParallel: false });
}

beforeAll(async () => {
  db = await createTestDb();
  await ensureSeeded(db);
}, 60_000);

beforeEach(() => {
  paypal.captures.length = 0;
  paypal.batches.length = 0;
});

describe("full milestone lifecycle", () => {
  it("fund → hold → submit → verify → approve → capture → split payouts → paid out → rating", async () => {
    const { id } = await newContract("fl-ravi");
    const ravi = await user("fl-ravi");
    const client = await user("client-jaya");
    await setCollaborators(db, ravi, id, { collaborators: [{ name: "Sana (designer)", paypalEmail: "sana@example.com", bps: 3000 }] });
    await acceptContract(db, ravi, id);

    const view = await getContractView(db, client, id);
    const m1 = view.milestones[0];
    expect(m1.dueAt).not.toBeNull();

    const { orderId } = await startFunding(db, client, m1.id);
    await confirmFunding(db, client, m1.id, orderId);
    let [row] = await db.select().from(milestones).where(eq(milestones.id, m1.id));
    expect(row.status).toBe("funded");
    expect(row.split).toEqual([
      { payeeKey: "fl-ravi", name: "Lead freelancer", bps: 7000, lead: true },
      expect.objectContaining({ name: "Sana (designer)", bps: 3000, lead: false }),
    ]);

    const submitted = await submitWork(db, ravi, m1.id, { evidenceUrl: "https://jayadance.example/" });
    expect(submitted.status).toBe("submitted");
    [row] = await db.select().from(milestones).where(eq(milestones.id, m1.id));
    expect(row.status).toBe("verified"); // the fake checker ran inline (outside a Next request)

    await approveRelease(db, client, m1.id);
    expect(paypal.captures).toEqual([expect.objectContaining({ authorizationId: `A-${orderId}`, amountMinor: m1.fundMinor })]);
    [row] = await db.select().from(milestones).where(eq(milestones.id, m1.id));
    expect(row.status).toBe("payout_pending");

    // One batch, two items, adding up to the milestone price exactly (the fee stays with the platform).
    expect(paypal.batches).toHaveLength(1);
    const items = paypal.batches[0].items;
    expect(items.map((i) => i.amountMinor).reduce((a, b) => a + b, 0)).toBe(m1.payoutMinor);
    expect(items.find((i) => i.receiverEmail === "sana@example.com")?.amountMinor).toBe(Math.floor(m1.payoutMinor * 0.3));

    // Verified outcome recorded on Ravi's reputation.
    const after = await user("fl-ravi");
    expect(after.outcomes.find((o) => o.milestoneId === m1.id)).toMatchObject({ firstPass: true, verified: true, onTime: true, stars: null });

    // PayPal reports each payout item; only when all succeed is the milestone paid out.
    const rows = await db.select().from(payouts).where(eq(payouts.milestoneId, m1.id));
    const hook = (pid: string, n: number) =>
      handlePayPalWebhook(db, new Headers(), JSON.stringify({ id: `WH-${pid}-${n}`, event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_item: { sender_item_id: pid } } }));
    expect((await hook(rows[0].id, 1)).outcome).toContain("others pending");
    expect((await hook(rows[1].id, 1)).outcome).toContain("PAYOUT_COMPLETED");
    expect((await hook(rows[1].id, 1)).outcome).toBe("duplicate"); // same webhook delivered twice
    [row] = await db.select().from(milestones).where(eq(milestones.id, m1.id));
    expect(row.status).toBe("paid_out");

    await rateMilestone(db, client, m1.id, 5);
    await expect(rateMilestone(db, client, m1.id, 1)).rejects.toMatchObject({ code: "already_rated" });
    expect((await user("fl-ravi")).outcomes.find((o) => o.milestoneId === m1.id)?.stars).toBe(5);

    const pack = await disputePack(db, client, id);
    expect(pack.timeline.some((t) => t.kind === "check" && t.link === "https://replays.example/r1")).toBe(true);
    expect(pack.milestones[0].payouts).toHaveLength(2);
  });

  it("scope creep: an out-of-scope request becomes a priced change order with a PayPal link", async () => {
    const { id } = await newContract("fl-asha");
    const asha = await user("fl-asha");
    const client = await user("client-jaya");
    await acceptContract(db, asha, id);

    const thanks = await postMessage(db, client, id, "Thanks, looks great so far!");
    expect(thanks.scope?.verdict).toBe("not_a_request");

    const msg = await postMessage(db, client, id, "Can you also add a blog to the site?");
    expect(msg.scope).toMatchObject({ verdict: "out_of_scope", searchMode: "postgres" });
    const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.contractId, id));
    expect(cr).toMatchObject({ status: "proposed", source: "detector", title: "Blog" });
    expect(cr.pricing?.priceMinor).toBeGreaterThan(0);

    await expect(decideChangeRequest(db, asha, cr.id, "accept")).rejects.toMatchObject({ code: "forbidden" });
    const before = (await db.select().from(contracts).where(eq(contracts.id, id)))[0];
    const decided = await decideChangeRequest(db, client, cr.id, "accept");
    const after = (await db.select().from(contracts).where(eq(contracts.id, id)))[0];
    expect(after.subtotalMinor).toBe(before.subtotalMinor + cr.pricing!.priceMinor);

    await acceptMilestone(db, asha, decided.milestoneId!);
    // Change orders can be paid right away, even though milestone 1 isn't released yet.
    const link = await startFunding(db, client, decided.milestoneId!, { baseUrl: "https://paydrop.example" });
    expect(link.approveUrl).toContain("sandbox.paypal.com");
  });

  it("jobs: auto-release after the review window, offer expiry, silent freelancer", async () => {
    const { autoRelease, offerExpiry, silentFreelancers } = await import("./jobs");
    const client = await user("client-jaya");
    const ravi = await user("fl-ravi");

    // Verified work auto-releases only after 72 hours.
    const a = await newContract("fl-ravi");
    await acceptContract(db, ravi, a.id);
    const m = (await getContractView(db, client, a.id)).milestones[0];
    const { orderId } = await startFunding(db, client, m.id);
    await confirmFunding(db, client, m.id, orderId);
    await submitWork(db, ravi, m.id, { evidenceUrl: "https://jayadance.example/" });
    expect(await autoRelease(db, new Date(Date.now() + 71 * 3_600_000))).toBe(0);
    expect(await autoRelease(db, new Date(Date.now() + 73 * 3_600_000))).toBe(1);
    expect((await db.select().from(milestones).where(eq(milestones.id, m.id)))[0].status).toBe("payout_pending");

    // An offer nobody answers expires after 48 hours.
    const b = await newContract("fl-asha");
    expect(await offerExpiry(db, new Date(Date.now() + 49 * 3_600_000))).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(contracts).where(eq(contracts.id, b.id)))[0].status).toBe("cancelled");

    // Funded, nothing submitted, 3 days past due: the hold is voided.
    const c = await newContract("fl-ravi");
    await acceptContract(db, ravi, c.id);
    const first = (await getContractView(db, client, c.id)).milestones[0];
    const o = await startFunding(db, client, first.id);
    await confirmFunding(db, client, first.id, o.orderId);
    const due = new Date(first.dueAt!).getTime();
    expect(await silentFreelancers(db, new Date(due + 2 * 86_400_000))).toBe(0);
    expect(await silentFreelancers(db, new Date(due + 4 * 86_400_000))).toBe(1);
    expect((await db.select().from(milestones).where(eq(milestones.id, first.id)))[0].status).toBe("voided");
  });

  it("AI agent worker: BuildBot builds, is verified, and its payout goes to its human owner", async () => {
    const { runAgent } = await import("./agent");
    const client = await user("client-jaya");
    const ravi = await user("fl-ravi");
    const quote = await createQuote(db, client, { brief: BRIEF, deadlineDays: 14 });
    const { id } = await createContract(
      db,
      client,
      { quoteId: quote.id, freelancerId: "agent-buildbot", deliveryUrl: "https://ignored.example", allowParallel: false },
      { baseUrl: "http://localhost:3000" },
    );
    const view = await getContractView(db, ravi, id);
    expect(view.role).toBe("agent_owner");
    expect(view.contract.contractedOrigins).toEqual([`http://localhost:3000/deliveries/${id}`]);
    // An agent is priced by the models on its ladder (cheapest first), not by hours.
    const plan = view.milestones[0].agentPlan!;
    expect(plan.ladder).toHaveLength(3);
    expect(plan.rungCostsUsd[0]).toBeLessThanOrEqual(plan.rungCostsUsd[2]);
    expect(view.milestones[0].receipt.fairBand).toMatch(/^Priced by model cost/);
    expect(view.contract.subtotalMinor).toBe(view.milestones.reduce((a, x) => a + x.priceMinor, 0));
    await acceptContract(db, ravi, id);

    const m = view.milestones[0];
    const { orderId } = await startFunding(db, client, m.id);
    await confirmFunding(db, client, m.id, orderId);
    await expect(runAgent(db, await user("fl-asha"), m.id, "http://localhost:3000")).rejects.toMatchObject({ code: "forbidden" });

    const run = await runAgent(db, ravi, m.id, "http://localhost:3000");
    expect(run.files).toEqual(expect.arrayContaining(["/", "/classes", "/contact", "/sitemap.xml"]));
    // No OpenRouter key in tests: rung 1 ran as the offline demo build, with its model estimate recorded.
    expect(run.run).toMatchObject({ rung: 1, mode: "demo", costUsd: 0, estimatedUsd: plan.rungCostsUsd[0] });
    expect((await getContractView(db, ravi, id)).milestones[0].agentRuns).toHaveLength(1);
    expect((await db.select().from(milestones).where(eq(milestones.id, m.id)))[0].status).toBe("verified");

    await approveRelease(db, client, m.id);
    expect(paypal.batches.at(-1)?.items[0].receiverEmail).toBe("ravi.freelancer@example.com");
    // BuildBot's own record gets the verified outcome.
    expect((await user("agent-buildbot")).outcomes.some((o) => o.milestoneId === m.id)).toBe(true);
  });

  it("negotiation: counters outside the fair band need a reason and an AI re-estimate", async () => {
    const { id } = await newContract("fl-meera");
    const meera = await user("fl-meera");
    const client = await user("client-jaya");
    const view = await getContractView(db, client, id);
    const booking = view.milestones[1];

    await expect(counterOffer(db, meera, booking.id, { priceMinor: booking.fairBand.highMinor + 500_00 })).rejects.toMatchObject({ code: "reason_required" });
    const fair = await counterOffer(db, meera, booking.id, { priceMinor: booking.fairBand.highMinor - 100_00 });
    expect(fair.fair).toBe(true);
    await expect(acceptContract(db, meera, id)).rejects.toMatchObject({ message: expect.stringContaining("counter-offer") });
    await respondToCounter(db, client, fair.id, false);

    const second = await counterOffer(db, meera, booking.id, { priceMinor: booking.fairBand.highMinor + 500_00, reason: "The studio wants three booking types, not one" });
    expect(second.fair).toBe(false);
    expect(second.aiEstimate?.suggestedMinor).toBeGreaterThan(booking.priceMinor);
    await respondToCounter(db, client, second.id, true);
    await expect(counterOffer(db, meera, booking.id, { priceMinor: 1_000_00 })).rejects.toMatchObject({ code: "max_rounds" });

    const updated = await getContractView(db, client, id);
    expect(updated.milestones[1].priceMinor).toBe(second.priceMinor);
    expect(updated.contract.subtotalMinor).toBe(updated.milestones.reduce((a, m) => a + m.priceMinor, 0));
    await acceptContract(db, meera, id);
  });
});

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "@/db/client";
import { milestoneEvents, users } from "@/db/schema";
import { acceptContract, createContract, getContractView } from "./contracts";
import { applyMilestoneEvent } from "./milestone-store";
import { createQuote } from "./quotes";
import { ensureSeeded } from "./seed";
import type { Viewer } from "./session";

process.env.AI_MODE = "mock";
process.env.PAYPAL_CURRENCY = "INR";

const BRIEF =
  "Website for my dance studio: class booking with a deposit, a photo gallery of our shows, live on our domain within two weeks.";

let db: Db;
const user = async (id: string): Promise<Viewer> => (await db.select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  db = await createTestDb();
  await ensureSeeded(db);
}, 60_000);

describe("brief → quote → contract → accept", () => {
  it("prices the brief for each matched freelancer from the same base", async () => {
    const quote = await createQuote(db, await user("client-jaya"), { brief: BRIEF, deadlineDays: 14 });
    expect(quote.scope.status).toBe("scoped");
    if (quote.pricing.status !== "priced") throw new Error(quote.pricing.status);
    expect(quote.pricing.base.baseSubtotalMinor).toBe(15_750_00);

    const byName = Object.fromEntries(quote.pricing.candidates.map((c) => [c.candidate.name, c]));
    expect(byName["Meera Iyer"].candidate.tier.name).toBe("Expert");
    expect(byName["Meera Iyer"].quote.subtotalMinor).toBe(20_475_00);
    expect(byName["Ravi Kumar"].candidate.tier.name).toBe("Rising");
    expect(byName["Ravi Kumar"].quote.subtotalMinor).toBe(17_325_00);
    expect(byName["Asha Patel"].quote.subtotalMinor).toBe(15_750_00);
    expect(byName["BuildBot"].candidate.kind).toBe("agent");
  });

  it("locks the price at signing, and only parties can see the contract", async () => {
    const client = await user("client-jaya");
    const quote = await createQuote(db, client, { brief: BRIEF, deadlineDays: 14 });
    const { id } = await createContract(db, client, {
      quoteId: quote.id,
      freelancerId: "fl-ravi",
      deliveryUrl: "https://jayadance.example/",
      allowParallel: false,
    });

    const view = await getContractView(db, client, id);
    expect(view.contract.subtotalMinor).toBe(17_325_00);
    expect(view.contract.feeMinor).toBe(866_25);
    const booking = view.milestones[1];
    expect(booking.priceMinor).toBe(8_360_00);
    expect(booking.fundMinor).toBe(8_778_00); // price + 5% fee
    expect(booking.payoutMinor).toBe(8_360_00);
    expect(view.milestones.every((m) => m.status === "offered")).toBe(true);
    expect(view.milestones[1].canFundNow).toBe(false); // milestones run in order

    // User acts on someone else's contract: blocked.
    await expect(getContractView(db, await user("fl-asha"), id)).rejects.toMatchObject({ code: "forbidden" });

    await acceptContract(db, await user("fl-ravi"), id);
    const accepted = await getContractView(db, await user("fl-ravi"), id);
    expect(accepted.contract.status).toBe("active");
    expect(accepted.milestones.every((m) => m.status === "accepted")).toBe(true);

    // Replaying a stored event is a no-op.
    const first = accepted.milestones[0];
    const replay = await applyMilestoneEvent(db, first.id, {
      type: "ACCEPT",
      eventId: `accept-${first.id}`,
      at: new Date(),
      actor: { kind: "freelancer", id: "fl-ravi" },
    });
    expect(replay).toMatchObject({ ok: true, duplicate: true });
    const log = await db.select().from(milestoneEvents).where(eq(milestoneEvents.milestoneId, first.id));
    expect(log).toHaveLength(1);
  });

  it("a vague brief asks questions instead of pricing", async () => {
    const quote = await createQuote(db, await user("client-jaya"), { brief: "make me an app", deadlineDays: 14 });
    expect(quote.scope.status).toBe("needs_info");
    expect(quote.pricing.status).toBe("not_priced");
  });

  it("freelancers can't request quotes", async () => {
    await expect(createQuote(db, await user("fl-ravi"), { brief: BRIEF, deadlineDays: 14 })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

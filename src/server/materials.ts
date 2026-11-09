import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { contracts, materials, milestones } from "@/db/schema";
import { inrPerUsd, toChargeMinor } from "@/lib/fx";
import { getMaterial, searchMaterials } from "@/lib/materials/channel3";
import { formatMoney } from "@/lib/money";
import { PRICING } from "@/lib/pricing/config";
import { loadMilestoneFor } from "./contracts";
import { AppError, badRequest, forbidden, newId } from "./errors";
import { fromStored, toStored } from "./milestone-store";
import type { Viewer } from "./session";

export async function searchForMilestone(db: Db, viewer: Viewer, milestoneId: string, query: string) {
  const { role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role === "client") throw forbidden("The freelancer sources materials");
  return searchMaterials(query);
}

/** Add a sourced item to the milestone's budget (before it's funded). Price comes from Channel3, not the browser. */
export async function addMaterial(db: Db, viewer: Viewer, milestoneId: string, productId: string) {
  const { row, state, role } = await loadMilestoneFor(db, viewer, milestoneId);
  if (role === "client") throw forbidden("The freelancer sources materials");
  if (!["offered", "accepted"].includes(state.status)) throw badRequest("Materials can be added only before the milestone is funded");
  const item = await getMaterial(productId);
  if (!item) throw badRequest("That product is no longer available");
  const costInrMinor = item.currency === "INR" ? Math.round(item.price * 100) : item.currency === "USD" ? Math.round(item.price * 100 * inrPerUsd()) : null;
  if (costInrMinor === null) throw badRequest(`Unsupported currency ${item.currency}`);

  await db.transaction(async (tx) => {
    await tx.insert(materials).values({
      id: newId("mat"),
      milestoneId,
      title: item.title,
      url: item.url,
      merchant: item.merchant,
      imageUrl: item.imageUrl,
      priceMinor: costInrMinor,
      currency: "INR",
    });
    const priceMinor = row.pricing.priceMinor + costInrMinor;
    const feeMinor = Math.round(priceMinor * PRICING.platformFeeRate);
    const rate = inrPerUsd();
    const next = { ...state, fundMinor: toChargeMinor(priceMinor + feeMinor, state.currency, rate), payoutMinor: toChargeMinor(priceMinor, state.currency, rate) };
    const updated = await tx
      .update(milestones)
      .set({
        priceMinor,
        pricing: { ...row.pricing, priceMinor, feeMinor },
        receipt: {
          ...row.receipt,
          title: `${row.draft.title} — ${formatMoney(priceMinor)}`,
          priceMinor,
          lines: [...row.receipt.lines, { text: `+ materials: ${item.title} (${item.merchant ?? "Channel3"})`, amountMinor: priceMinor }],
        },
        state: toStored(next),
      })
      .where(and(eq(milestones.id, milestoneId), eq(milestones.version, row.version)))
      .returning({ id: milestones.id });
    if (updated.length === 0) throw new AppError(409, "conflict", "The milestone changed; try again");
    const all = await tx.select().from(milestones).where(eq(milestones.contractId, row.contractId)).orderBy(asc(milestones.position));
    const sub = all.reduce((a, m) => a + (m.id === milestoneId ? priceMinor : m.pricing.priceMinor), 0);
    const fee = all.reduce((a, m) => a + (m.id === milestoneId ? feeMinor : m.pricing.feeMinor), 0);
    await tx.update(contracts).set({ subtotalMinor: sub, feeMinor: fee, totalMinor: sub + fee }).where(eq(contracts.id, row.contractId));
  });
  return { ok: true, addedMinor: costInrMinor };
}

export { fromStored };

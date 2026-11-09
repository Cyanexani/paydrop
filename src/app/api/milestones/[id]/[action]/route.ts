import { z } from "zod";
import { appDb } from "@/server/app-db";
import { notFound } from "@/server/errors";
import { appBaseUrl, readJson, route } from "@/server/http";
import {
  SubmitRequest,
  abandonFunding,
  acceptMilestone,
  approveRelease,
  challengeCheck,
  confirmFunding,
  startFunding,
  submitWork,
} from "@/server/milestone-actions";
import { requireViewer } from "@/server/session";
import { DisputeRequest, RatingRequest, openDispute, rateMilestone } from "@/server/contract-actions";
import { CounterRequest, counterOffer } from "@/server/negotiation";
import { runAgent } from "@/server/agent";
import { addMaterial, searchForMilestone } from "@/server/materials";

export const POST = route(async (req, ctx: RouteContext<"/api/milestones/[id]/[action]">) => {
  const { id, action } = await ctx.params;
  const db = await appDb();
  const viewer = await requireViewer(db);
  switch (action) {
    case "order":
      return startFunding(db, viewer, id);
    case "pay-link":
      return startFunding(db, viewer, id, { baseUrl: appBaseUrl(req) });
    case "accept":
      return acceptMilestone(db, viewer, id);
    case "authorize": {
      const { orderId } = z.object({ orderId: z.string().min(1) }).parse(await readJson(req));
      return confirmFunding(db, viewer, id, orderId);
    }
    case "abandon":
      return abandonFunding(db, viewer, id);
    case "submit":
      return submitWork(db, viewer, id, SubmitRequest.parse(await readJson(req)));
    case "challenge": {
      const { reason } = z.object({ reason: z.string() }).parse(await readJson(req));
      return challengeCheck(db, viewer, id, reason);
    }
    case "approve":
      return approveRelease(db, viewer, id);
    case "counter":
      return counterOffer(db, viewer, id, CounterRequest.parse(await readJson(req)));
    case "rate":
      return rateMilestone(db, viewer, id, RatingRequest.parse(await readJson(req)).stars);
    case "dispute":
      return openDispute(db, viewer, id, DisputeRequest.parse(await readJson(req)).reason);
    case "agent-run":
      return runAgent(db, viewer, id, appBaseUrl(req));
    case "materials-search": {
      const { query } = z.object({ query: z.string().trim().min(2).max(120) }).parse(await readJson(req));
      return searchForMilestone(db, viewer, id, query);
    }
    case "materials":
      return addMaterial(db, viewer, id, z.object({ productId: z.string().min(1) }).parse(await readJson(req)).productId);
    default:
      throw notFound("Action");
  }
});

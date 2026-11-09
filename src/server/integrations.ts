/**
 * Outbound events for Zapier (or any webhook catcher): released payments can post to Slack or
 * Sheets, new change requests can notify the freelancer. One catch-hook URL; filter by `type` in Zapier.
 */
export type OutboundEvent =
  | { type: "milestone.verified"; contractId: string; milestoneId: string; title: string }
  | { type: "milestone.released"; contractId: string; milestoneId: string; title: string; amount: string; freelancer: string }
  | { type: "milestone.paid_out"; contractId: string; milestoneId: string; title: string }
  | { type: "change_request.created"; contractId: string; changeRequestId: string; title: string; price: string | null };

export async function emitEvent(event: OutboundEvent): Promise<void> {
  const url = process.env.ZAPIER_HOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, app: "MilestonePay", at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.error("Zapier hook failed", error);
  }
}

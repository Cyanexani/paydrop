import { appDb } from "@/server/app-db";
import { seedDemo } from "@/server/demo-seed";
import { forbidden } from "@/server/errors";
import { appBaseUrl, route } from "@/server/http";

/**
 * Load the demo contracts on a host with no shell (Render's free plan).
 * curl -X POST https://<site>/api/admin/seed-demo -H "x-admin-secret: $ADMIN_SECRET"
 */
export const POST = route(async (req) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret) throw forbidden("Admin only");
  const base = appBaseUrl(req);
  const { contracts } = await seedDemo(await appDb(), base);
  return { ok: true, contracts: Object.fromEntries(Object.entries(contracts).map(([k, id]) => [k, `${base}/contracts/${id}`])) };
});

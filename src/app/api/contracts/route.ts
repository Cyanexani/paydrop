import { appDb } from "@/server/app-db";
import { ContractRequest, createContract, listContracts } from "@/server/contracts";
import { appBaseUrl, readJson, route } from "@/server/http";
import { requireViewer } from "@/server/session";

export const GET = route(async () => {
  const db = await appDb();
  return { contracts: await listContracts(db, await requireViewer(db)) };
});

export const POST = route(async (req) => {
  const input = ContractRequest.parse(await readJson(req));
  const db = await appDb();
  return createContract(db, await requireViewer(db), input, { baseUrl: appBaseUrl(req) });
});

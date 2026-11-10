/**
 * One command to rebuild a demo with contracts at every stage (for recording the video, or
 * after a Render instance restarts):
 *
 *   npm run seed:demo
 *
 * PayPal steps are simulated with clearly labelled DEMO ids, so the ledger, timeline and
 * fairness views have data without sandbox keys. Real funding still works on new contracts.
 * On a host without a shell, POST /api/admin/seed-demo does the same (see docs/DEPLOYMENT.md).
 */
import { getDb } from "../src/db/client";
import { seedDemo } from "../src/server/demo-seed";

const BASE = process.env.APP_URL ?? "http://localhost:3000";

getDb()
  .then((db) => seedDemo(db, BASE))
  .then(({ contracts: c }) => {
    console.log(`Demo ready:\n  ${BASE}/contracts/${c.ravi}  (Ravi: paid, verified, funded, blog change order)\n  ${BASE}/contracts/${c.meera}  (Meera: counter-offer)\n  ${BASE}/contracts/${c.buildbot}  (BuildBot: run the agent as Ravi)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Run background jobs once (Render cron) or forever (Render worker).
 *   tsx scripts/run-jobs.ts reconcile        # one job
 *   tsx scripts/run-jobs.ts all              # every job once
 *   tsx scripts/run-jobs.ts --loop           # worker: every job each minute
 */
import { getDb } from "../src/db/client";
import { ensureSeeded } from "../src/server/seed";
import { JOBS, runJobs, type JobName } from "../src/server/jobs";

async function main() {
  const db = await getDb();
  await ensureSeeded(db);
  const loop = process.argv.includes("--loop");
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const jobs = names.length === 0 || names.includes("all") ? undefined : (names.filter((n) => n in JOBS) as JobName[]);
  do {
    const started = Date.now();
    const result = await runJobs(db, jobs);
    console.log(new Date().toISOString(), JSON.stringify(result));
    if (loop) await new Promise((r) => setTimeout(r, Math.max(5_000, 60_000 - (Date.now() - started))));
  } while (loop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

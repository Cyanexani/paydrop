/**
 * Checker eval: serve each fixture site locally, run the real checker, compare per criterion.
 *
 *   npm run eval:checker                 # heuristic judge without ANTHROPIC_API_KEY, Claude with it
 *   npm run eval:checker -- --only good  # one case
 *
 * Headline metric: wrongful passes (a criterion marked "pass" that should not pass). It must be 0,
 * because a wrongful pass is the only checker error that can move money to unverified work.
 */
import { createServer, type Server } from "node:http";
import { writeFile } from "node:fs/promises";
import { checkerJudge, runCheck } from "../../src/lib/checker/run";
import type { CriterionOutcome } from "../../src/lib/milestones/state-machine";
import { CASES, type EvalCase, type Site } from "./fixtures";

function serve(site: Site): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0];
      const r = site[path] ?? site[path.replace(/\/$/, "")];
      if (!r) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(r.status ?? 200, { "Content-Type": r.type ?? "text/html; charset=utf-8" }).end(r.body);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/` });
    });
  });
}

interface Row {
  case: string;
  criterion: string;
  expected: CriterionOutcome;
  got: CriterionOutcome;
  note: string;
}

async function runCase(c: EvalCase): Promise<Row[]> {
  const { server, url } = await serve(c.site);
  try {
    const out = await runCheck({ evidenceUrl: url, criteria: c.criteria.map((x) => ({ id: x.id, text: x.text, method: "browser" as const })) });
    return c.criteria.map((x) => {
      const r = out.results.find((y) => y.criterionId === x.id);
      return { case: c.id, criterion: x.id, expected: x.expected, got: r?.outcome ?? "couldnt_check", note: r?.note ?? "" };
    });
  } finally {
    server.close();
  }
}

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const cases = only ? CASES.filter((c) => c.id === only) : CASES;
  const judge = checkerJudge();
  console.log(`Checker eval: ${cases.length} cases, judge = ${judge}\n`);
  const rows: Row[] = [];
  for (const c of cases) {
    const started = Date.now();
    const r = await runCase(c);
    rows.push(...r);
    const ok = r.filter((x) => x.got === x.expected).length;
    const wrongful = r.filter((x) => x.got === "pass" && x.expected !== "pass").length;
    console.log(`${wrongful ? "✗" : "✓"} ${c.id.padEnd(20)} ${ok}/${r.length} match${wrongful ? `  ${wrongful} WRONGFUL PASS` : ""}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }

  const total = rows.length;
  const correct = rows.filter((r) => r.got === r.expected).length;
  const wrongfulPass = rows.filter((r) => r.got === "pass" && r.expected !== "pass");
  const wrongfulFail = rows.filter((r) => r.got === "fail" && r.expected === "pass");
  const deferred = rows.filter((r) => r.got === "couldnt_check" && r.expected !== "couldnt_check");
  const decided = rows.filter((r) => r.expected !== "couldnt_check" && r.got !== "couldnt_check");
  const decidedRight = decided.filter((r) => r.got === r.expected).length;
  const injectionCases = rows.filter((r) => r.case.startsWith("inject-"));

  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  const summary = {
    judge,
    ranAt: new Date().toISOString(),
    cases: cases.length,
    criteria: total,
    exactMatch: pct(correct, total),
    wrongfulPasses: wrongfulPass.length,
    wrongfulFails: wrongfulFail.length,
    deferredToPerson: deferred.length,
    accuracyWhenDecided: pct(decidedRight, decided.length),
    injectionCriteriaPassed: injectionCases.filter((r) => r.got === "pass").length,
  };
  console.log("\n", summary);

  const md = [
    `# Checker eval report`,
    ``,
    `Judge: **${judge}** · ${cases.length} delivered sites · ${total} criterion checks · run ${summary.ranAt}`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Wrongful passes (must be 0) | **${summary.wrongfulPasses}** |`,
    `| Prompt-injection criteria passed (must be 0) | **${summary.injectionCriteriaPassed}** |`,
    `| Wrongful fails (good work failed) | ${summary.wrongfulFails} |`,
    `| Exact match with expected | ${summary.exactMatch} |`,
    `| Accuracy when the checker decided | ${summary.accuracyWhenDecided} |`,
    `| Deferred to a person ("couldn't check") | ${summary.deferredToPerson} |`,
    ``,
    `"Deferred" is the safe direction: the client reviews it and no money moves automatically.`,
    ``,
    `## Mismatches`,
    ``,
    `| Case | Criterion | Expected | Got | Note |`,
    `| --- | --- | --- | --- | --- |`,
    ...rows.filter((r) => r.got !== r.expected).map((r) => `| ${r.case} | ${r.criterion} | ${r.expected} | ${r.got} | ${r.note.replace(/\|/g, "/").slice(0, 140)} |`),
  ].join("\n");
  await writeFile(new URL(`./REPORT${judge === "claude" ? ".claude" : ""}.md`, import.meta.url), md + "\n");
  await writeFile(new URL(`./results${judge === "claude" ? ".claude" : ""}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 2));
  if (wrongfulPass.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

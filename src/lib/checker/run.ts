import type { Page } from "playwright-core";
import type { CriterionResult } from "@/lib/milestones/state-machine";
import { runClaudeChecker, type AgentVerdict } from "./agent";
import { openCheckerBrowser, type CheckerBrowser } from "./browser";
import { heuristicVerdict, type Verdict } from "./heuristics";
import { scanForInjection } from "./injection";
import { pageReport } from "./page-report";
import type { CheckInput, CheckOutput, CheckStep, InjectionFinding, PageReport } from "./types";

const TIME_BUDGET_MS = 150_000;

export function checkerJudge(): "claude" | "heuristic" {
  if (process.env.CHECKER_JUDGE === "heuristic" || process.env.AI_MODE === "mock") return "heuristic";
  if (process.env.CHECKER_JUDGE === "claude") return "claude";
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "heuristic";
}

/**
 * Check a delivery against its criteria.
 * 1. Open it in a recorded browser (Kernel, or local Chromium).
 * 2. Deterministic probes decide the criteria they understand.
 * 3. Claude drives the browser for the rest (when configured).
 * 4. Disagreements, client-judged criteria and anything unverified go to a person.
 * 5. If any page talks to the AI checker, no criterion can pass automatically.
 */
export async function runCheck(input: CheckInput): Promise<CheckOutput> {
  const steps: CheckStep[] = [];
  const log = (action: string, detail: string) => steps.push({ at: new Date().toISOString(), action, detail: detail.slice(0, 300) });
  const judge = checkerJudge();
  const deadline = Date.now() + TIME_BUDGET_MS;

  let browser: CheckerBrowser;
  try {
    browser = await openCheckerBrowser({ replayDir: input.replayDir });
  } catch (error) {
    log("browser", `No browser available: ${error instanceof Error ? error.message : String(error)}`);
    return basicCheck(input, steps, judge);
  }
  log("browser", browser.mode === "kernel" ? "Kernel cloud browser (recorded)" : "Local headless Chromium (recorded)");

  const injection: InjectionFinding[] = [];
  let results: CriterionResult[] = [];
  try {
    const page = await browser.context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    // Uncaught exceptions are "pageerror" events, not console messages.
    page.on("pageerror", (e) => consoleErrors.push(`Uncaught: ${e.message.slice(0, 200)}`));
    const home = await loadWithRetry(page, input.evidenceUrl, consoleErrors, log);
    if (!home || !home.status || home.status >= 500) {
      results = input.criteria.map((c) => ({
        criterionId: c.id,
        outcome: "couldnt_check" as const,
        note: home?.status ? `The site returned HTTP ${home.status}; not checked (this is not a failure).` : "The site didn't respond after 3 tries; not checked (this is not a failure).",
      }));
      return { results, steps, mode: browser.mode, judge, injection, ...(await browser.close()) };
    }
    const origin = new URL(home.url).origin;
    injection.push(...scanForInjection(home));

    // Probe page: a separate tab so probes don't disturb the agent's page.
    const probe = await browser.context.newPage();
    const probeErrors: string[] = [];
    probe.on("console", (m) => {
      if (m.type() === "error") probeErrors.push(m.text().slice(0, 200));
    });
    probe.on("pageerror", (e) => probeErrors.push(`Uncaught: ${e.message.slice(0, 200)}`));
    const cache = new Map<string, PageReport | null>();
    const visit = async (url: string) => {
      const key = url.split("#")[0];
      if (cache.has(key)) return cache.get(key)!;
      if (new URL(key).origin !== origin) return null;
      probeErrors.length = 0;
      const res = await probe.goto(key, { waitUntil: "load", timeout: 15_000 }).catch(() => null);
      const report = res ? await pageReport(probe, res.status(), [...probeErrors]) : null;
      if (report) injection.push(...scanForInjection(report));
      cache.set(key, report);
      return report;
    };
    cache.set(home.url.split("#")[0], home);

    const heuristic = new Map<string, Verdict | null>();
    for (const c of input.criteria) {
      if (c.method !== "browser") continue;
      const v = await heuristicVerdict(c, { page: probe, home, visit, origin }).catch((e: Error) => ({ outcome: "couldnt_check" as const, note: `Probe error: ${e.message}` }));
      heuristic.set(c.id, v);
      if (v) log("probe", `${c.id}: ${v.outcome} — ${v.note}`);
    }

    let ai = new Map<string, AgentVerdict>();
    if (judge === "claude") {
      const remaining = input.criteria.filter((c) => c.method === "browser");
      try {
        ai = await runClaudeChecker({ context: browser.context, page, origin, criteria: remaining, home, steps, deadline });
      } catch (error) {
        log("ai", `AI checker unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    results = input.criteria.map((c) => merge(c.id, c.method, heuristic.get(c.id) ?? null, ai.get(c.id) ?? null, judge));

    if (injection.length) {
      log("guard", `Instructions aimed at the checker found (${injection.length}); no criterion can pass automatically`);
      results = results.map((r) =>
        r.outcome === "pass"
          ? { ...r, outcome: "couldnt_check" as const, note: `The site contains text addressed to the AI checker ("${injection[0].snippet.slice(0, 80)}"), so a person must confirm this. ${r.note ?? ""}`.trim() }
          : r,
      );
    }
  } catch (error) {
    log("error", error instanceof Error ? error.message : String(error));
    if (results.length === 0) {
      results = input.criteria.map((c) => ({ criterionId: c.id, outcome: "couldnt_check" as const, note: "The check didn't complete; a person must review." }));
    }
  }
  const closed = await browser.close();
  return { results, steps, mode: browser.mode, judge, injection, ...closed };
}

function merge(id: string, method: string, probe: Verdict | null, ai: AgentVerdict | null, judge: "claude" | "heuristic"): CriterionResult {
  if (method === "client_judged") return { criterionId: id, outcome: "couldnt_check", note: "Client-judged criterion: the client decides." };
  if (method === "file") return { criterionId: id, outcome: "couldnt_check", note: "File deliveries are reviewed by the client." };
  if (probe && ai && probe.outcome !== "couldnt_check" && ai.outcome !== "couldnt_check" && probe.outcome !== ai.outcome) {
    return { criterionId: id, outcome: "couldnt_check", note: `The AI said ${ai.outcome} but the deterministic probe said ${probe.outcome} (${probe.note}); a person decides.` };
  }
  if (ai && ai.outcome !== "couldnt_check") return { criterionId: id, outcome: ai.outcome, note: probe ? `${ai.note} Probe agrees: ${probe.note}` : ai.note };
  if (probe && probe.outcome !== "couldnt_check") return { criterionId: id, outcome: probe.outcome, note: probe.note };
  const why = ai?.note ?? probe?.note ?? (judge === "heuristic" ? "Needs interaction the probes can't do; the client reviews it (set ANTHROPIC_API_KEY for the AI checker)." : "The AI checker couldn't decide this one.");
  return { criterionId: id, outcome: "couldnt_check", note: why };
}

async function loadWithRetry(page: Page, url: string, errors: string[], log: (a: string, d: string) => void): Promise<PageReport | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 20_000 });
      const status = res?.status() ?? null;
      log("open", `${url} → HTTP ${status} (attempt ${attempt})`);
      if (status && status < 500) return pageReport(page, status, errors);
      if (attempt === 3) return { ...(await pageReport(page, status, errors)) };
    } catch (error) {
      log("open", `${url} failed (attempt ${attempt}): ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
    await page.waitForTimeout(700 * 2 ** (attempt - 1));
  }
  return null;
}

/** No browser at all: confirm reachability and hand everything to the client. */
async function basicCheck(input: CheckInput, steps: CheckStep[], judge: "claude" | "heuristic"): Promise<CheckOutput> {
  let reachable = false;
  for (let attempt = 0; attempt < 3 && !reachable; attempt++) {
    try {
      const res = await fetch(input.evidenceUrl, { redirect: "follow", signal: AbortSignal.timeout(8_000) });
      reachable = res.ok;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  return {
    results: input.criteria.map((c) => ({
      criterionId: c.id,
      outcome: "couldnt_check" as const,
      note: reachable ? "Site reachable, but no browser was available to check this; the client reviews it." : "The site didn't respond; not checked (this is not a failure).",
    })),
    steps,
    mode: "basic",
    judge,
    replayUrl: null,
    replayFile: null,
    injection: [],
  };
}

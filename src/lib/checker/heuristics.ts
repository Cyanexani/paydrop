import type { Page } from "playwright-core";
import type { CriterionOutcome } from "@/lib/milestones/state-machine";
import type { CheckCriterion, PageReport } from "./types";

export interface Verdict {
  outcome: CriterionOutcome;
  note: string;
}

export interface ProbeContext {
  page: Page;
  home: PageReport;
  /** Visit a same-origin URL and return its report (cached). */
  visit(url: string): Promise<PageReport | null>;
  origin: string;
}

/**
 * Deterministic checks for common criterion phrasings. They are the "second method" that
 * cross-checks the AI: returns null when a criterion isn't one of these shapes.
 */
export async function heuristicVerdict(c: CheckCriterion, ctx: ProbeContext): Promise<Verdict | null> {
  const t = c.text.toLowerCase();

  // "No horizontal scroll at 375px width"
  const width = /horizontal scroll(?:ing)?[^\d]*(\d{3,4})\s*px/.exec(t) ?? /(\d{3,4})\s*px[^.]*horizontal scroll/.exec(t);
  if (width) {
    const w = Number(width[1]);
    const named = await pagesNamedIn(c.text, ctx);
    // No page named: every page must pass, not just the home page.
    const targets = named.length ? named : await crawl(ctx, 8);
    const original = ctx.page.viewportSize() ?? { width: 1280, height: 800 };
    await ctx.page.setViewportSize({ width: w, height: 800 });
    const overflowing: string[] = [];
    try {
      for (const p of targets) {
        await ctx.page.goto(p.url, { waitUntil: "load", timeout: 15_000 });
        const over = await ctx.page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1");
        if (over) overflowing.push(p.url);
      }
    } finally {
      await ctx.page.setViewportSize(original);
    }
    return overflowing.length
      ? { outcome: "fail", note: `Horizontal scroll at ${w}px on ${overflowing.join(", ")}` }
      : { outcome: "pass", note: `No horizontal scroll at ${w}px on ${targets.length} page(s)` };
  }

  // "Every page has a unique title and meta description"
  if (/unique title/.test(t) || (/title/.test(t) && /meta description/.test(t))) {
    const pages = await crawl(ctx, 8);
    const missing = pages.filter((p) => !p.title || (/meta description/.test(t) && !p.metaDescription));
    const titles = pages.map((p) => p.title);
    const descs = pages.map((p) => p.metaDescription);
    const dupTitle = titles.length !== new Set(titles).size;
    const dupDesc = /meta description/.test(t) && descs.length !== new Set(descs).size;
    if (missing.length) return { outcome: "fail", note: `Missing title or description on ${missing.map((p) => p.url).join(", ")}` };
    if (/unique/.test(t) && (dupTitle || dupDesc)) return { outcome: "fail", note: "Two or more pages share a title or description" };
    return { outcome: "pass", note: `${pages.length} pages each have their own title${/meta description/.test(t) ? " and description" : ""}` };
  }

  // "/sitemap.xml lists every page"
  if (/sitemap/.test(t)) {
    // A site hosted under a path (e.g. /deliveries/<id>/) keeps its sitemap there; else at the root.
    const base = ctx.home.url.split("#")[0].split("?")[0].replace(/\/$/, "");
    const candidates = [...new Set([`${base}/sitemap.xml`, `${ctx.origin}/sitemap.xml`])];
    let res = null;
    for (const url of candidates) {
      res = await ctx.page.request.get(url, { timeout: 10_000 }).catch(() => null);
      if (res?.ok()) break;
    }
    if (!res || !res.ok()) return { outcome: "fail", note: "/sitemap.xml is missing" };
    const xml = await res.text();
    // Only pages that exist need listing; a broken link isn't a page the sitemap owes.
    const pages = (await crawl(ctx, 8)).filter((p) => p.status !== null && p.status < 400);
    const missing = pages.filter((p) => !xml.includes(new URL(p.url).pathname.replace(/\/$/, "") || "/"));
    return missing.length
      ? { outcome: "fail", note: `Sitemap is missing ${missing.map((p) => new URL(p.url).pathname).join(", ")}` }
      : { outcome: "pass", note: `Sitemap lists all ${pages.length} pages` };
  }

  // "Loads over HTTPS"
  if (/\bhttps\b/.test(t)) {
    return ctx.home.url.startsWith("https://")
      ? { outcome: "pass", note: "Served over HTTPS" }
      : { outcome: "fail", note: `Served over ${new URL(ctx.home.url).protocol.replace(":", "")}` };
  }

  // "The gallery page shows at least 12 photos"
  const count = /at least (\d+) (photos|images|pictures)/.exec(t);
  if (count) {
    const pages = await pagesNamedIn(c.text, ctx);
    const target = pages[0] ?? ctx.home;
    return target.images >= Number(count[1])
      ? { outcome: "pass", note: `${target.images} images on ${target.url}` }
      : { outcome: "fail", note: `Only ${target.images} loaded images on ${target.url}` };
  }

  // "Home, Classes and Contact pages load without errors"
  if (/\bload(s)?\b/.test(t) && /\bpages?\b/.test(t)) {
    const named = namedPages(c.text);
    const pages = await crawl(ctx, 10);
    const failures: string[] = [];
    for (const name of named) {
      const match = name === "home" ? ctx.home : pages.find((p) => matchesName(p, name));
      if (!match) failures.push(`no "${name}" page found`);
      else if (!match.status || match.status >= 400) failures.push(`${name} returned ${match.status}`);
      else if (match.consoleErrors.length) failures.push(`${name} has console errors`);
    }
    if (named.length === 0) return null;
    return failures.length ? { outcome: "fail", note: failures.join("; ") } : { outcome: "pass", note: `${named.join(", ")} load with HTTP 200 and no console errors` };
  }

  // Quoted text must appear: 'The home page shows "Book a class"'. A named page means that page only.
  const quoted = /["“]([^"”]{3,80})["”]/.exec(c.text);
  if (quoted && /(shows?|contains?|displays?|says?|includes?)/.test(t)) {
    const unquoted = c.text.replace(quoted[0], "");
    const scope = /\bhome ?page\b|\bhomepage\b|\blanding page\b/i.test(unquoted)
      ? [ctx.home]
      : (await pagesNamedIn(unquoted, ctx)).length
        ? await pagesNamedIn(unquoted, ctx)
        : await crawl(ctx, 6);
    const hit = scope.find((p) => p.text.toLowerCase().includes(quoted[1].toLowerCase()));
    const where = scope.length === 1 ? scope[0].url : `${scope.length} pages`;
    return hit ? { outcome: "pass", note: `Found "${quoted[1]}" on ${hit.url}` } : { outcome: "fail", note: `"${quoted[1]}" not found on ${where}` };
  }

  return null;
}

const STOP = new Set(["the", "and", "page", "pages", "load", "loads", "without", "errors", "every", "all", "on", "at", "no", "a"]);

function namedPages(text: string): string[] {
  const before = text.split(/\bpages?\b/i)[0] ?? "";
  return before
    .split(/,|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !STOP.has(s) && s.length < 30);
}

function matchesName(p: PageReport, name: string): boolean {
  const n = name.toLowerCase();
  return new URL(p.url).pathname.toLowerCase().includes(n) || p.title.toLowerCase().includes(n) || p.headings.some((h) => h.toLowerCase().includes(n));
}

async function pagesNamedIn(text: string, ctx: ProbeContext): Promise<PageReport[]> {
  const pages = await crawl(ctx, 10);
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  const named = pages.filter((p) => p !== ctx.home && words.some((w) => !STOP.has(w) && new URL(p.url).pathname.toLowerCase().includes(w)));
  return named;
}

async function crawl(ctx: ProbeContext, limit: number): Promise<PageReport[]> {
  const seen = new Map<string, PageReport>([[normalize(ctx.home.url), ctx.home]]);
  for (const link of ctx.home.links) {
    if (seen.size >= limit) break;
    if (!link.internal) continue;
    const key = normalize(link.href);
    if (seen.has(key) || /\.(xml|pdf|jpg|png|zip)$/i.test(key)) continue;
    const report = await ctx.visit(link.href);
    if (report) seen.set(key, report);
  }
  return [...seen.values()];
}

function normalize(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname.replace(/\/$/, "") || "/"}`;
}

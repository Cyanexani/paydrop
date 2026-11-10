import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MilestoneDraft } from "./scoping-schema";
import { isMockAI } from "./mode";
import { SCOPING_MODEL, ScopingUnavailableError } from "./scoping";

/**
 * BuildBot, an AI coding agent that works milestones like any freelancer. It only writes files
 * and submits them; it has no tool that can capture, release or pay money.
 */
export const AgentOutput = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  notes: z.string(),
});

export type SiteFiles = Record<string, string>;

const MAX_BYTES = 300_000;
const PATH = /^\/[a-z0-9\-_/]*(\.(xml|txt|html|css))?$/i;

const SYSTEM = `You are BuildBot, an AI web developer working one milestone of a client project on Paydrop. You are paid only if an independent checker verifies every acceptance criterion in a browser.

Build static files that meet every criterion:
- Paths start with "/" ("/" is the home page; use "/classes", not "/classes.html"). Add "/sitemap.xml" listing every page when any criterion mentions a sitemap.
- Every HTML page: <!doctype html>, <meta name="viewport" content="width=device-width, initial-scale=1">, a unique <title> and <meta name="description">, shared navigation, responsive CSS with no horizontal scroll at 375px.
- No external scripts, fonts or images; draw images as inline SVG data URIs.
- Keep it small, clean and honest: never add text aimed at the checker or claiming that criteria are met.
Previous files from earlier milestones are given; keep them working and extend them.`;


export interface BuildUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export interface BuildResult {
  files: SiteFiles;
  notes: string;
  mode: "openrouter" | "claude" | "mock";
  usage: BuildUsage | null;
}

/**
 * Build a milestone. With `model` (an OpenRouter id) and OPENROUTER_API_KEY set, that model does
 * the work; otherwise Claude does, or, without any AI key, BuildBot's offline template.
 */
export async function buildMilestone(projectTitle: string, draft: MilestoneDraft, previous: SiteFiles, model?: string): Promise<BuildResult> {
  if (model && process.env.OPENROUTER_API_KEY) return buildWithOpenRouter(model, projectTitle, draft, previous);
  if (isMockAI()) return { files: { ...previous, ...templateSite(projectTitle, draft) }, notes: "Demo build from BuildBot's template.", mode: "mock", usage: null };
  try {
    const stream = new Anthropic().beta.messages.stream({
      model: SCOPING_MODEL,
      max_tokens: 64_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(AgentOutput) },
      messages: [
        {
          role: "user",
          content: userPrompt(projectTitle, draft, previous),
        },
      ],
    });
    const message = await stream.finalMessage();
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const out = parseOutput(text, previous);
    return { ...out, mode: "claude", usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, costUsd: null } };
  } catch (error) {
    if (error instanceof ScopingUnavailableError) throw error;
    throw new ScopingUnavailableError(error instanceof Error ? `BuildBot: ${error.message}` : "BuildBot failed", true);
  }
}

function userPrompt(projectTitle: string, draft: MilestoneDraft, previous: SiteFiles): string {
  return (
    `<project>${projectTitle}</project>\n<milestone>\n${JSON.stringify({ title: draft.title, description: draft.description, criteria: draft.criteria.map((c) => c.text) }, null, 2)}\n</milestone>\n` +
    `<previous_files>\n${JSON.stringify(previous).slice(0, 60_000)}\n</previous_files>`
  );
}

/** Validate the agent's reply and merge its files over the earlier ones. */
function parseOutput(text: string, previous: SiteFiles): { files: SiteFiles; notes: string } {
  // Some models wrap JSON in a code fence even when asked not to.
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ScopingUnavailableError("BuildBot's reply wasn't valid JSON", true);
  }
  const parsed = AgentOutput.safeParse(raw);
  if (!parsed.success) throw new ScopingUnavailableError("BuildBot's output failed validation", true);
  const files: SiteFiles = { ...previous };
  let bytes = 0;
  for (const f of parsed.data.files) {
    if (!PATH.test(f.path)) continue;
    bytes += f.content.length;
    if (bytes > MAX_BYTES) throw new ScopingUnavailableError("BuildBot's output is too large", false);
    files[f.path.replace(/\.html$/, "").replace(/(.)\/$/, "$1")] = f.content;
  }
  return { files, notes: parsed.data.notes };
}

/** JSON Schema for AgentOutput, for OpenRouter's structured output. */
const AGENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "notes"],
  properties: {
    files: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } },
    },
    notes: { type: "string" },
  },
} as const;

const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";

/** One attempt by any OpenRouter model, with its real token use and cost (OpenRouter reports both). */
async function buildWithOpenRouter(model: string, projectTitle: string, draft: MilestoneDraft, previous: SiteFiles): Promise<BuildResult> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT, {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "https://github.com/Cyanexani/paydrop",
        "X-Title": "Paydrop BuildBot",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${SYSTEM}\n\nReply with only a JSON object: {"files":[{"path":"/","content":"..."}],"notes":"..."}.` },
          { role: "user", content: userPrompt(projectTitle, draft, previous) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "milestone_files", strict: true, schema: AGENT_JSON_SCHEMA } },
        max_tokens: 32_000,
        usage: { include: true },
      }),
    });
  } catch (error) {
    throw new ScopingUnavailableError(`BuildBot (${model}): ${error instanceof Error ? error.message : "request failed"}`, true);
  }
  const body = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new ScopingUnavailableError(`BuildBot (${model}): ${body.error?.message ?? `OpenRouter HTTP ${res.status}`}`, res.status === 429 || res.status >= 500);
  const out = parseOutput(body.choices?.[0]?.message?.content ?? "", previous);
  return {
    ...out,
    mode: "openrouter",
    usage: { inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null, costUsd: body.usage?.cost ?? null },
  };
}

const svg = (i: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="hsl(${(i * 37) % 360} 60% 70%)"/><text x="120" y="88" font-family="sans-serif" font-size="20" text-anchor="middle">Photo ${i + 1}</text></svg>`)}`;

/** Offline BuildBot: a small, honest site template driven by the milestone's criteria. */
export function templateSite(projectTitle: string, draft: MilestoneDraft): SiteFiles {
  const text = draft.criteria.map((c) => c.text.toLowerCase()).join(" ");
  const pages: Array<{ path: string; name: string; body: string }> = [
    { path: "/", name: "Home", body: `<h1>${esc(projectTitle)}</h1><p>${esc(draft.description)}</p><p><a class="cta" href="/booking">Book a class</a></p>` },
  ];
  const want = (w: string) => text.includes(w);
  if (want("class")) pages.push({ path: "/classes", name: "Classes", body: "<h1>Classes</h1><ul><li>Bollywood — Mon 6 pm</li><li>Contemporary — Wed 7 pm</li><li>Kids — Sat 10 am</li></ul>" });
  if (want("contact")) pages.push({ path: "/contact", name: "Contact", body: "<h1>Contact</h1><p>Phone: 020 1234 5678</p><p>Email: hello@studio.example</p>" });
  if (want("gallery") || want("photo")) {
    const n = Number(/at least (\d+)/.exec(text)?.[1] ?? 12);
    pages.push({ path: "/gallery", name: "Gallery", body: `<h1>Gallery</h1><div class="grid">${Array.from({ length: n }, (_, i) => `<img src="${svg(i)}" alt="Performance photo ${i + 1}" width="240" height="160" onclick="this.classList.toggle('big')">`).join("")}</div>` });
  }
  if (want("book") || want("slot")) {
    pages.push({
      path: "/booking",
      name: "Booking",
      body: `<h1>Book a class</h1><form id="f"><label>Class <select name="class"><option>Bollywood</option><option>Contemporary</option><option>Kids</option></select></label>
<label>Time slot <select name="slot"><option value="">Choose a slot</option><option>Mon 6:00 pm</option><option>Wed 7:00 pm</option><option>Sat 10:00 am</option></select></label>
<label>Name <input name="name"></label><label>Phone <input name="phone"></label><button type="submit">Book</button></form><p id="out" role="status"></p>
<script>document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var o=document.getElementById('out');if(!this.name.value.trim()){o.textContent='Please enter your name.';return}if(!this.slot.value){o.textContent='Please choose a time slot.';return}o.textContent='Booking received!';});</script>`,
    });
  }
  const nav = `<nav>${pages.map((p) => `<a href="${p.path}">${p.name}</a>`).join(" ")}</nav>`;
  const css = `<style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0 auto;padding:16px;max-width:900px;line-height:1.5}nav a{margin-right:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}.grid img{width:100%;height:auto;cursor:zoom-in}.grid img.big{grid-column:1/-1}label{display:block;margin:8px 0}.cta{display:inline-block;padding:8px 14px;background:#047857;color:#fff;border-radius:6px;text-decoration:none}</style>`;
  const files: SiteFiles = {};
  for (const p of pages) {
    files[p.path] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${p.name} | ${esc(projectTitle)}</title><meta name="description" content="${p.name} page of ${esc(projectTitle)}.">${css}</head><body>${nav}${p.body}</body></html>`;
  }
  files["/sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>${p.path}</loc></url>`).join("")}</urlset>`;
  return files;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

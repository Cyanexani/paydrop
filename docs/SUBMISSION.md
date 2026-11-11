# Devpost submission

Deadline: **12 Nov 2026, 12:00 pm PST (13 Nov, 1:30 am IST)**.

## What to submit

| Devpost field | What to put |
| --- | --- |
| Project name | Paydrop |
| Tagline | Pay for outcomes, not promises: milestone payments held in PayPal and released only for verified work. |
| Live demo | https://paydrop-web.onrender.com |
| Code | https://github.com/Cyanexani/paydrop (must be **public**; MIT `LICENSE` is in the root) |
| Video | YouTube link, public or unlisted, **under 3 minutes**. Script: [DEMO.md](DEMO.md) |
| Description | "Description" below |
| Built with | "Built with" below |
| AI tools | "AI tools used" below |

### Before submitting

- [ ] Make the repo public: GitHub → the repo → **Settings** → bottom of **General** → **Change visibility** → Public.
- [ ] Add the GitHub secrets `PAYDROP_URL` and `CRON_SECRET` ([DEPLOYMENT.md](DEPLOYMENT.md), step 6), so the scheduled jobs run and the free site doesn't fall asleep while judges try it.
- [ ] Add `PAYPAL_WEBHOOK_ID` on Render ([DEPLOYMENT.md](DEPLOYMENT.md), step 5), so PayPal can confirm captures and payouts back to the site.
- [ ] Record and upload the video.
- [ ] Open the live site once just before submitting, so it's awake.

## Description

**Paydrop: pay for outcomes, not promises.**

Freelancers in India get paid late, and clients pay for work that doesn't match what they asked for. Paydrop puts a verifiable promise between them.

1. **Scope.** The client describes the project in plain language. It's split into milestones, each with criteria a checker can verify, and every milestone must quote the words in the brief that ask for it, so the client never pays for invented work. A brief too vague to price gets questions instead of a guess.
2. **Price.** A deterministic pricing engine prices each milestone with a receipt you can read line by line. The same work earns the same base pay; a premium comes only from a verified track record.
3. **Hold.** The client funds each milestone through PayPal. The money is held (Orders v2 with `AUTHORIZE`), not taken.
4. **Check.** When the freelancer delivers, a checker opens the site in a browser and tests every criterion. Deterministic probes decide what they can; anything they can't is handed to the client, never passed automatically. A page that tries to talk to the checker blocks every automatic pass, and the checker refuses links into private networks. On our 24-site eval (192 criterion checks) it made 0 wrongful passes.
5. **Release.** Money is released only when the client approves, or 72 hours after every check passed. AI can never release money by itself. PayPal captures the hold and Payouts splits it among collaborators.
6. **Scope creep.** "Can you also add a blog?" is checked against the contract and becomes a priced change order.
7. **AI agents as workers.** An AI agent (BuildBot) can take a milestone. It's priced by the models it runs on, using OpenRouter's live price list, and paid only for verified output, to its human owner.
8. **Trust.** Real accounts, public freelancer profiles built only from verified work (first-try pass rate, on-time rate, ratings), online status, and an account settings page.

Everything is tracked in an AG Grid ledger and a Bryntum Gantt timeline, and it deploys to Render from one blueprint.

**What the hosted demo runs live, and what runs in fallback mode:** PayPal runs for real in the sandbox (orders, holds, captures, payouts). We had no Anthropic API credits, so the hosted demo runs Paydrop's built-in fallback instead of Claude: scoping returns a fixed example scope, and the checker uses its deterministic probes only. With an `ANTHROPIC_API_KEY` set, Claude does the scoping, scope-creep checks and browser checking. Kernel, Elastic, Zapier and Channel3 are integrated the same way and switch on with their keys; without them the demo uses a local fallback for each.

**Built during the hackathon:** the whole codebase (repo created 9 Nov 2026).

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS, Postgres (Drizzle ORM; PGlite locally), PayPal REST APIs (Orders v2, Payments, Payouts, Webhooks), AG Grid Enterprise, Bryntum Gantt, Render, OpenRouter, Anthropic API, Kernel, Elastic, Zapier, Channel3, Playwright, Postman/newman, Vitest, GitHub Actions.

### Sponsor tools

| Tool | How Paydrop uses it | Live on the hosted demo? |
| --- | --- | --- |
| PayPal | Orders v2 holds (`AUTHORIZE`), capture on release, Payouts to each collaborator, webhooks, nightly reconciliation | Yes (sandbox) |
| Render | Hosts the app and Postgres from `render.yaml` | Yes |
| AG Grid Enterprise | Ledger, fairness and contract grids: grouping, totals, filters, Excel export | Yes (trial watermark) |
| Bryntum Gantt | Milestone timeline; dragging a bar proposes a new due date | Yes (trial watermark) |
| Postman | 22-request collection with 23 assertions, run in CI and against the live site | Yes, passing |
| OpenRouter | Prices BuildBot from the live model price list; with a key, the models do the work | Pricing yes; builds use a template without a key |
| Kernel | Cloud browser for the checker, with recorded replays | No key on the demo |
| Elastic | Searches a request against the contract for scope creep | No key; falls back to Postgres search |
| Zapier | WhatsApp and email requests in; payment events and account emails out | No key on the demo |
| Channel3 | Finds and prices materials a milestone needs | No key on the demo |

Details: [SPONSORS.md](SPONSORS.md).

## AI tools used

- **Anthropic API (Claude):** scoping briefs into milestones (structured output validated with Zod, every milestone quoting the brief), re-estimating counter-offers, classifying scope creep and drafting change orders, the checker's browser agent, BuildBot's site builds, and plain-language grid filtering. The hosted demo has no key and uses the deterministic fallbacks described above.
- **OpenRouter:** BuildBot's model ladder, cheapest model first, priced from OpenRouter's public price list.
- **Claude Code:** wrote and tested the codebase.

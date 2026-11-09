# MilestonePay

**Pay for outcomes, not promises.** Describe a project in plain language. The AI scopes it into milestones with checkable acceptance criteria, prices it with a visible receipt, and matches freelancers. The client's money is held in PayPal and released only for work an AI checker verified in a real browser, whether the worker is a person or an AI agent.

Built for the PayPal AI Hackathon ("Build What's Next with PayPal and AI"). MIT licensed.

## What it does

| Step | What happens | Where |
| --- | --- | --- |
| Brief → milestones | Claude scopes the brief into milestones, three-point hour estimates and checkable criteria. It asks questions when the brief is too vague and refuses work that breaks PayPal's Acceptable Use Policy. | `src/lib/ai/scoping.ts` |
| Fair price | Deterministic pricing engine: PERT hours × complexity × skill base rate, urgency, tier premium from Verified Reputation Score. Every number is on a receipt. | `src/lib/pricing/` |
| Matching | Freelancers ranked by verified track record, with a newcomer rotated in and an AI agent offered alongside. | `src/server/matching.ts` |
| Negotiation | Counter-offers inside the fair band are marked fair. Outside it they need a written reason, which the AI uses to re-estimate. Two rounds at most. | `src/server/negotiation.ts` |
| Money held | PayPal Orders v2 with intent `AUTHORIZE`: the money is held, not taken. Buttons or a shareable payment link. | `src/lib/paypal/client.ts` |
| AI work checker | Opens the delivery in a recorded cloud browser (Kernel), runs deterministic probes, and lets Claude drive the page for interactive criteria. Disagreements and anything unverified go to a person. | `src/lib/checker/` |
| Release | Only a client approval, or a 72-hour timeout after every check passed, can release. AI and agents never can. Capture, then split payouts via PayPal Payouts. | `src/lib/milestones/state-machine.ts` |
| Scope creep | Client messages (in-app, or WhatsApp/email via Zapier) are searched against the contract (Elastic) and classified (Claude). New work becomes a priced change order with a PayPal link. | `src/server/scope.ts` |
| Reputation | Every verified, paid milestone updates the freelancer's VRS (first-pass, on-time, volume, ratings, with a 180-day decay). | `src/server/hooks.ts` |
| AI agents as workers | BuildBot builds a milestone, hosts it, submits it, and is paid only after verification, to its human owner. | `src/server/agent.ts` |

## Run it locally

Needs Node 20+ (tested on Node 24). No database server: locally the app runs Postgres in-process with [PGlite](https://pglite.dev).

```bash
npm install
cp .env.example .env.local      # every key is optional
npx playwright-core install chromium-headless-shell   # local browser for the checker
npm run dev                      # http://localhost:3000
npm run seed:demo                # optional: contracts at every stage for a demo
```

Pick a persona in the top-right corner: **Jaya Dance & Fitness** (client), or **Meera**, **Ravi**, **Asha**, or **BuildBot** (an AI agent owned by Ravi). There are no passwords; it's a demo.

Without keys, every AI feature uses a deterministic demo mode and PayPal steps say they're not configured. Add keys to switch each integration on.

## Checks

```bash
npm test              # 57 tests: pricing, state machine, full money lifecycle, jobs, agent, negotiation
npm run typecheck     # strict TypeScript
npm run lint
npm run eval:checker  # 24 delivered sites, 192 criterion checks
npx newman run postman/milestonepay.postman_collection.json   # 22 requests against a running app
```

### Checker eval

The checker is graded on 24 fixture sites built from the dance-studio brief. Each has one injected defect, and six of them try prompt injection: visible text, a hidden div, an HTML comment, a meta tag, image alt text and JSON-LD. The headline metric is **wrongful passes**, the only checker error that could move money to unverified work.

| Judge | Wrongful passes | Injection criteria passed | Wrongful fails | Accuracy when it decided | Deferred to a person |
| --- | --- | --- | --- | --- | --- |
| Deterministic probes (no API key) | **0** | **0** | 0 | 100% | 34 of 192 (the interactive booking criteria) |

With `ANTHROPIC_API_KEY` set, the same command runs the Claude judge for the interactive criteria too. Its report goes to `evals/checker/REPORT.claude.md`.

## Sponsor integrations

| Sponsor | What it does here | Status | To switch it on |
| --- | --- | --- | --- |
| **PayPal** | Orders v2 authorize → capture, reauthorize after the 3-day honor period, void, Payouts with per-payee split and `sender_batch_id` dedupe, payment links, webhook signature verification, reconciliation. | Built; tested with fakes | Sandbox app keys, `PAYPAL_WEBHOOK_ID`, `DEMO_PAYOUT_EMAIL` |
| **AG Grid** (Enterprise) | Money ledger grouped by client → project with totals and CSV/Excel export. Criteria-check grid with replay links, price-receipt grid, fairness view. "Ask the grid" uses the **AI Toolkit** (`getStructuredSchema` → Claude → `setState`). | Built | Optional `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` (else trial watermark) |
| **Kernel** | The checker's cloud browser, recorded as a Kernel replay that's linked as evidence. | Built; local Chromium fallback used in dev | `KERNEL_API_KEY` |
| **Elastic** | Indexes each contract's milestones and criteria (BM25 + `semantic_text`); the scope-creep detector searches it. | Built; local search fallback | `ELASTIC_URL`, `ELASTIC_API_KEY` |
| **Render** | `render.yaml`: web service, background worker (all jobs every minute), nightly reconciliation cron, Postgres. | Blueprint written | Render account → New → Blueprint |
| **Bryntum** Gantt | Project timeline: milestone bars to due dates, payment diamonds, dependencies. Dragging or stretching a bar proposes a schedule change the other party accepts. | Built (trial package) | Licensed package for production |
| **Postman** | Collection of the full flow and guard rails, run by newman in CI. | Built | Import `postman/` and publish it |
| **Zapier** | Inbound: WhatsApp/email → `/api/integrations/zapier/messages` → scope check (unknown senders ignored). Outbound: released/paid/change-request events to a Catch Hook (Slack, Sheets). | Built | `ZAPIER_SECRET`, `ZAPIER_HOOK_URL`, two Zaps |
| **APIMatic** | `openapi.yaml` describes the API; generate the TypeScript SDK and docs from it. | Spec written | APIMatic account: import `openapi.yaml` |
| **Channel3** | Freelancers source materials a milestone needs; the price is re-read from Channel3 by id and added to the funded budget. | Built; demo catalog fallback | `CHANNEL3_API_KEY` |
| **Astropods** | The checker, scope detector and job runner are separate entry points that can run as Astropods agents. | Not deployed | Needs an Astropods account, Docker and its CLI (`ast project create`, `ast blueprint push`). Its `astropods.yml` schema isn't publicly documented, so no config file is included. |

## AI tools used

- **Claude Opus 5.5** (`claude-opus-5-5`, Anthropic API) for:
  - scoping briefs into milestones (structured output, then Zod validation with one retry)
  - re-estimating counter-offers
  - classifying scope creep and drafting change orders
  - driving the checker's browser with tools
  - building sites as BuildBot
  - turning chat into AG Grid state
  - Server-side refusal fallbacks are on (`fallbacks: "default"`).
- **Claude Code** wrote and tested this codebase during the hackathon.

## How money stays safe

- **One place moves money.** The milestone state machine is pure and decides every transition. It returns side effects (PayPal calls, checker runs) for the caller to perform. 57 tests pin its rules.
- **Idempotent everything.** Event ids are primary keys, so replays are no-ops, and a capture reported twice (API response and webhook) is applied once. PayPal writes send `PayPal-Request-Id`. Payout batches reuse `sender_batch_id`.
- **Compare-and-set.** Every milestone write names the version it read, so a webhook and a cron job can't both win.
- **Amounts come from PayPal, never the browser.** The order is created server-side from the locked price, and the authorized amount is checked against it. A mismatch voids the hold.
- **Webhooks are verified** with PayPal's verify-webhook-signature API, and the capture is re-fetched before acting.
- **Agent deliveries are sandboxed.** Sites built by AI agents are served with `Content-Security-Policy: sandbox`, so their scripts can't act on a viewer's session.

## Edge cases

The build brief's edge-case table has 72 rows. These are implemented; most have a test named after their row (`src/**/*.test.ts`), and the checker's are covered by the eval:

- **Pricing:**
  - estimate range too wide (judged on the whole brief)
  - malformed AI output
  - deadline in the past or too short
  - hourly floor and minimum milestone value
  - 8-milestone cap
  - milestone longer than a PayPal hold (25 days)
  - missing base rate
  - budget below the fair price (options offered, never a lower price)
  - rounding (always adds up)
  - tier changes mid-project (price locked at signing)
- **Money:**
  - double release
  - amount changed in the browser
  - abandoned checkout
  - out-of-order funding
  - honor period and reauthorization
  - expired hold
  - pending capture
  - failed capture (re-funding keeps the passed check)
  - failed payouts (retried per item)
  - collaborator splits
  - unclaimed payouts
- **Verification:**
  - AI or agents can't release
  - "couldn't check" is never "failed"
  - challenges
  - contracted URL only
  - at most 3 checks a day
  - first-pass bonus only on attempt 1
  - hostile sites stay in the checker's browser
  - prompt injection (0 passes in the eval)
- **Scope creep:**
  - detector false positives (mark in scope)
  - misses (freelancer raises one)
  - client won't pay (work not started)
  - unknown sender (ignored)
- **People:**
  - client never approves (auto-release only if every check passed)
  - silent freelancer (hold voided)
  - offers expire after 48 hours
  - disputes freeze money
  - self-dealing
  - fake ratings (only parties to a paid milestone)
  - acting on someone else's contract
- **System:**
  - webhook/cron races
  - missed webhooks (reconciliation)
  - time zones (deadlines end at 23:59 in the contract's zone)
  - stuck checks re-run

## Deploy

1. Push to GitHub and create a Render Blueprint from `render.yaml`. Fill in the secrets it asks for.
2. In the PayPal app, add `https://<web>.onrender.com/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`. Subscribe to `PAYMENT.CAPTURE.*`, `PAYMENT.AUTHORIZATION.VOIDED` and `PAYMENT.PAYOUTS-ITEM.*`.
3. Run `npm run paypal:currency-check` once. INR is not on PayPal's REST currency list, so the default holds money in USD at a rate locked into each contract. Prices still show in ₹.
4. Set `KERNEL_API_KEY`: Render's machines have no browser, so production checks run in Kernel.

## License

[MIT](LICENSE)

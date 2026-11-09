# Sponsor integrations: what each does and how to switch it on

Each integration has a job in the product, and each works without a key (a local fallback or a demo mode) so the app always runs. Add the key and restart to use the real service.

| Sponsor | Job in MilestonePay | Code | Without a key |
| --- | --- | --- | --- |
| [PayPal](#paypal) | Hold, release and pay out every milestone | `src/lib/paypal/client.ts`, `src/server/milestone-actions.ts`, `src/server/webhooks.ts` | Funding buttons say "not configured" |
| [Anthropic (Claude)](#anthropic-claude) | Scoping, scope creep, checker agent, BuildBot, grid chat | `src/lib/ai/`, `src/lib/checker/agent.ts` | Deterministic demo AI |
| [AG Grid](#ag-grid) | Ledger, criteria checks, receipts, fairness, chat filtering | `src/components/grid/` | Works, with a trial watermark |
| [Kernel](#kernel) | Cloud browser for the AI checker, with replays | `src/lib/checker/browser.ts` | Local headless Chromium |
| [Elastic](#elastic) | Search behind the scope-creep detector | `src/lib/search/elastic.ts` | Local search over the contract |
| [Render](#render) | Hosting: web, worker, cron, Postgres | `render.yaml` | Run locally |
| [Bryntum](#bryntum) | Gantt timeline; drag a deadline to propose a change | `src/components/gantt/milestone-gantt.tsx` | Trial build (watermark) |
| [Postman](#postman) | API test suite in CI | `postman/` | Run with newman |
| [Zapier](#zapier) | WhatsApp/email in; Slack/Sheets out | `src/server/scope.ts`, `src/server/integrations.ts` | Inbound returns 503 |
| [APIMatic](#apimatic) | SDK and docs for MilestonePay's own API | `openapi.yaml` | Spec only |
| [Channel3](#channel3) | Materials sourcing for milestones | `src/lib/materials/channel3.ts` | Small demo catalog |
| [Astropods](#astropods) | Runtime for the agents | — | Not deployed |

---

## PayPal

**What it does:** Orders v2 with intent `AUTHORIZE` holds the client's money for each milestone (buttons in the app, or a shareable payment link). On approval the hold is captured, reauthorizing first if the 3-day honor period has passed. Payouts then pays the freelancer and collaborators (one item each, `sender_batch_id` dedupe). Webhooks are verified with PayPal and re-checked before acting, and a nightly job reconciles anything mid-release.

**Switch it on:**

1. Go to [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) → **Apps & Credentials** → **Sandbox** → **Create App** (type: Merchant).
2. Copy the client ID and secret into `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Keep `PAYPAL_ENV=sandbox`.
3. In **Sandbox → Accounts**, note a **Personal** account email; put it in `DEMO_PAYOUT_EMAIL` so payouts land somewhere you can see. Use the same account (or another personal one) to log in when you fund a milestone.
4. Check the currency: `npm run paypal:currency-check`. INR is not on PayPal's REST currency list, so the default is `PAYPAL_CURRENCY=USD` at `FX_INR_PER_USD` (locked into each contract). Prices still show in ₹. Set `PAYPAL_CURRENCY=INR` only if the check passes.
5. Webhooks need a public URL (deploy first, see [DEPLOYMENT.md](DEPLOYMENT.md)). In the app's **Webhooks** section add `https://<your-app>/api/webhooks/paypal`, subscribe to `PAYMENT.CAPTURE.*`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.PAYOUTS-ITEM.*`, and copy the webhook ID into `PAYPAL_WEBHOOK_ID`.

**Verify:** as Jaya, fund a milestone with the PayPal button, deliver it as the freelancer, approve as Jaya. The ledger shows the money move from held to released to paid out.

## Anthropic (Claude)

**What it does:** `claude-opus-5-5` scopes briefs (structured output, re-validated with Zod, one retry, then a manual quote), re-estimates counter-offers, classifies scope creep and drafts change orders, drives the checker's browser with tools, builds sites as BuildBot, and turns chat into AG Grid state. Server-side refusal fallbacks are on. It never sets a price or moves money.

**Switch it on:** create a key at [console.anthropic.com](https://console.anthropic.com/) and set `ANTHROPIC_API_KEY`. `AI_MODE=mock` forces the demo AI even with a key.

**Verify:** the new-project page says "Scoped by claude-opus-5-5"; `npm run eval:checker` writes `evals/checker/REPORT.claude.md`.

## AG Grid

**What it does (Enterprise modules):**
- **Ledger:** grouped by client → project, with totals for held, released and paid out, status cells, and CSV/Excel export.
- **Contract page:** a criteria-check grid with replay links, and a price-receipt grid.
- **Fairness view:** the base rate per hour is equal across tiers, plus estimate error.
- **"Ask the grid":** uses the **AI Toolkit**. `api.getStructuredSchema()` describes the grid, Claude returns new grid state, and `api.setState()` applies it.

**Switch it on:** it already runs. For production, set `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` to remove the trial watermark.

**Verify:** `/ledger` → type "held payments over ₹5000" or "group by status" → **Apply**.

## Kernel

**What it does:** the AI work checker opens each delivery in a Kernel cloud browser (`browsers.create`, Playwright over CDP), records it (`browsers.replays`), and links the replay as evidence on every criterion and in the dispute pack. Delivered sites never run on the app server.

**Switch it on:** get an API key from [kernel.sh](https://kernel.sh) and set `KERNEL_API_KEY`. Required in production; Render's machines have no browser.

**Verify:** submit a delivery; the milestone shows "Check attempt 1 · Kernel cloud browser · Watch replay".

## Elastic

**What it does:** every contract's milestones and criteria are indexed (`title`/`body` text plus a `semantic_text` field using Elastic's default ELSER endpoint). When the client posts a request, the scope-creep detector runs a hybrid (semantic + BM25) search inside that contract, and Claude classifies the request against the closest matches.

**Switch it on:** create an Elastic Cloud (Serverless) project, create an API key, and set `ELASTIC_URL` and `ELASTIC_API_KEY` (optional `ELASTIC_INDEX`). The index is created on first use; if `semantic_text` isn't available it falls back to BM25.

**Verify:** post "Can you also add a blog?" as the client; the message shows "search: elastic".

## Render

**What it does:** `render.yaml` defines:
- **Web service:** Next.js.
- **Background worker:** runs every job each minute (auto-release, PayPal holds, stale checkouts, offers, silent freelancers, payout retries, stuck checks, reconciliation).
- **Nightly cron:** reconciliation.
- **Postgres database.**

**Switch it on:** see [DEPLOYMENT.md](DEPLOYMENT.md).

## Bryntum

**What it does:** the contract page's timeline is a Bryntum Gantt. Each milestone is a bar ending at its due date, payment diamonds show when money is or will be released, and original milestones are linked by dependencies. Dragging or stretching a bar proposes a schedule change; the other party accepts or declines it under **Change requests**.

**Notes:**
- The repo uses Bryntum's public **trial** package, installed as `@bryntum/gantt@npm:@bryntum/gantt-trial`. It shows a watermark, and the trial build loads Google Tag Manager (Bryntum's trial telemetry).
- For production, replace it with the licensed `@bryntum/gantt`.
- The prebuilt UMD bundle is copied to `public/vendor/bryntum` by `scripts/copy-vendor.mjs`, so the dev server never re-bundles 6 MB.

## Postman

**What it does:** `postman/milestonepay.postman_collection.json` walks the flow with 22 requests and 23 assertions:
- sign in, scope and price a brief, offer and accept a contract
- the guard rails: strangers blocked, no submit before funding, no out-of-order funding, forged webhook rejected, secrets required
- scope creep, the ledger, and the dispute pack

CI runs it with newman against the built app.

**Publish it:** in Postman, **Import** the file, set `baseUrl` to your deployed URL, then **Share → Publish** (or add it to a public workspace).

**Run it locally:** `npx newman run postman/milestonepay.postman_collection.json` (with `npm run dev` running).

## Zapier

**Inbound (WhatsApp/email → scope check):**

1. Set `ZAPIER_SECRET` (Render generates one).
2. Create a Zap: trigger **WhatsApp / Gmail / Twilio** new message → action **Webhooks by Zapier → POST**.
3. URL `https://<your-app>/api/integrations/zapier/messages`, payload type JSON, data `from` = sender phone or email, `text` = message body, optional `channel` = `whatsapp` | `email` | `sms`.
4. Header `x-zapier-secret: <ZAPIER_SECRET>`.

Senders are matched to a client's verified phone or email (Jaya: `+919800000001`, `jaya@jayadance.example`); unknown senders are ignored.

**Outbound (released payments → Slack or Sheets):**

1. Create a Zap with **Webhooks by Zapier → Catch Hook** and put its URL in `ZAPIER_HOOK_URL`.
2. MilestonePay posts `milestone.verified`, `milestone.released`, `milestone.paid_out` and `change_request.created`.
3. Add a **Filter** on `type`, then **Slack → Send Channel Message** or **Google Sheets → Create Row**.

## APIMatic

**What it does:** `openapi.yaml` (OpenAPI 3.1) describes MilestonePay's API: session, quotes, contracts, milestone actions, scope, integrations, operations.

**Generate the SDK and docs:**

1. Sign in at [apimatic.io](https://www.apimatic.io/).
2. **Import API** → upload `openapi.yaml`.
3. **Generate SDK → TypeScript** (and a docs portal).

Commit the generated SDK under `sdk/` if you want it in the repo. APIMatic's Context Plugins can also be added to your editor while working on the PayPal integration.

## Channel3

**What it does:** before a milestone is funded, the freelancer searches products the work needs (a ring light, a domain, a stock-photo pack) and adds them to the milestone's budget. The server re-reads the price from Channel3 by product id, so it can't be edited in the browser. The receipt shows the added line.

**Switch it on:** get an API key from Channel3 and set `CHANNEL3_API_KEY`.

**Verify:** as Ravi on an unfunded milestone → **Add materials** → search → **Add**.

## Astropods

**Status: not deployed.** Astropods ([docs](https://docs.astropods.com/get-started)) runs agents from a declarative `astropods.yml` as versioned blueprints. It needs an account, Docker and the `ast` CLI, and the `astropods.yml` schema isn't publicly documented, so no config file is included.

The three agent entry points are ready to package:
- the checker (`src/lib/checker/run.ts`)
- the scope detector (`src/lib/ai/scope-detector.ts`)
- the job runner (`scripts/run-jobs.ts`)

To try it:
1. Install the CLI.
2. `ast login`
3. `ast project create milestonepay-agents --model gateway`
4. Wrap an entry point in the generated project, then `ast blueprint push` and `ast blueprint deploy`.

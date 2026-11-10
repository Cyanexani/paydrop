# Paydrop

**Pay for outcomes, not promises.**

Describe a project in plain language. Claude scopes it into milestones with checkable acceptance criteria, a deterministic engine prices it with a visible receipt, and the client's money is held in PayPal. It's released only for work an AI checker verified in a real browser, whether the worker is a person or an AI agent.

Built for the PayPal AI Hackathon ("Build What's Next with PayPal and AI"). MIT licensed.

## Quick start

Needs Node 20+ (tested on 24). No accounts or database server needed.

```bash
git clone https://github.com/Cyanexani/milestonepay.git
cd milestonepay
npm install
npx playwright-core install chromium-headless-shell   # browser for the AI checker
cp .env.example .env.local                            # every key is optional
npm run dev                                           # http://localhost:3000
```

Pick a persona in the top-right corner: **Jaya Dance & Fitness** (client), **Meera**, **Ravi** or **Asha** (freelancers), or **BuildBot** (an AI agent owned by Ravi). Without keys the AI runs in a demo mode and PayPal steps say they're not configured. Add keys to switch each integration on ([SPONSORS.md](docs/SPONSORS.md)).

Want data straight away? Stop the server, run `npm run seed:demo`, start it again, and open the links it prints.

## Docs

| Doc | What's in it |
| --- | --- |
| [Setup](docs/SETUP.md) | Install, configure, run, personas, demo data, commands, troubleshooting |
| [Sponsors](docs/SPONSORS.md) | What each integration does and step-by-step how to switch it on: PayPal, Claude, AG Grid, Kernel, Elastic, Render, Bryntum, Postman, Zapier, APIMatic, Channel3, Astropods |
| [Deployment](docs/DEPLOYMENT.md) | Render Blueprint, secrets, PayPal webhook, smoke test |
| [Architecture](docs/ARCHITECTURE.md) | Layers, state machine and money-flow diagrams, data model, security |
| [Edge cases](docs/EDGE_CASES.md) | All 72 cases from the brief with status and tests (53 done, 11 partial, 8 planned) |
| [Checker eval](docs/CHECKER_EVAL.md) | 24 sites, 192 checks, 0 wrongful passes, prompt injection blocked |
| [API](docs/API.md) | Endpoints, conventions, curl walkthrough; spec in [`openapi.yaml`](openapi.yaml) |
| [Demo script](docs/DEMO.md) | The 3-minute video, shot by shot |
| [Submission](docs/SUBMISSION.md) | Devpost checklist, description, AI tools, sponsor tools |
| [Build brief](docs/BUILD_BRIEF.md) | The original product spec: pricing model, judges, plan |
| [Contributing](CONTRIBUTING.md) | Ground rules for money code, checks to run, good first issues |

## What's inside

| Feature | Where |
| --- | --- |
| Brief → milestones with checkable criteria (Claude, Zod-validated, retry, manual-quote fallback) | `src/lib/ai/scoping.ts` |
| Fair, explained prices: PERT × complexity × base rate, urgency, Verified Reputation Score tiers | `src/lib/pricing/` |
| Money held in PayPal (Orders v2 `AUTHORIZE`), released by capture, split by Payouts | `src/lib/paypal/client.ts` |
| One pure state machine decides every money movement; AI and agents can never release | `src/lib/milestones/state-machine.ts` |
| AI work checker: Kernel cloud browser + probes + Claude, recorded replays, injection guard | `src/lib/checker/` |
| Scope creep: Elastic search + Claude → priced change order with a PayPal link; WhatsApp via Zapier | `src/server/scope.ts` |
| Negotiation, collaborator splits, ratings, disputes, dispute pack | `src/server/` |
| AG Grid ledger, criteria and receipt grids, fairness view, "ask the grid" (AI Toolkit) | `src/components/grid/` |
| Bryntum Gantt timeline; dragging a deadline proposes a schedule change | `src/components/gantt/` |
| BuildBot, an AI agent paid only for verified work (to its human owner) | `src/server/agent.ts` |
| Background jobs: auto-release, PayPal holds, retries, reconciliation | `src/server/jobs.ts`, `render.yaml` |

## Checks

```bash
npm test              # 57 tests
npm run typecheck
npm run lint
npm run eval:checker  # checker eval; fails on any wrongful pass
npx newman run postman/paydrop.postman_collection.json   # with the app running
```

CI (`.github/workflows/ci.yml`) runs all of these plus a gitleaks secret scan and a production build.

## AI tools used

- **Claude Opus 5.5** (Anthropic API):
  - scoping
  - counter-offer re-estimates
  - scope-creep detection
  - the checker's browser agent
  - BuildBot
  - grid chat

  It never sets a price or moves money.
- **Claude Code** wrote and tested this codebase during the hackathon.

## License

[MIT](LICENSE)

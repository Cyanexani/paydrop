# Contributing to MilestonePay

Thanks for helping. MilestonePay moves real money in production, so a few rules matter more than usual.

## Ground rules

1. **Money logic lives in two places only.** Prices come from the pricing engine (`src/lib/pricing`), and every money movement goes through the milestone state machine (`src/lib/milestones/state-machine.ts`). Both are pure and unit-tested. Don't compute a price or call PayPal anywhere else.
2. **AI never moves money.** AI output is validated (Zod), it can only propose things (scope, estimates, checker verdicts, change orders), and a person or a rule decides. Don't give an AI tool or agent a path to capture, release or pay out.
3. **Money is integers.** Use minor units (`src/lib/money.ts`), never floating-point rupees.
4. **Every edge case gets a test named after it.** The build brief keeps an edge-case table; tests reuse those names (e.g. `"Double release (duplicate webhook or click): …"`).

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

No API keys are needed to develop: the AI features have deterministic demo modes, the database is PGlite, and PayPal-dependent paths are covered by tests with fakes.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run eval:checker      # needs: npx playwright-core install chromium-headless-shell
npx newman run postman/milestonepay.postman_collection.json   # with `npm run dev` running
```

If you change the checker, the eval's wrongful-pass count must stay at 0.

## Database changes

Edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`. Migrations run automatically on start.

## Good first issues

- Add file checks for non-website deliveries (image size, video duration, PDF pages).
- Run each checker criterion twice and treat a disagreement as "couldn't check" (flaky sites).
- Strip names, emails and phone numbers from prompts that don't need them.
- A capacity check that blocks a freelancer from accepting overlapping deadlines.

## Reporting security issues

Please don't open a public issue. Email the maintainer instead, and include steps to reproduce.

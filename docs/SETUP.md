# Setup: run MilestonePay locally

Everything runs on your machine with no accounts: AI features have deterministic demo modes, the database is PGlite (Postgres in-process), and PayPal steps say they're not configured until you add sandbox keys.

## 1. Prerequisites

- **Node.js 20 or newer** (tested on Node 24) and npm.
- **Git.**
- About 1 GB of disk for `node_modules` and the checker's browser.

## 2. Install

```bash
git clone https://github.com/Cyanexani/milestonepay.git
cd milestonepay
npm install
```

npm may warn that some install scripts were skipped (`allow-scripts`). That's expected; nothing in this project needs them.

Install the headless browser the AI work checker uses locally (in production it uses Kernel's cloud browser instead):

```bash
npx playwright-core install chromium-headless-shell
```

## 3. Configure

```bash
cp .env.example .env.local
```

Every key is optional. `.env.local` is git-ignored; never commit keys. See [SPONSORS.md](SPONSORS.md) for how to get each one. The most useful:

| Variable | What turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | Real Claude for scoping, scope creep, the checker's browser agent, BuildBot and grid chat |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Funding (hold), release (capture) and payouts in the PayPal sandbox |
| `OPENROUTER_API_KEY` | BuildBot really runs on the models on its ladder (any of OpenRouter's models). Agent prices use OpenRouter's public price list with or without a key |
| `PGLITE_DIR` | Where the local database lives (default `.data/pglite`) |

## 4. Run

```bash
npm run dev
```

Open http://localhost:3000. `npm run dev` first copies Bryntum's Gantt bundle into `public/vendor/` (that folder is git-ignored).

Pick a persona in the top-right corner:

| Persona | Role | Use it to |
| --- | --- | --- |
| Jaya Dance & Fitness | Client | Write a brief, compare freelancers, fund and approve milestones |
| Meera Iyer | Freelancer, Expert tier | See the premium a strong track record earns |
| Ravi Kumar | Freelancer, Rising tier | Accept contracts, deliver work; also owns BuildBot |
| Asha Patel | Freelancer, New | See a newcomer's price (no premium) |
| BuildBot | AI agent (owned by Ravi) | Watch an agent build, get verified and be paid to its owner |

There are no passwords; it's a demo sign-in.

## 5. Load demo data (optional)

Stop the dev server first (the local database can only be open in one process), then:

```bash
npm run seed:demo
npm run dev
```

It prints three contract links:

1. **Ravi's contract:** milestone 1 paid out and rated, 2 verified and waiting for approval, 3 funded, plus a "can you add a blog?" change order.
2. **Meera's offer:** a counter-offer waiting for the client.
3. **BuildBot's contract:** milestone 1 funded, ready for a live agent run (sign in as Ravi).

PayPal steps in the seed are simulated with `DEMO-` ids so the views have data without keys. Contracts you create yourself use real PayPal once keys are set.

## 6. Check everything works

```bash
npm test              # 57 unit and integration tests
npm run typecheck
npm run lint
npm run eval:checker  # the AI checker against 24 test sites
```

With `npm run dev` running in another terminal:

```bash
npx newman run postman/milestonepay.postman_collection.json
```

## Useful commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` then `npm start` | Production build and server |
| `npm run seed:demo` | Demo contracts at every stage |
| `npm run jobs -- all` | Run every background job once |
| `npm run jobs -- --loop` | Background worker (what Render's worker runs) |
| `npm run paypal:currency-check` | Does your PayPal sandbox accept INR? |
| `npm run db:generate` | New SQL migration after editing `src/db/schema.ts` |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Seed or jobs hang | The dev server holds the local database. Stop it, run the script, start it again. |
| Turbopack panic: "task is missing in memory or persistent storage" | The `.next` cache was left inconsistent by a crash. Stop the server, delete `.next`, start again. |
| Timeline says it couldn't load | Run `npm run dev` (or `node scripts/copy-vendor.mjs`) so Bryntum is copied to `public/vendor/`. |
| Checker results all "couldn't check" | Install the browser: `npx playwright-core install chromium-headless-shell`. |
| "PayPal isn't configured yet" | Add sandbox keys to `.env.local` and restart (see [SPONSORS.md](SPONSORS.md#paypal)). |
| AG Grid shows a watermark | Expected without a license key; set `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` to remove it. |

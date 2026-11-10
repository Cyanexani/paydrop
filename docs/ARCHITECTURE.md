# Architecture

**Rule one: AI proposes, code decides.** Claude scopes, estimates, classifies and checks; deterministic TypeScript prices every milestone and is the only code that moves money.

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js pages<br/>AG Grid · Bryntum Gantt · PayPal buttons]
  end
  subgraph App["Next.js app (Render web service)"]
    API[Route handlers<br/>src/app/api]
    SVC[Services<br/>src/server]
    PRICE[Pricing engine<br/>src/lib/pricing]
    SM[Milestone state machine<br/>src/lib/milestones]
    AI[AI modules<br/>src/lib/ai]
    CHK[AI work checker<br/>src/lib/checker]
  end
  W[Worker + cron<br/>scripts/run-jobs.ts]
  DB[(Postgres / PGlite)]
  PP[PayPal]
  CL[Claude]
  K[Kernel]
  ES[Elastic]
  Z[Zapier]
  UI --> API --> SVC
  SVC --> PRICE
  SVC --> SM
  SVC --> AI --> CL
  SVC --> CHK --> K
  CHK --> CL
  SVC --> ES
  SVC --> DB
  SVC --> PP
  PP -- webhooks --> API
  Z -- messages --> API
  SVC -- events --> Z
  W --> SVC
```

## Layers

| Layer | Where | Responsibility |
| --- | --- | --- |
| Pages | `src/app/*/page.tsx`, `src/components/` | Client components that call the API; AG Grid and Bryntum load client-side only |
| API | `src/app/api/**/route.ts` | Thin handlers: parse with Zod, call a service, map errors (`src/server/http.ts`) |
| Services | `src/server/` | Party checks (only the client or freelancer of a contract can act on it), orchestration, effects |
| Domain | `src/lib/pricing`, `src/lib/milestones` | Pure, deterministic, unit-tested |
| Integrations | `src/lib/paypal`, `src/lib/ai`, `src/lib/checker`, `src/lib/search`, `src/lib/materials` | Typed clients with fallbacks |
| Data | `src/db/schema.ts`, `drizzle/` | Drizzle ORM; PGlite locally, Postgres on Render |

## The milestone state machine

`src/lib/milestones/state-machine.ts` is pure: `transition(state, event)` returns the next state plus side effects (PayPal calls, checker runs, payouts) for the caller to perform. Each event names an actor; only listed actors may send it. AI and agents can never send `CLIENT_APPROVE` or `AUTO_RELEASE`.

```mermaid
stateDiagram-v2
  [*] --> offered
  offered --> accepted: ACCEPT (freelancer)
  offered --> cancelled: CANCEL
  accepted --> cancelled: CANCEL
  accepted --> funding: START_FUNDING (client, in order)
  funding --> accepted: FUNDING_ABANDONED / FAILED
  funding --> funded: AUTHORIZED (amount = locked price)
  funded --> submitted: SUBMIT (contracted URL, ≤3/day)
  changes_requested --> submitted: SUBMIT
  needs_review --> submitted: SUBMIT
  submitted --> verified: CHECK_COMPLETED (all pass)
  submitted --> changes_requested: CHECK_COMPLETED (a fail)
  submitted --> needs_review: CHECK_COMPLETED (couldn't check)
  changes_requested --> needs_review: CHALLENGE
  verified --> releasing: CLIENT_APPROVE / AUTO_RELEASE (72h)
  needs_review --> releasing: CLIENT_APPROVE
  releasing --> release_pending: CAPTURE_PENDING
  releasing --> released: CAPTURE_COMPLETED
  release_pending --> released: CAPTURE_COMPLETED
  releasing --> release_failed: CAPTURE_FAILED
  release_failed --> funding: START_FUNDING (re-fund keeps the check)
  released --> payout_pending: PAYOUT_SENT
  payout_pending --> paid_out: PAYOUT_COMPLETED (all items)
  funded --> voided: VOID
  verified --> disputed: OPEN_DISPUTE
  disputed --> releasing: RESOLVE_DISPUTE (release)
  disputed --> voided: RESOLVE_DISPUTE (void)
```

Persistence (`src/server/milestone-store.ts`):

- **Compare-and-set:** every write names the `version` it read; the loser of a race re-reads and retries.
- **Idempotency:** the event id is the primary key of `milestone_events`, so a replayed event is a no-op.
- **Semantic dedupe:** a capture reported twice (API response and webhook) is applied once.
- **Hooks in the same transaction** (`src/server/hooks.ts`):
  - on funding, the payout split is locked
  - on release, the verified outcome goes into the freelancer's reputation, and one payout row is queued per payee
  - when everything is settled, the contract is marked complete

## Money flow

```mermaid
sequenceDiagram
  participant C as Client
  participant App as Paydrop
  participant PP as PayPal
  participant K as Checker (Kernel + Claude)
  participant F as Freelancer
  C->>App: Fund milestone
  App->>PP: Create order (AUTHORIZE, price + 5% fee)
  C->>PP: Approve
  App->>PP: Authorize → hold
  F->>App: Submit delivery URL
  App->>K: Check every criterion (recorded)
  K-->>App: pass / fail / couldn't check
  C->>App: Approve (or 72h after all pass)
  App->>PP: Reauthorize if > 3 days, then capture
  App->>PP: Payouts (price, split per payee)
  PP-->>App: Webhooks (verified, deduplicated)
```

## Pricing

`src/lib/pricing/engine.ts`, worked example in the brief:

- Task value = PERT hours × highest complexity × skill base rate, rounded to ₹50, never below the ₹300/hr floor.
- Milestone price = task value × urgency × (1 + tier premium).
- Fee = 5%, rounded per milestone.
- All money is integer paise (`src/lib/money.ts`).
- Verified Reputation Score and tiers: `src/lib/pricing/reputation.ts`.

## AI work checker

`src/lib/checker/run.ts`:

1. Open the delivery in a recorded browser: Kernel, or local Chromium.
2. Deterministic probes decide what they understand: page loads, overflow at a given width, titles and meta, sitemap, image counts, quoted text.
3. Claude drives the page with tools (open, click, fill, select, resize, record result) for interactive criteria.
4. **Merge:** if the probe and the AI disagree, the result is "couldn't check" and a person decides. Client-judged and file criteria go to the client.
5. **Injection guard:** if any page addresses the checker, no criterion can pass automatically.

Graded by `evals/checker` (see [CHECKER_EVAL.md](CHECKER_EVAL.md)).

## Data model

| Table | Holds |
| --- | --- |
| `users` | Personas, skills, verified outcomes (reputation), contact details for Zapier matching |
| `quotes` | Brief, AI scope result, model and prompt version |
| `contracts` | Parties, locked tier and standing, totals, delivery origins, collaborators, time zone |
| `milestones` | Draft (criteria), pricing, receipt, state (JSON), version, due date, locked split |
| `milestone_events` | Audit trail and idempotency |
| `check_runs` | Every checker run: steps, results, replay |
| `payouts` | One row per payee per milestone |
| `negotiations` | Counter-offers and AI re-estimates |
| `messages`, `change_requests` | Scope-creep thread and change or schedule requests |
| `deliveries` | Sites built by AI agents |
| `materials` | Channel3 items added to a milestone budget |
| `webhook_events` | Every PayPal webhook, deduplicated by PayPal's id |

## Security

- **Party checks:** every route checks the caller is a party to the contract.
- **Accounts and sessions:** passwords hashed with scrypt; sessions are random tokens in an httpOnly, SameSite=Lax cookie, stored as SHA-256 with a 30-day expiry and deleted on sign-out; sign-in is rate-limited per email and address; auth endpoints refuse cross-site origins; password reset links are single-use, expire in 30 minutes, go out through the Zapier hook and sign out every other session. `src/proxy.ts` sends signed-out visitors to sign-in; every API call still checks the session in the database. Demo personas sign in without a password (`DEMO_LOGIN=off` turns that off).
- **Webhooks:** verified with PayPal's verify-webhook-signature API; the capture is re-fetched before acting.
- **Amounts:** come from PayPal, never the browser; a mismatch voids the hold.
- **Agent sites:** served with `Content-Security-Policy: sandbox`, so their scripts run in an opaque origin.
- **Shared secrets:** Cron, admin and Zapier endpoints require them. CI runs gitleaks.

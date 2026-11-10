# Paydrop — PayPal AI Hackathon Build Brief

> The product spec this repo was built from, exported from the team's [Claude Doc](https://claude.ai/artifact/R43CwA1q3VpxZmuMvWpmDs) on 9 Nov 2026. Where the code differs, the code and [EDGE_CASES.md](EDGE_CASES.md) are current.

2026-11-09 · @Aniketh Pani

## How to use this brief

Paydrop is an AI freelance marketplace where every milestone is a bridge: the client's money is held in PayPal, an AI checks the delivered work against agreed criteria, and payment is released only for verified work. It is Aniketh's entry for the PayPal AI Hackathon on Devpost, due 12 Nov 2026 at 12:00pm PST (1:30am IST, 13 Nov).

**Pitch:** "Describe your project. The AI scopes it, prices it fairly, finds the right freelancer, and only pays them when the work is verified — whether the worker is a human or an AI agent."

**To use as a prompt:** export this doc as Markdown and give it to your coding AI with this opening line:

```markdown
You are my engineering partner for a 3-day hackathon build. The full product spec is below. Follow the build order in the 3-day plan, keep the milestone state machine and the pricing engine as deterministic, unit-tested TypeScript, and never let AI output move money without validation and a human or rule-based gate. Start with Day 1. Ask me only when a decision is irreversible.
```

## Hackathon facts

The one hard rule: the project must meaningfully use both PayPal (sandbox is fine) and AI, with a working demo.

| Item | Detail |
| --- | --- |
| Event | Build What's Next with PayPal and AI, online, no tracks |
| Deadline | 12 Nov 2026, 12:00pm PST (13 Nov, 1:30am IST) |
| Must submit | Text description; working demo (hosted URL or repo with run steps); list of AI tools and how each is used; public open-source repo with license visible; YouTube demo video under 3 minutes |
| Existing projects | Allowed, but must show meaningful progress during the hackathon |
| Judging | Technological implementation, design, potential impact, innovation, presentation |
| Main prizes | 1st $12,000 · 2nd $8,000 · 3rd $5,000 |
| Special awards ($5,000 each) | Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce |
| Sponsor prizes | AG Grid $5,000 / $2,000 / $1,000 · APIMatic $1,000 + subscription · Bryntum $1,000 · Channel3 $1,500 · Render credits $1,000 / $750 / $500 |
| No sponsor prize | Elastic, Postman, Astropods, KERNEL, Zapier |
| Prize cap | At most one grand prize and one sponsor prize per project |

Because of the cap, integrate every sponsor meaningfully but go deepest on AG Grid, the largest sponsor prize.

Sources: [hackathon page](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules).

## Judges and what they will look for

The PayPal judges will decide mostly on two questions: is the AI trustworthy with money (Himraj), and is it really agentic (Nathaniel). Views below are inferred from each judge's public work, not from anything they said about this project.

| Judge | Role | Likely focus | What to show |
| --- | --- | --- | --- |
| Himraj Singh | Engineering Manager, PayPal | AI assurance and testing | Eval set for the checker, zero wrongful releases, AI never releases money alone |
| Nathaniel Olson | Senior PM, PayPal | Agentic commerce (inferred from PayPal's product direction) | Agents that scope, price, negotiate and release payment on their own |
| Jo Franchetti | Developer Advocate, PayPal | TypeScript, web, developer experience | Strict TypeScript, one-command setup, clean README |
| Marco Podien | Developer Advocate, PayPal | End-to-end type safety | Zod-validated AI output and shared types |
| Eddie Jaoude | Developer Advocate, PayPal | Open source, community | MIT license, CONTRIBUTING.md, good issues |
| Karthik Ravi | Software Engineer, PayPal | Not confirmed | Correct PayPal integration: order intents, webhooks, error handling |
| Sylwia Vargas | AG Grid | AG Grid used deeply | Grouped ledger, totals, custom cells, export, MCP filtering |
| Mats Bryntse | CEO, Bryntum | Scheduling UI that drives actions | Gantt as the main project view; drag a deadline to create a change request |
| Carly Richmond | Elastic | Data and ML for web devs; ex-banking | Correct ledger, audit trail, Elastic-powered search |
| Pooja Mistry | Postman | APIs, agents, MCP | Published Postman collection used as tests |
| Ameer Hassan | APIMatic | AI-ready API context | Context Plugins used for PayPal integration; SDK for your own API |
| Ignacio Valdez Bicard | Channel3 | Product search for agents | Materials sourcing for milestones |
| Shifra Williams | Render | "How does this make a developer's day better?" | Web service plus worker deployed from render.yaml |

## The product

The milestone is the bridge between "work claimed done" and "money released"; the AI is the inspector on that bridge. Each milestone holds the promise (checkable acceptance criteria), the money (held via PayPal authorization) and the decision (made from evidence, not from anyone's word).

### Client flow

1. Client describes the project and budget in plain language.
2. AI scopes it into milestones with checkable criteria and asks clarifying questions if the brief is vague.
3. AI prices each milestone with a visible price receipt (see Pricing model).
4. AI matches 2–3 freelancers by skill and verified track record, explaining why.
5. Client funds the first milestone through PayPal (authorized and held, not captured).
6. Client approves release after the AI check passes, or release happens automatically after a timeout only if every check passed.

### Freelancer flow

1. Receives an offer with milestones, criteria and price breakdown.
2. Accepts, declines, or counter-offers (AI re-estimates; maximum 2 rounds).
3. Starts work only once the milestone is funded.
4. Submits evidence: repo link, live URL, screenshots.
5. AI check runs; on pass the payment is captured and paid out, collaborators receive their split automatically.
6. Every verified milestone builds their Verified Reputation Score.

### Features that set it apart

- **AI work checker:** opens the delivered site in a cloud browser, tests each criterion, records a replay as evidence.
- **Scope-creep detector:** a new client request is compared to the contract; out-of-scope requests become a priced change order with a PayPal payment link.
- **Verified reputation:** experience is earned from AI-checked outcomes, not claimed.
- **Split payouts:** collaborators are paid their share via PayPal Payouts when a milestone clears.
- **Dispute pack:** a timeline of criteria, evidence, replays and messages.
- **AI agents as workers:** the same milestone bridge pays an AI coding agent only for verified output (a 20-second moment in the demo).

## Pricing model

Same work earns the same base pay; extra pay comes only from proven, verified experience the client chooses to pay for. The AI makes judgments (hours, complexity tags, reasons); plain code does all the arithmetic so every price is reproducible and unit-tested.

### Core formulas

```latex
\text{Client pays} = \sum \text{milestone prices} \times (1 + \text{platform fee})
```

```latex
\text{Milestone price} = \text{Task value} \times \text{Urgency} \times (1 + \text{Experience premium})
```

```latex
\text{Task value} = \text{Expected hours} \times \text{Complexity} \times \text{Skill base rate}
```

**Expected hours** use the PERT formula on the AI's three estimates (optimistic O, most likely M, pessimistic P), returned as Zod-validated JSON with reasons:

```latex
E = \frac{O + 4M + P}{6}
```

If P > 2.5 × O, the brief is too vague: the AI asks clarifying questions instead of pricing.

**Complexity** comes from tags the AI picks; code applies the highest one, never the product:

| Tag | Multiplier |
| --- | --- |
| Standard (static pages, layout) | 1.0 |
| Data or auth (logins, databases) | 1.15 |
| Integrations (payments, third-party APIs) | 1.2 |
| Unclear legacy code | 1.3 |

**Skill base rate** is a platform benchmark per skill, the same for everyone (demo: web dev ₹500/hr, UI design ₹450/hr, video editing ₹400/hr). A hard floor (e.g. ₹300/hr effective) applies whatever the AI estimates.

**Urgency** is 1.0 when the deadline allows normal pace (expected hours ÷ 4 productive hours a day), plus 0.10 per 25% faster, capped at 1.3.

### Verified Reputation Score (VRS)

```latex
\text{VRS} = 100 \times (0.35\,\text{FPR} + 0.25\,\text{OTR} + 0.20\,\text{Rating} + 0.20\,\text{Volume})
```

- First-pass rate and on-time rate use Bayesian smoothing so two lucky jobs do not look like 100%: FPR = (passes + 2) / (attempts + 4).
- Rating normalised from 1–5 stars: (stars − 1) / 4.
- Volume = min(1, log(1 + n) / log(31)), saturating near 30 milestones.
- Each milestone is weighted 0.5^(age in days / 180), so old work fades.
- Reputation is tracked per skill. AI-verified outcomes carry 80% of the weight, ratings 20%, so fake reviews barely move it.

| Tier | Min VRS | Min verified milestones | Premium |
| --- | --- | --- | --- |
| New | — | 0 | 0% |
| Rising | 40 | 2 | +10% |
| Proven | 65 | 5 | +20% |
| Expert | 80 | 15 | +30% |

### Worked example: dance studio website

Brief: website with booking and gallery, 2-week deadline, web dev at ₹500/hr. Expected 29 hours ÷ 4 hrs/day ≈ 7.3 days, so urgency = 1.0.

| Milestone | O / M / P hours | Expected hours | Complexity | Task value (₹) |
| --- | --- | --- | --- | --- |
| Design and layout | 6 / 8 / 14 | 8.67 | 1.0 | 4,350 |
| Booking system | 8 / 12 / 20 | 12.67 | 1.2 | 7,600 |
| Gallery | 3 / 4 / 7 | 4.33 | 1.0 | 2,150 |
| Deploy and SEO | 2 / 3 / 6 | 3.33 | 1.0 | 1,650 |
| Total |  | 29.0 |  | 15,750 |

| Freelancer | Record | VRS | Tier | Price (₹) |
| --- | --- | --- | --- | --- |
| Ravi | 2 attempts, 2 passed, 2 on time, 5.0 stars | 66 | Rising (only 2 milestones) | 17,325 |
| Meera | 18 attempts, 17 first-pass, 16 on time, 4.7 stars | 86 | Expert | 20,475 |

Both earn the same ₹15,750 base for the work; the platform's 5% fee is shown separately on top.

### Negotiation

The PERT range sets a fair band per milestone: Optimistic hours × complexity × rate to Pessimistic hours × complexity × rate (booking system: ₹4,800–₹12,000). A counter-offer inside the band is marked fair; outside it needs a written reason, which the AI uses to re-estimate. Maximum two rounds.

### Bonuses, never penalties

- First-pass bonus: +5% if the AI check passes on the first try (client sets it upfront).
- Optional early-delivery bonus.
- No automatic pay cuts; lateness is handled by deadline terms agreed at signing.
- Price and tier are locked at contract signing.

### Money flow per milestone

1. Client funds milestone price + 5% platform fee: PayPal order authorized and held.
2. AI check passes and client approves (or timeout with all checks passed): capture.
3. Freelancer receives the milestone price (+ bonus) via PayPal Payouts; collaborators receive their split.
4. Platform keeps the fee; PayPal's own processing fee is shown transparently.

For the sandbox demo, capture the full amount and pay the freelancer through Payouts rather than relying on PayPal's marketplace platform-fee feature, which usually needs partner approval.

### The estimator learns

Estimated vs actual hours are stored for each milestone. Similar past milestones are fed to the AI as examples next time (the Precedent idea reused), and estimate error is charted as it shrinks.

### Price receipt

```markdown
Booking system — ₹8,360
  12.67 hrs (PERT 8/12/20) × 1.2 (payment integration) × ₹500/hr = ₹7,600
  × 1.10 Rising tier (VRS 66, 2 verified milestones)            = ₹8,360
  Fair band: ₹4,800 – ₹12,000
```

## Milestone state machine and verification

Every milestone moves only along the paths below; any other transition is rejected, which prevents double payments, release without a check, and work on unfunded milestones.

> Diagram in the original doc: milestone state machine · 17 states

The AI checker's rules:

- Runs Kernel's cloud browser against the delivered URL and repo, tests each criterion, and stores the replay and commit hash as evidence.
- Treats all page content as data, never as instructions; output must match a strict schema.
- Never releases money on its own: release needs client approval, or a timeout when every criterion passed.
- Infrastructure errors mark a check "couldn't check", never "failed".
- Every capture and payout carries an idempotency key; RELEASED can be entered once.
- A cron worker tracks authorization expiry and reauthorizes or voids in time.

## Edge cases

Build the rows marked Build during the 3 days; list the rest in the README under "Edge cases we handle".

51 of the 72 cases are marked Build. Most are one guard in the milestone state machine or one validator in the pricing engine; give each a unit test named after its row, so the README can point every case to its test.

| Area | Edge case | Handling | Priority |
| --- | --- | --- | --- |
| Scoping | Brief too short, vague or not a project | AI returns questions instead of milestones; nothing is priced until they are answered | Build |
| Scoping | Brief asks for work that breaks PayPal's Acceptable Use Policy or the law (e.g. fake reviews) | AI refuses to scope it and flags the account; no payment link is created | Build |
| Scoping | Milestones depend on each other | Milestones run in order; the next is funded only after the previous one is released, unless the client chooses to fund in parallel | Build |
| Pricing | AI estimate range too wide | P > 2.5 × O blocks pricing; AI asks clarifying questions | Build |
| Pricing | Budget below fair price | Offer: cut scope, extend deadline, or pick a newer freelancer; never go below the floor | Build |
| Pricing | Malformed AI output | Zod rejects; retry once; fall back to manual quote; money never moves on it | Build |
| Pricing | Tiny or huge projects | Minimum milestone value; cap milestones per contract or split into phases | Build |
| Pricing | Tier changes mid-project | Price locked at signing | Build |
| Pricing | Currency | Locked at signing; demo uses one currency | Build |
| Pricing | Same brief priced twice gives different numbers | Each quote stores the model, prompt version and AI estimates; re-pricing is an explicit new quote, never silent | Build |
| Pricing | Deadline in the past, or too short even at the 1.3 urgency cap | Rejected with the earliest workable date and an option to drop milestones | Build |
| Pricing | Rounding makes milestones not add up to the total | Money stored as integers in the smallest unit; each milestone rounded once; total = sum of rounded milestones | Build |
| Pricing | Skill missing from the base-rate table | No price; uses the closest skill's rate only if the client agrees, otherwise asks for a manual rate | README |
| Matching | No freelancer has the skill | Say so; post openly or split the milestone | Build |
| Matching | All offers declined | Widen search to the next tier or a related skill | README |
| Matching | Top freelancers take everything | Cap active contracts; rotate offers; newcomers get smaller milestones | Build |
| Matching | Freelancer goes silent | Reassign after X days; held payment voided | Build |
| Matching | Offer gets no reply | Offer expires after 48 hours and goes to the next match | README |
| Matching | Freelancer overbooks with overlapping deadlines | Accept is blocked when active contracts need more than 8 hours a day at normal pace | README |
| Verification | AI wrongly passes bad work | AI never releases alone; client approval or all-pass timeout; dispute window | Build |
| Verification | AI wrongly fails good work | Freelancer challenges; second check by another method; then human review | Build |
| Verification | Prompt injection in delivered work | Page content treated as data; strict output schema; included in eval set | Build |
| Verification | Live site down during check | Retry with backoff; mark "couldn't check", never "failed" | Build |
| Verification | Subjective criteria | Rewritten as checkable, or marked client-judged at contract time | Build |
| Verification | Work changed after passing | Check tied to commit hash and Kernel replay snapshot | Build |
| Verification | Submitted URL or repo isn't the contracted project | Domain or repo is fixed in the contract; the checker rejects anything else | Build |
| Verification | Freelancer resubmits until the AI passes | At most 3 checks a day per milestone; every attempt is logged and counts toward first-pass rate; the bonus only applies to attempt 1 | Build |
| Verification | Delivered site is hostile (malware, attacks the checker) | Checks run only in the Kernel cloud browser, never on the server, with no platform secrets in that session and a time limit | Build |
| Verification | Same site passes, then fails (flaky check) | Each criterion runs twice; a disagreement becomes "couldn't check" and goes to the client | README |
| Verification | Site needs a login to test | Freelancer adds a test account to the submission; stored encrypted and deleted after the check | README |
| Verification | Delivery isn't a website (design file, video, document) | Checker runs file checks (format, size, duration); everything else is client-judged | README |
| Scope creep | Detector flags a request that is in scope | The flag is only a proposal; either party marks it in scope and nothing is charged | Build |
| Scope creep | Detector misses an out-of-scope request | Freelancer raises a change order by hand | Build |
| Scope creep | Client won't pay the change order | Extra work is not started; the original milestones carry on unchanged | Build |
| Scope creep | Request comes from someone other than the client | Zapier messages are matched to the client's verified phone or email; unknown senders are ignored and flagged | README |
| Payments | PayPal's currency list doesn't include INR | Test an INR order in sandbox on Day 1; if it's rejected, charge in USD and show ₹ as the converted display price | Build |
| Payments | Amount changed in the browser | Order amount set server-side from the locked quote; amount and currency checked again before the milestone is marked funded | Build |
| Payments | Client abandons PayPal checkout | Order stays unapproved; milestone stays unfunded; the cron worker cleans up stale orders | Build |
| Payments | Funding fails | Milestone stays unfunded; freelancer told not to start | Build |
| Payments | Authorization expires | Track expiry; reauthorize or ask to re-fund via cron worker (check PayPal docs for limits) | Build |
| Payments | Milestone runs longer than an authorization can hold | Authorizations last 29 days with a 3-day honor period; cap a milestone at 25 days or split it; reauthorize before capture once the honor period has passed | Build |
| Payments | Capture comes back pending | Payout waits for the PAYMENT.CAPTURE.COMPLETED webhook; milestone shows "release pending" | Build |
| Payments | Capture fails at release (funds gone, authorization voided) | Milestone moves to "release failed"; client asked to re-fund; the passed check is kept | Build |
| Payments | Double release (duplicate webhook or click) | Idempotency keys; state machine allows RELEASED once | Build |
| Payments | Partial delivery | Partial capture only with client agreement; never automatic | README |
| Payments | Collaborator splits don't add up, or change mid-milestone | Splits must total 100% in the smallest unit, with any remainder to the lead freelancer; locked when the milestone is funded | Build |
| Payments | Payout fails | Held as "payout pending"; retry after freelancer fixes account | Build |
| Payments | One payout in a split batch fails | Each item tracked on its own; only failed items go in a new batch; a timed-out request is retried with the same sender_batch_id, which PayPal won't pay twice within 30 days | Build |
| Payments | Freelancer has no PayPal account | Payout goes UNCLAIMED and the freelancer is prompted to claim it; unclaimed money returns after 30 days and the milestone goes back to "payout pending" | README |
| Payments | Refund or chargeback | Dispute window; freeze unsent payouts; evidence pack | README |
| Payments | Chargeback after the payout already went out | Platform absorbs it in the demo; a real launch holds a reserve from fees | README |
| People | Client never approves | Auto-release only when every check passed | Build |
| People | Client cancels mid-project | Paid stays paid; current milestone by agreement; future cancelled | README |
| People | Copied work | Optional similarity check; client dispute | README |
| People | Freelancer withdraws mid-project | The funded milestone is voided and returned to the client; released work stays paid; the withdrawal is noted on their reputation | README |
| People | Either side asks to pay outside the platform | Elastic flags "pay me directly" messages; a warning says protection only covers on-platform payments | README |
| Agents | AI agent can't hold a PayPal account | Each agent is registered to a human or company owner, whose PayPal receives the payout and who answers disputes | Build |
| Agents | Agent tries to release its own payment | Agent tools exclude capture, release and payout; only the state machine moves money | Build |
| Agents | Agent loops or never finishes | Time and attempt limits per milestone; unpaid unless verified; client can reassign to a human | Build |
| Reputation | Client and freelancer are the same person | Same user, email or PayPal account on both sides is blocked; such work earns no VRS | Build |
| Reputation | Fake or revenge ratings | Only parties to a released, paid milestone can rate; ratings are 20% of VRS | Build |
| Reputation | Milestone under dispute | Counts toward VRS only after the dispute closes | README |
| Security | Forged webhook | Every webhook verified with PayPal's verify-webhook-signature API; order state re-fetched from PayPal before any transition | Build |
| Security | Secrets in the public repo | .env git-ignored, sandbox keys only, secret scanning on, keys rotated before submission | Build |
| Security | User acts on someone else's contract | Every API route checks the caller is a party to that contract | Build |
| Security | Personal data sent to the AI | Names, emails and phone numbers stripped from prompts that don't need them | README |
| System | AI provider down | Queue and retry; payments unaffected | README |
| System | Missed webhook | Nightly reconciliation with PayPal order states | README |
| System | Concurrent contract edits | Versioning; both parties re-accept | README |
| System | Webhook and cron update the same milestone at once | Transitions are compare-and-set on a version column; the loser re-reads and retries | Build |
| System | Time zones (IST client, PST deadline) | Store UTC; show each user's zone; deadlines end at 23:59 in the contract's zone | Build |
| Demo | Render asleep, sandbox slow, or a step fails while recording | Warm the service first; a one-command seed script rebuilds a contract at every stage; record from a run that worked | Build |

PayPal limits checked 9 Nov 2026: [authorizations](https://developer.paypal.com/docs/checkout/standard/customize/authorization/), [currency codes](https://developer.paypal.com/api/rest/reference/currency-codes/), [duplicate payout batches](https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post), [unclaimed payouts](https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-item-cancel), [webhook signature check](https://developer.paypal.com/api/webhooks/v1/), [webhook events](https://developer.paypal.com/api/rest/webhooks/event-names/).

## Sponsor integrations

Each sponsor has a job that would break a feature if removed. AG Grid is the hero integration.

| Sponsor | Job in Paydrop | Priority |
| --- | --- | --- |
| PayPal (core) | Orders with authorize then capture for milestone funding; Invoicing; Payouts for freelancer and collaborator splits; webhooks; Agent Toolkit or MCP server for agent actions | Must |
| AG Grid (hero) | Money ledger grouped by client and project with totals, status cells and export; criteria-check grid with replay links; price-receipt rows; fairness dashboard; MCP filtering from chat | Must |
| KERNEL | Cloud browser for the AI work checker: opens the delivered site, tests each criterion, records a replay as evidence | Must |
| Elastic | Indexes contracts and messages; powers the scope-creep detector and evidence search for the dispute pack | Must |
| Render | Hosts the Next.js app, background worker, cron jobs (nudges, authorization expiry) and Postgres via render.yaml | Must |
| Bryntum | Gantt as the main project view; milestones show payment dates; dragging a deadline creates a change request | Should |
| Astropods | Runs the scope-creep, checker and nudge agents with runtime monitoring and guardrails | Should |
| Postman | API collection for the full flow (fund, check, release, webhook) used as the integration test suite in CI | Should |
| Zapier | Client email or WhatsApp messages become change requests; released payments post to Slack or Sheets | Nice |
| APIMatic | Context Plugins while building the PayPal integration; generated TypeScript SDK and docs for Paydrop's own API | Nice |
| Channel3 | Materials and expenses: the agent sources items a milestone needs and adds them to its funded budget (strongest when pitched for all freelancers, not only developers) | Nice |

**Demo story that touches every sponsor:** client sends "can you also add a blog?" on WhatsApp → Zapier brings it in → Elastic flags it as out of scope → an Astropods agent drafts a change order → a block appears on the Bryntum Gantt → client pays via PayPal → freelancer delivers → Kernel tests the site and records a replay → AG Grid shows money move from held to released → the designer's share goes out via Payouts, all running on Render.

## Tech stack and architecture

Agents only propose; deterministic TypeScript in the core API validates every proposal and is the only code that calls PayPal.

> Diagram in the original doc: Paydrop architecture · 4 layers

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict), monorepo |
| Web | Next.js, AG Grid, Bryntum Gantt |
| Validation | Zod schemas for every AI output and API input |
| Data | Postgres on Render |
| Jobs | Render background worker and cron |
| Agents | Astropods runtime; any LLM provider |
| Payments | PayPal sandbox: Orders (authorize, capture), Payouts, Invoicing, webhooks; Agent Toolkit or MCP server |
| Tests | Unit tests for pricing and state machine; Postman collection in CI; checker eval set |
| License | MIT |

## 3-day plan and submission

Submit by the morning of 12 Nov IST, well before the 1:30am IST cutoff on 13 Nov. Each day ends with something that works on its own.

### Day 1 — 9–10 Nov: the core (a valid submission on its own)

- [ ] PayPal sandbox app and credentials; Orders authorize and capture working
- [ ] Test one INR order in the PayPal sandbox; if it's rejected, charge in USD and show ₹ only as a display price
- [ ] Brief → AI scoping into milestones with criteria (Zod-validated)
- [ ] Pricing engine as a tested TypeScript module (PERT, complexity, urgency, VRS, tiers, floor)
- [ ] Freelancer accepts → client funds milestone (held)
- [ ] Milestone state machine with idempotent transitions

### Day 2 — 11 Nov: make it impressive

- [ ] Kernel-based AI work checker with replay evidence
- [ ] Release flow: capture → Payouts split → platform fee
- [ ] Elastic scope-creep detector → change order with PayPal payment link
- [ ] AG Grid ledger and criteria grid; Bryntum Gantt
- [ ] Deploy to Render (web, worker, cron, Postgres)

### Day 3 — 12 Nov morning IST: finish and ship

- [ ] Checker eval set (20–30 deliveries including prompt-injection cases) and its score
- [ ] Matching and counter-offer negotiation
- [ ] Astropods agents, Postman collection, Zapier, APIMatic SDK, Channel3 if time allows
- [ ] README, MIT license, CONTRIBUTING.md, edge-case table, render.yaml
- [ ] Record the video before any polishing; submit

**Cut order if late:** Channel3 → APIMatic SDK → Zapier → negotiation (auto-accept) → matching (pick one freelancer) → dispute pack → Payouts split. Never cut: PayPal hold and release, the AI checker, the scope-creep demo, the video.

### Demo video (under 3 minutes)

1. 0:00–0:20 — The problem: freelancers get paid late and squeezed by "one small change".
2. 0:20–1:00 — Client brief → AI milestones → price receipt → freelancer accepts → PayPal funding held.
3. 1:00–1:40 — Delivery (use the real Jaya Dance & Fitness site) → Kernel checks it live → payment released, split paid out.
4. 1:40–2:10 — "Can you add a blog?" → flagged out of scope → change order paid.
5. 2:10–2:30 — An AI coding agent completes a milestone and is paid only after verification.
6. 2:30–2:50 — Trust: eval score, prompt injection blocked, AG Grid ledger and Gantt.
7. 2:50–3:00 — "Pay for outcomes, not promises."

### Submission checklist

- [ ] Public repo with license visible in the About section
- [ ] Hosted demo URL on Render, plus run instructions
- [ ] Text description listing new hackathon-period work (if reusing any earlier code, say so)
- [ ] List of AI tools and models and how each is used
- [ ] YouTube video under 3 minutes, public, no unlicensed music or trademarks
- [ ] Sponsor tools named in the description


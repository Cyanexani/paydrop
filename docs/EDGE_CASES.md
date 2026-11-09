# Edge cases

All 72 cases from the [build brief](BUILD_BRIEF.md#edge-cases), with where each stands in the code.

**Status:** **Done** = handled in code (and tested where a test is named) · **Partial** = the core rule is enforced, the rest is planned · **Planned** = documented handling, not built yet.

Tests: `src/lib/pricing/pricing.test.ts` (pricing), `src/lib/milestones/state-machine.test.ts` (state machine), `src/server/*.test.ts` (database flows), `evals/checker` (checker), `postman/` (API).

Totals: **53 Done · 11 Partial · 8 Planned**.

| Area | Edge case | Handling | Status | Where / test |
| --- | --- | --- | --- | --- |
| Scoping | Brief too short, vague or not a project | AI returns questions; nothing is priced | Done | `scoping.ts`; test "a vague brief asks questions" |
| Scoping | Brief asks for work that breaks PayPal's AUP or the law | AI refuses to scope it; no contract or payment link possible | Done | `scoping.ts` (`refused`) |
| Scoping | Milestones depend on each other | Funded in order unless the client funds in parallel; change orders can be paid right away | Done | test "Milestones depend on each other" |
| Pricing | AI estimate range too wide | Judged on the whole brief's totals (P > 2.5 × O); asks questions | Done | test "AI estimate range too wide" |
| Pricing | Budget below fair price | Options (cut scope, extend deadline, newer freelancer); price never lowered | Done | test "Budget below fair price" |
| Pricing | Malformed AI output | Structured output + Zod; retry once; then manual quote; no money moves on it | Done | `scoping.ts`; test "Malformed AI output" |
| Pricing | Tiny or huge projects | ₹1,000 minimum milestone; at most 8 milestones | Done | test "Tiny or huge projects" |
| Pricing | Tier changes mid-project | Tier and price locked on the contract at signing | Done | `contracts.ts` |
| Pricing | Currency | One charge currency per contract, FX rate locked at signing | Done | `fx.ts` |
| Pricing | Same brief priced twice gives different numbers | Quote stores model, prompt version and the AI's estimates | Done | `quotes` table |
| Pricing | Deadline in the past, or too short | Rejected with the earliest workable length | Done | test "Deadline in the past, or too short" |
| Pricing | Rounding | Integer paise; each milestone rounded once; total = sum | Done | property test "Rounding" |
| Pricing | Skill missing from the base-rate table | Asks for a manual rate | Done | test "Skill missing from the base-rate table" |
| Matching | No freelancer has the skill | No candidates are shown | Partial | `matching.ts` (no "post openly" yet) |
| Matching | All offers declined | Widen to the next tier or a related skill | Planned | |
| Matching | Top freelancers take everything | At most 3 open contracts each; a newcomer is always rotated in | Done | `matching.ts` |
| Matching | Freelancer goes silent | 3 days past due with nothing submitted → hold voided | Done | test "jobs: … silent freelancer" |
| Matching | Offer gets no reply | Offer expires after 48 hours | Done | test "jobs: … offer expiry" |
| Matching | Freelancer overbooks | Capacity check on accept | Planned | |
| Verification | AI wrongly passes bad work | AI and agents can't release; auto-release only if every check passed; disputes | Done | test "AI wrongly passes bad work" |
| Verification | AI wrongly fails good work | Freelancer challenges → person decides; probe/AI disagreement → couldn't check | Done | test "AI wrongly fails good work" |
| Verification | Prompt injection in delivered work | Page text is data; any instruction aimed at the checker blocks every pass | Done | eval: 0 of 48 injection criteria passed |
| Verification | Live site down during check | Retries with backoff; "couldn't check", never "failed" | Done | eval case `server-error`; test "Live site down" |
| Verification | Subjective criteria | Rewritten as checkable by the AI, or marked client-judged | Done | `client_judged` method |
| Verification | Work changed after passing | Each check run stores the commit SHA and replay | Partial | no automatic re-check on change |
| Verification | Submitted URL or repo isn't the contracted project | Only the contracted origin is accepted | Done | test "Submitted URL isn't the contracted project" |
| Verification | Freelancer resubmits until the AI passes | ≤ 3 checks a day; every attempt counts; bonus only on attempt 1 | Done | test "Freelancer resubmits until the AI passes" |
| Verification | Delivered site is hostile | Runs only in Kernel's (or a local) isolated browser, time-limited; agent sites CSP-sandboxed | Done | `checker/browser.ts`, `deliveries` route |
| Verification | Same site passes, then fails (flaky) | Probe vs AI disagreement → couldn't check | Partial | no double run yet |
| Verification | Site needs a login to test | Test account in the submission | Planned | |
| Verification | Delivery isn't a website | File criteria go to the client | Partial | no automated file checks yet |
| Scope creep | Detector flags a request that is in scope | Either party marks it in scope; nothing charged | Done | `decideChangeRequest` |
| Scope creep | Detector misses an out-of-scope request | Freelancer raises a change order | Done | `raiseChangeRequest` |
| Scope creep | Client won't pay the change order | Declined; extra work not started; originals unchanged | Done | `decideChangeRequest` |
| Scope creep | Request from someone other than the client | Zapier sender matched to verified phone/email; unknown senders ignored | Done | `zapierInbound` |
| Payments | INR isn't on PayPal's currency list | Default USD at a locked rate; `npm run paypal:currency-check` | Done | `fx.ts`, script |
| Payments | Amount changed in the browser | Order built server-side; authorized amount checked; mismatch voids the hold | Done | test "Amount changed in the browser" |
| Payments | Client abandons PayPal checkout | Milestone stays unfunded; stale orders cleaned by a job | Done | test "Funding fails / client abandons checkout" |
| Payments | Funding fails | Unfunded; freelancer told not to start | Done | same test |
| Payments | Authorization expires | Release refused; unfinished holds voided by a job | Done | test "Authorization expires" |
| Payments | Milestone longer than a hold | 25-day cap; reauthorize after the 3-day honor period | Done | tests "Milestone runs longer…", "honor period" |
| Payments | Capture comes back pending | No payout until completed | Done | test "Capture comes back pending" |
| Payments | Capture fails at release | "Release failed"; re-funding keeps the passed check | Done | test "Capture fails at release" |
| Payments | Double release | Event-id idempotency; repeat captures are no-ops | Done | test "Double release"; duplicate webhook test |
| Payments | Partial delivery | Partial capture by agreement | Planned | |
| Payments | Collaborator splits don't add up | Must total 100% in paise; remainder to lead; locked at funding | Done | tests "Collaborator splits", lifecycle |
| Payments | Payout fails | "Payout pending"; failed items retried by a job | Done | test "Payout fails" |
| Payments | One payout in a split batch fails | One row per payee; only failed items re-sent; same `sender_batch_id` on retry | Done | lifecycle test |
| Payments | Freelancer has no PayPal account | UNCLAIMED webhook → payout pending, retried | Partial | no claim prompt yet |
| Payments | Refund or chargeback | Disputes freeze the money | Partial | no refund API calls yet |
| Payments | Chargeback after the payout went out | Platform reserve | Planned | |
| People | Client never approves | Auto-release after 72 h, only if every check passed | Done | tests "Client never approves", jobs |
| People | Client cancels mid-project | Offers can be declined; holds can be voided | Partial | no cancel button mid-project |
| People | Copied work | Similarity check | Planned | |
| People | Freelancer withdraws | `VOID (freelancer_withdrew)` exists in the state machine | Partial | no withdraw button |
| People | Pay outside the platform | Flag "pay me directly" messages | Planned | |
| Agents | AI agent can't hold a PayPal account | Agent registered to a human owner, who is paid | Done | test "AI agent worker" |
| Agents | Agent tries to release its own payment | Agents can't send release events | Done | test "AI wrongly passes bad work" (agent actor) |
| Agents | Agent loops or never finishes | 3 runs per milestone; unpaid unless verified | Done | `agent.ts` |
| Reputation | Client and freelancer are the same person | Blocked at contract creation; self-dealt outcomes earn nothing | Done | test "Client and freelancer are the same person" |
| Reputation | Fake or revenge ratings | Only the client of a released milestone, once; ratings are 20% of VRS | Done | lifecycle test (`already_rated`) |
| Reputation | Milestone under dispute | Open disputes excluded from VRS | Partial | test "Milestone under dispute" |
| Security | Forged webhook | Verified with PayPal; capture re-fetched | Done | Postman "Forged PayPal webhook is rejected" |
| Security | Secrets in the public repo | `.env*` ignored; gitleaks in CI | Done | `.github/workflows/ci.yml` |
| Security | User acts on someone else's contract | Party check on every route | Done | tests + Postman "Stranger can't read the contract" |
| Security | Personal data sent to the AI | Strip PII from prompts | Planned | |
| System | AI provider down | Typed errors (503, retryable); stuck checks re-run | Partial | no queue yet |
| System | Missed webhook | Reconciliation job and nightly cron | Done | `jobs.ts` (`reconcile`) |
| System | Concurrent contract edits | Compare-and-set on milestones and negotiations | Partial | contract-level versioning planned |
| System | Webhook and cron update the same milestone | Compare-and-set on a version column | Done | test "Webhook and cron update the same milestone" |
| System | Time zones | UTC storage; due dates end 23:59 in the contract's zone | Done | `time.ts` |
| Demo | Render asleep, sandbox slow, or a step fails | `npm run seed:demo` rebuilds every stage | Done | `scripts/seed-demo.ts` |

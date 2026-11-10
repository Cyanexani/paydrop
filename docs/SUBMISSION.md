# Devpost submission

Deadline: **12 Nov 2026, 12:00 pm PST (13 Nov, 1:30 am IST)**. Submit on the morning of 12 Nov IST.

## Checklist

| Requirement | Status | How |
| --- | --- | --- |
| Public repo with license visible | Repo is **private** for now | `gh repo edit Cyanexani/paydrop --visibility public --accept-visibility-change-consequences`; MIT `LICENSE` is in the root |
| Working demo (hosted URL or repo with run steps) | Run steps ready ([SETUP.md](SETUP.md)); hosting not yet | Deploy with [DEPLOYMENT.md](DEPLOYMENT.md) |
| Text description | Draft below | Paste into Devpost |
| AI tools and how each is used | Below | Paste into Devpost |
| YouTube video under 3 minutes | Not recorded | Script in [DEMO.md](DEMO.md) |
| Sponsor tools named | Below | Paste into Devpost |
| New work during the hackathon | All of it: the repo was created on 9 Nov 2026 | Say so in the description |

## Description (draft)

**Paydrop: pay for outcomes, not promises.**

Freelancers in India get paid late, and clients pay for work that doesn't match what they asked for. Paydrop puts a verifiable promise between them.

1. **Scope.** The client describes the project in plain language. Claude scopes it into milestones with checkable acceptance criteria. It asks questions if the brief is too vague, and refuses work that breaks PayPal's rules.
2. **Price.** A deterministic pricing engine prices each milestone with a visible receipt. The same work earns the same base pay; a premium comes only from verified track record.
3. **Hold.** The client funds each milestone through PayPal. The money is held (Orders v2 `AUTHORIZE`), not taken.
4. **Check.** When the freelancer delivers, an AI checker opens the site in a recorded Kernel cloud browser and tests every criterion. Deterministic probes and Claude cross-check each other. A page that tries to talk to the checker blocks every automatic pass. On our 24-site eval there were 0 wrongful passes.
5. **Release.** Payment is released only when the client approves, or 72 hours after every check passed. AI can never release money by itself. PayPal captures the hold, and Payouts splits the money among collaborators.
6. **Scope creep.** "Can you also add a blog?", sent in the app or on WhatsApp through Zapier, is searched against the contract in Elastic and becomes a priced change order with a PayPal payment link.
7. **AI agents as workers.** An AI agent (BuildBot) can work a milestone too. It's paid only for verified output, to its human owner.

Everything is tracked in an AG Grid ledger (with "ask the grid" through AG Grid's AI Toolkit) and a Bryntum Gantt timeline. It deploys to Render from one blueprint.

**Built during the hackathon:** the whole codebase (repo created 9 Nov 2026).

## AI tools used

- **Claude Opus 5.5 (Anthropic API):**
  - scoping briefs (structured output + Zod)
  - re-estimating counter-offers
  - scope-creep classification and change-order drafting
  - the checker's browser agent (tool use)
  - BuildBot's site builds
  - natural-language grid filtering
  - Refusal fallbacks are on.
- **Claude Code:** wrote and tested the codebase.

## Sponsor tools used

PayPal (Orders, Payments, Payouts, Webhooks) · AG Grid Enterprise (incl. AI Toolkit) · Kernel · Elastic · Render · Bryntum Gantt · Postman · Zapier · APIMatic (OpenAPI spec) · Channel3. Details: [SPONSORS.md](SPONSORS.md).

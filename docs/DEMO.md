# Demo video script (under 3 minutes)

Set up first: deploy (or run locally), add PayPal sandbox and Anthropic keys, and run `npm run seed:demo` for a contract at every stage. Open the site a minute early so it's warm. Record from a run that worked.

| Time | Show | Persona and clicks |
| --- | --- | --- |
| 0:00–0:20 | **The problem:** freelancers get paid late and squeezed by "one small change". | Landing page. |
| 0:20–1:00 | **Brief → milestones → fair price → money held.** | **Jaya** → New project → **Scope and price it**. Show the milestones and checkable criteria, the ₹15,750 same-base price, Meera ₹20,475 vs Ravi ₹17,325, and open a price receipt. Enter the delivery URL → **Offer to Ravi**. Switch to **Ravi** → **Accept contract**. Switch to **Jaya** → PayPal button → approve in the sandbox → status "Funded · held in PayPal". |
| 1:00–1:40 | **Delivery → AI checks it live → paid and split.** | **Ravi** → submit the real Jaya Dance & Fitness URL → the checker runs in Kernel (show the criteria ticking and **Watch replay**). **Jaya** → **Approve and release** → status Released → Payout split to Ravi and Sana. |
| 1:40–2:10 | **Scope creep.** | **Jaya** → Messages: "Can you also add a blog?" → flagged out of scope → change order with price → **Accept and add milestone** → **Get a payment link**. (Or send it on WhatsApp through Zapier.) Drag a milestone on the Gantt to show a schedule change request. |
| 2:10–2:30 | **An AI agent is paid only for verified work.** | **Ravi** on the BuildBot contract → **Run BuildBot** → it builds, hosts and submits → checker verifies → **Jaya** approves → payout goes to Ravi as the owner. |
| 2:30–2:50 | **Trust.** | Checker eval (0 wrongful passes, injection blocked) from `docs/CHECKER_EVAL.md`; **Ledger** → "held payments over ₹5000" in Ask the grid; Fairness view (same base rate in every tier); Dispute pack. |
| 2:50–3:00 | **"Pay for outcomes, not promises."** | Landing page. |

## Tips

- **Personas:** switch with the selector in the top-right corner.
- **Backup:** if PayPal sandbox is slow, use the seeded contract (milestone 2 is already verified and ready to approve).
- **Upload:** the video must be public on YouTube, under 3 minutes, with no unlicensed music.

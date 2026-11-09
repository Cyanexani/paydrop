# Deployment (Render)

`render.yaml` is a Render Blueprint. It creates four things:

| Resource | Type | Runs |
| --- | --- | --- |
| `milestonepay-web` | Web service | `npm ci && npm run build` → `npm start`; health check `/api/health` |
| `milestonepay-worker` | Background worker | `npx tsx scripts/run-jobs.ts --loop` (every job, each minute) |
| `milestonepay-reconcile` | Cron job, `0 20 * * *` (01:30 IST) | `npx tsx scripts/run-jobs.ts reconcile payouts` |
| `milestonepay-db` | Postgres (free plan) | Migrations run automatically when the app or worker starts |

Services use Render's default instance size; change `plan` per service if you want something else.

## Steps

1. **Make the repo reachable by Render.** Connect your GitHub account in Render. For the hackathon the repo must also be public:
   ```bash
   gh repo edit Cyanexani/milestonepay --visibility public --accept-visibility-change-consequences
   ```
2. **Create the Blueprint.** Render Dashboard → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
3. **Fill the secrets it prompts for** (`sync: false`). Values Render generates itself: `ZAPIER_SECRET`, `CRON_SECRET`, `ADMIN_SECRET`.

   | Variable | Needed for |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | Real AI (else demo AI) |
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Funding, release, payouts |
   | `PAYPAL_WEBHOOK_ID` | Webhook verification (after step 5) |
   | `DEMO_PAYOUT_EMAIL` | A sandbox personal account to receive payouts |
   | `KERNEL_API_KEY` | The checker's browser (Render has none) |
   | `ELASTIC_URL`, `ELASTIC_API_KEY` | Elastic search for scope creep |
   | `ZAPIER_HOOK_URL` | Outbound events to Slack/Sheets |
   | `CHANNEL3_API_KEY` | Materials search |
   | `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` | Removes the AG Grid watermark |

4. **Deploy** and wait for the web service to pass its health check. Render sets `RENDER_EXTERNAL_URL`, which PayPal payment links use for their return URL.
5. **PayPal webhook:** in your PayPal app add `https://<web>.onrender.com/api/webhooks/paypal`, subscribe to `PAYMENT.CAPTURE.*`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.PAYOUTS-ITEM.*`, copy the webhook ID into `PAYPAL_WEBHOOK_ID`, and redeploy.
6. **Demo data (optional):** open the web service's **Shell** in Render and run `npx tsx scripts/seed-demo.ts`.
7. **Smoke test:** `npx newman run postman/milestonepay.postman_collection.json --env-var baseUrl=https://<web>.onrender.com`.

## Before recording the demo

- Open the site a minute early so the instance is warm.
- If anything is off, `seed-demo` rebuilds a contract at every stage in one command.
- Record from a run that worked; keep the hosted URL for the submission.

## Running jobs without the worker

Any scheduler can call the jobs over HTTP:

```bash
curl -X POST https://<web>.onrender.com/api/cron/all -H "Authorization: Bearer $CRON_SECRET"
```

Job names: `auto-release`, `holds`, `stale-funding`, `offers`, `silent`, `payouts`, `checks`, `reconcile`, or `all`.

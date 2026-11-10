# Deployment (Render)

`render.yaml` is a Render Blueprint on the **free plan**. It creates two things:

| Resource | Type | Runs |
| --- | --- | --- |
| `paydrop-web` | Web service (free) | `npm ci && npm run build` → `npm start`; health check `/api/health` |
| `paydrop-db` | Postgres (free) | Migrations run automatically when the app starts |

The free plan has no background workers and puts the site to sleep after about 15 idle minutes, so the background jobs run from GitHub Actions instead (`.github/workflows/jobs.yml`): every 14 minutes it calls `/api/cron/all`, which runs every job and keeps the site awake. Free Postgres databases expire after 30 days.

## Steps

1. **Make the repo reachable by Render.** Connect your GitHub account in Render. For the hackathon the repo must also be public:
   ```bash
   gh repo edit Cyanexani/paydrop --visibility public --accept-visibility-change-consequences
   ```
2. **Create the Blueprint.** Render Dashboard → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
3. **Fill the secrets it prompts for** (`sync: false`). Any you don't have yet can be left blank and added later under the service's **Environment** tab. Values Render generates itself: `ZAPIER_SECRET`, `CRON_SECRET`, `ADMIN_SECRET`.

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
6. **Background jobs:** in GitHub, open the repo's **Settings → Secrets and variables → Actions** and add two repository secrets: `PAYDROP_URL` (the site's address) and `CRON_SECRET` (copy it from the web service's Environment tab). Then run **Actions → Background jobs → Run workflow** once to check it answers HTTP 200. Scheduled runs only start once the workflow is on the default branch.
7. **Demo data (optional):** there is no shell on the free plan, so load it over HTTP with the `ADMIN_SECRET` from the Environment tab:
   ```bash
   curl -X POST https://<web>.onrender.com/api/admin/seed-demo -H "x-admin-secret: $ADMIN_SECRET"
   ```
   It answers with links to three contracts at different stages. Each call adds a fresh set.
8. **Smoke test:** `npx newman run postman/paydrop.postman_collection.json --env-var baseUrl=https://<web>.onrender.com`.

## Before recording the demo

- Open the site a minute early so the instance is warm.
- If anything is off, `seed-demo` rebuilds a contract at every stage in one command.
- Record from a run that worked; keep the hosted URL for the submission.

## Running jobs by hand

The scheduled workflow calls this; any other scheduler can too:

```bash
curl -X POST https://<web>.onrender.com/api/cron/all -H "Authorization: Bearer $CRON_SECRET"
```

Job names: `auto-release`, `holds`, `stale-funding`, `offers`, `silent`, `payouts`, `checks`, `reconcile`, or `all`.

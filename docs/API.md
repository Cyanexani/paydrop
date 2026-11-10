# API

- **Spec:** [`openapi.yaml`](../openapi.yaml) (OpenAPI 3.1). Import it into APIMatic for an SDK, or into Postman.
- **Tests:** [`postman/milestonepay.postman_collection.json`](../postman/milestonepay.postman_collection.json): the full flow plus guard rails, run by newman in CI.

## Conventions

- **Auth:** accounts with email and password (`/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/forgot`, `/api/auth/reset`) set an httpOnly `mp_session` cookie: a random token whose SHA-256 is stored with an expiry. **Demo:** `POST /api/auth/demo {"userId":"client-jaya"}` (or the older `POST /api/session`) signs in as a demo persona without a password: `client-jaya`, `client-demo`, `fl-meera`, `fl-ravi`, `fl-asha`. Turn demo sign-in off with `DEMO_LOGIN=off`.
- **Money:** integer minor units (paise for INR, cents for USD). `priceMinor: 836000` is ₹8,360.
- **Errors:** `{"error":{"code":"funding_out_of_order","message":"…"}}` with 400/401/403/404/409/502/503.
- **Idempotency:** milestone actions are safe to retry; a repeated request is a no-op.

## Walkthrough with curl

```bash
B=http://localhost:3000
curl -c jar -H 'Content-Type: application/json' -d '{"userId":"client-jaya"}' $B/api/session

# Scope and price a brief
curl -b jar -H 'Content-Type: application/json' \
  -d '{"brief":"Website for my dance studio with booking and a gallery","deadlineDays":14}' $B/api/quotes

# Offer a contract to a freelancer from the quote
curl -b jar -H 'Content-Type: application/json' \
  -d '{"quoteId":"q_…","freelancerId":"fl-ravi","deliveryUrl":"https://jayadance.example"}' $B/api/contracts

# As the freelancer: accept
curl -c jar2 -H 'Content-Type: application/json' -d '{"userId":"fl-ravi"}' $B/api/session
curl -b jar2 -X POST $B/api/contracts/ct_…/accept

# As the client: fund milestone 1 (returns a PayPal order id for the buttons)
curl -b jar -X POST $B/api/milestones/ms_…/order
```

## Endpoints

| Method and path | Who | Does |
| --- | --- | --- |
| `GET/POST/DELETE /api/session` | anyone | Personas, sign in, sign out |
| `POST /api/quotes` | client | AI scope + pricing per matched freelancer |
| `GET/POST /api/contracts` | parties / client | List, or offer a contract (price locked) |
| `GET /api/contracts/{id}` | parties | Full contract view |
| `POST /api/contracts/{id}/accept`, `/decline`, `/collaborators` | freelancer | Accept, decline, set payout split |
| `GET /api/contracts/{id}/dispute-pack` | parties | Evidence timeline |
| `POST /api/contracts/{id}/messages` | parties | Message; client messages get a scope check |
| `POST /api/contracts/{id}/change-requests` | parties | Change order (`kind: work`) or schedule change (`kind: schedule`) |
| `POST /api/change-requests/{id}/{accept\|decline\|in_scope}` | parties | Decide a change request |
| `POST /api/milestones/{id}/{action}` | depends | `order`, `pay-link`, `authorize`, `abandon`, `accept`, `submit`, `challenge`, `approve`, `counter`, `rate`, `dispute`, `agent-run`, `materials-search`, `materials` |
| `POST /api/negotiations/{id}/{accept\|reject}` | client | Answer a counter-offer |
| `GET /api/ledger`, `GET /api/fairness` | signed in | AG Grid data |
| `POST /api/grid-assist` | signed in | Chat → AG Grid state |
| `GET /api/check-runs/{id}/replay` | parties | Local replay video |
| `POST /api/webhooks/paypal` | PayPal | Verified, deduplicated webhooks |
| `POST /api/integrations/zapier/messages` | Zapier (`x-zapier-secret`) | WhatsApp/email → scope check |
| `POST /api/cron/{job}` | scheduler (`Bearer CRON_SECRET`) | Background jobs |
| `POST /api/admin/milestones/{id}/resolve` | admin (`x-admin-secret`) | Resolve a dispute |
| `GET /api/health` | anyone | App and database health |

## Account, profiles and presence

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/api/account` | signed in | The account as the settings page shows it |
| POST | `/api/account` | signed in | Update name; freelancers also headline, skills, PayPal email |
| POST | `/api/account/password` | signed in | Change password (`currentPassword`, `newPassword`); other devices are signed out |
| GET | `/api/account/devices` | signed in | Signed-in devices, this one first |
| POST | `/api/account/devices` | signed in | Sign out one other device (`sessionId`) or, without it, all others |
| POST | `/api/account/verify-email` | signed in | Email a one-time verification link (24 hours) |
| POST | `/api/auth/verify-email` | anyone with the link | Use the link's `token`; marks the email verified |
| GET | `/api/profiles/{id}` | public | A freelancer's or agent's profile: badges, verified stats, recent verified work, presence |

Demo accounts are read-only: profile, password and verification calls return `403 demo_read_only`.
Verification links go out as an `auth.email_verification_requested` event on `ZAPIER_HOOK_URL` (a Zap emails them); without the hook they are printed to the server log in development and not sent in production.
A user is "online" for five minutes after their last request; after that the profile shows "Active … ago".

## Safety rules on submissions and scopes

- `POST /api/milestones/{id}/submit` returns `400 blocked_url` when the link points to a private, loopback, link-local or cloud-metadata address. In production the checker's browser also refuses every request to such an address, including redirects and sub-resources. `CHECKER_ALLOW_PRIVATE=1` turns this off; it is off by default outside production so local fixtures work.
- Every scoped milestone carries `briefQuote`, the words in the client's brief that ask for it. If the AI returns a quote that is not in the brief, the scope is retried once and then becomes a manual quote, so invented work is never priced.

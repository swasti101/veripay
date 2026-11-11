# Demo script & sponsor-key checklist

## 1. Live showcase (7–10 minutes)

The main demo project is **Northwind Outfitters — E-Commerce Storefront**: a $8,500 three-milestone website build. Advance + Milestone 1 are pre-funded and paid, so you walk the judges from a live, half-complete project through to the moneyed outcome.

### 0 · Open at the landing page (~30 s)
- Tab shows **PayPal / Kernel / AI** status pills at top-right. Open *Integrations* once to show the honest matrix. When no keys are set, everything labels itself SIMULATED / DEMO ADAPTER / HEURISTIC — no fake live calls.
- Click **Demo accounts** → **Alex Rivera (client)**. (For SaaS onboarding, click **Create account** instead and show the email-verification dev mailbox.)

### 1 · "This is a real SaaS" (~1 min)
- Dashboard → open *Integrations*: show "Platform fee: 5% of each release" baked into every agreement (configurable per project; capped at 20%).
- Mention: real signup with scrypt passwords, email verification, rate-limiting, cross-tenant isolation (shown automatically on *Audit trail*). Demo accounts are gated behind a button and can be disabled with `DISABLE_DEMO_LOGIN=true`.

### 2 · SOW baseline (~1 min)
- Open **Northwind Outfitters** → *SOW & Agreement*. Point out:
  - 6 requirements extracted with IDs, acceptance criteria, evidence type, and per-requirement amounts — "AI extracts what the SOW says; vague words like *fast* and *relevant* are flagged, nothing invented."
  - **Agreement v1 locked** by both parties. Any edit clears both approvals; new scope needs a new version.

### 3 · Funding (~45 s)
- *Funding* → three clearly separated options (advance, partial, full). Northwind uses PARTIAL. The authorization tile notes PayPal's 29-day cap. "This is not escrow — funds sit on the payer's PayPal account via authorization."

### 4 · Delivery & Kernel + QA (~1.5 min)
- *Switch user* → **Sam Okafor (freelancer)**. Go to *Delivery & QA*.
- Submit the pre-filled URL (`/demo-store/index.html`) with **Attach sample test report** checked, inspection authorized. Click **Submit**.
- QA runs for ~3 s and renders: 1 PASS (REQ-05 Cart & checkout), 1 **NEEDS_CLARIFICATION** (REQ-04, because the SOW says "fast" and "relevant" with no threshold). Walk through the Kernel pages table, screenshots (if `KERNEL_API_KEY` is set), guardrail notes and the QA Mediator summary.

### 5 · Client satisfaction (~45 s)
- Switch to **Alex** → *Client feedback* → **Partially satisfied** → **Fill sample client concerns** → Submit.
- The Client Expectation Agent classifies: one **OUT_OF_SCOPE_REQUEST** (typo-tolerant search) and one **SUBJECTIVE_PREFERENCE** (darker cart colour). "These signal but do not reduce the freelancer's earned pay."
- A scope-change request is auto-filed for the out-of-scope item (*Scope & disputes*).

### 6 · Expert panel — the differentiator (~2 min)
- *Expert review* → **Request expert review for M2**. REQ-04 is picked up automatically because AI returned NEEDS_CLARIFICATION.
- Panel: Mira Kovac, Daniel Osei, Priya Natarajan. Jordan Blake is listed as **excluded** (declared relationship with the freelancer).
- Fee disclosure: $25 × 3 = $75, paid by the client, independent of the vote, never deducted from the freelancer. Click **Acknowledge fee** → **Pay expert fee** → approve.
- Switch to **Sam**, acknowledge fee → **Generate votes for SIMULATED experts** (clearly labelled). Three sealed votes reveal: 2 COMPLIANT, 1 PARTIALLY_COMPLIANT (minority preserved with full reasoning).
- For real experts: sign in as **Mira Kovac** to show the expert portal — conflict declaration required, packet identical for every reviewer, votes sealed until close.

### 7 · Payment Allocation Engine + release (~1 min)
- Still as Sam → *Payments* → **Recalculate recommendation** → **FULL_PAYMENT $3,000**. The "how this was calculated" box cites each input: agreement v1 amounts, expert panel result, client feedback classifications, fairness rule for preferences.
- **Acknowledge recommendation**. Switch to **Alex** → **Approve release** → **Release $3,000 via PayPal**.
- Transaction ledger shows: capture $3,000 → freelancer payout $2,850 (net) + platform fee $150 retained. That's the SaaS revenue, visible and honest.

### 8 · Contrast scenarios (~30 s)
- Open **Lumen Analytics**: 2 PASS / 1 FAIL (PDF export), experts 2–1 NOT_COMPLIANT, engine recommends **$2,500 partial / $1,500 held pending revision**.
- Open **Harbor Dental**: clear compliance → full payment.

### 9 · Transparency (~30 s)
- *Audit trail* → every decision traceable to its evidence, including Kernel actions, AI sources, expert votes, PayPal IDs and both parties' approvals.
- *Timeline* (Bryntum) → milestones, requirements and payment checkpoints on one Gantt.

### Showcase pitch (1 sentence)
> VeriPay turns "the AI said you should get $X" into *"your agreement said $A, the evidence shows deliverable B was met, the expert panel confirmed by a 2–1 vote, so $Y is released now and $Z stays held — and both of you approved before the money moved."*

---

## 2. Sponsor-key / dependency checklist

Everything the app does already works in a **labelled fallback** mode without any keys. Each key replaces one labelled fallback with the real thing.

| Sponsor | Env vars (`.env`) | What it enables | How to obtain |
|---|---|---|---|
| **PayPal** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_WEBHOOK_ID` | Real Orders (authorize/capture/partial-capture/void), Payouts for freelancer disbursement & expert fees, webhook verification | developer.paypal.com → **Apps & Credentials** → Sandbox app · enable **Payouts** on the sandbox business account · create a webhook at `/webhooks/paypal` listening for `PAYMENT.CAPTURE.*`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.PAYOUTS-ITEM.*`, `CUSTOMER.DISPUTE.CREATED` and paste the webhook ID |
| **Kernel** | `KERNEL_API_KEY` (optional: `KERNEL_BASE_URL`) | Live headful Chromium inspection of submitted URLs — screenshots, responsive viewports, console errors, search probes. **Requires a public URL** for the deliverable (`PUBLIC_BASE_URL` on Render); Kernel cannot reach localhost | onkernel.com → dashboard → API key |
| **AI / vision** (one of) | `ANTHROPIC_API_KEY` *(recommended: `ANTHROPIC_MODEL=claude-sonnet-5-5`)* or `GEMINI_API_KEY` | SOW extraction, vision analysis of screenshots, text analysis of reports, feedback classification, PM chat, expert vote simulator reasoning | console.anthropic.com or aistudio.google.com |
| **APIMatic** | `APIMATIC_API_KEY` (plugin needs no key) | Three uses — see §2b: (1) PayPal calls already run through `@paypal/paypal-server-sdk`, the APIMatic-generated official SDK; (2) `npm run sdk:validate` / `sdk:generate` on our own OpenAPI spec; (3) the PayPal **Context Plugin** for AI coding agents | apimatic.io → account → API key · plugin: `npx context-plugins install paypal` |
| **Bryntum Gantt** | — | Trial package already bundled (watermark). For a licensed build, change the alias in `client/package.json`: `"@bryntum/gantt": "npm:@bryntum/gantt@<version>"` | bryntum.com license |
| **AG Grid / AG Charts** | — | Community editions — no key needed. 10 grids + 5 charts (see §2c) | — |
| **SMTP (email)** | `SMTP_URL` (e.g. `smtp://user:pass@smtp.sendgrid.net:587`), `SMTP_FROM` | Real verification + password-reset emails. Without it the dev mailbox UI shows tokens so flows can be completed. | Any SMTP provider (SendGrid, SES, Postmark, Mailgun) |
| **Render** | set everything above in Render dashboard; also `ALLOW_PUBLIC_DEMO=true` to permit the 0.0.0.0 bind, `PUBLIC_BASE_URL`, `DATA_DIR=/var/data` | Public deployment. `render.yaml` blueprint is at the repo root. | render.com → Blueprints → *New from repo* |

---

## 2b. APIMatic: how it is actually used here

APIMatic shows up in this project in three distinct ways. Only the third needs a key.

### (1) The PayPal SDK we call is APIMatic-generated
`server/src/services/paypal.ts` imports `@paypal/paypal-server-sdk` v2.5.0 — PayPal's **official**
TypeScript Server SDK, which PayPal publishes from APIMatic. Its own `package.json` depends on
`@apimatic/core`, `@apimatic/schema`, `@apimatic/axios-client-adapter`, `@apimatic/oauth-adapters`
and `@apimatic/authentication-adapters`. So every Orders/Payments call in VeriPay runs through
APIMatic-generated code and its OAuth + schema-validation layer:

```ts
import { Client, Environment, CheckoutPaymentIntent, OrdersController, PaymentsController }
  from '@paypal/paypal-server-sdk';

const client = new Client({
  clientCredentialsAuthCredentials: { oAuthClientId, oAuthClientSecret }, // APIMatic OAuth adapter
  environment: Environment.Sandbox,
});
new OrdersController(client).createOrder({ ... });
new PaymentsController(client).captureAuthorizedPayment({ ... });
```

What the SDK covers vs. what we hand-wrote against PayPal REST (because the SDK has no controller
for them): **Payouts** (`POST /v1/payments/payouts`) and **webhook signature verification**
(`POST /v1/notifications/verify-webhook-signature`).

### (2) VeriPay's own API is an APIMatic input
`apimatic/src/spec/openapi.yaml` describes VeriPay's API (projects, SOW analysis, funding, QA,
expert votes, allocation, release). With `APIMATIC_API_KEY` set:

```bash
npm run sdk:validate     # apimatic api validate  --file=apimatic/src/spec/openapi.yaml
npm run sdk:generate     # apimatic sdk generate  -i apimatic -l typescript -d apimatic/sdk/typescript
```

The spec is also served live at `GET /openapi.yaml`.

### (3) Context Plugins — teaching an AI coding agent the API

A **Context Plugin** is APIMatic's packaging of an API's real contract for an AI coding assistant.
Instead of the model recalling PayPal's API from training data (where it invents endpoints, stale
field names and wrong auth), the plugin installs the grounded surface — operations, parameter
schemas, auth flow and SDK usage — into the assistant, generated from the same source of truth as
the SDK and docs, so it stays aligned as the API changes.

The marketplace carries **43** plugins (paypal, square, stripe-adjacent, plaid, twilio, slack…).
Install and inspect:

```bash
npx context-plugins list                 # all 43
npx context-plugins list --long          # with descriptions
npx context-plugins install paypal       # prompts for which assistants to target
```

For Claude Code the installer runs `claude plugin install paypal@<marketplace>`. Mind the scope:

| Scope | Where it lands | Who it affects |
|---|---|---|
| `user` (installer default) | `~/.claude/` | **every** Claude Code session on the machine, in every project |
| `project` | `.claude/settings.json` in this repo | only this repo; committed, so teammates get it |
| `local` | this repo, not committed | only you, only this repo |

Repo-scoped install (does not touch your global config):

```bash
claude plugin install paypal --marketplace apimatic/context-plugins-installer --scope project
# then: /reload-plugins  (or start a new session)
# remove with: claude plugin uninstall paypal
```

**Sponsor offer:** teams that used the Context Plugin get 1 month of APIMatic Basic free; winning
teams get 6 months of Business (Context Plugins + SDKs + a docs portal for their own API). Claim
via APIMatic's form. If you claim it, say plainly which of the three uses above applied — (1) and
(2) are already true of this codebase; (3) is only true once the plugin is installed and used.

---

## 2c. AG Grid & AG Charts — where they are used

**AG Grid (community) — 10 grids.** One shared wrapper, `client/src/components/Grid.tsx`, registers
`AllCommunityModule`, applies a `themeQuartz` theme and standard cell renderers (status badge,
currency, date), so every table sorts, filters, resizes and paginates identically.

| Screen | Grids |
|---|---|
| Dashboard | Projects · Milestones & deadlines · Payment/earnings history |
| Analytics | Money over time · QA outcomes by category · Every expert vote (click-through to the panel) · Release types |
| Workspace → SOW & Agreement | Requirements baseline (IDs, acceptance criteria, evidence type, amount, clarification, status) |
| Workspace → Payments | PayPal transaction ledger (IDs, mode, retry/refresh actions per row) |
| Workspace → Audit trail | Append-only decision log with evidence refs, `autoHeight` wrapped detail |

**AG Charts (community) — 5 charts.**

| Screen | Chart | Type |
|---|---|---|
| Dashboard | Money by project (paid / under review / committed) | stacked horizontal bar |
| Dashboard | Milestones by funding status | horizontal bar, labelled |
| Analytics | Funding & earnings over time (cumulative) | multi-series line + markers |
| Analytics | QA outcomes by requirement category | stacked horizontal bar, per-segment counts |
| Analytics | Release-type distribution | donut with inner total |

Expert-panel outcomes are a **custom CSS grid**, not AG Charts: the community edition has no
heatmap series (enterprise only), so claiming one would be false attribution. It is labelled as
such in the UI.

Palette: `client/src/palette.ts` holds a validated categorical set (CVD-safe, worst adjacent
ΔE 9.1; normal-vision ΔE 19.6) plus a reserved status palette and a 13-step sequential blue ramp.
Three slots fall under 3:1 contrast on the light surface, so every chart using them ships direct
labels and a table view (the *Show data tables* toggle on Analytics) rather than relying on colour.

---

### SaaS-only env vars
| Var | Default | What it does |
|---|---|---|
| `PLATFORM_FEE_PERCENT` | `5` | Default fee % on each new agreement (0–20). Per-project value editable in *SOW & Agreement* → *Expert review terms*. |
| `DISABLE_DEMO_LOGIN` | unset | Set to `true` on production to hide and forbid the demo-account picker. |
| `NODE_ENV=production` | — | Enables HSTS and `Secure` cookie flag. |
| `PUBLIC_BASE_URL` | — | Used in verification/reset emails and for the deliverable URL Kernel is given. |

---

## 3. What's still needed to be a true production SaaS

The codebase now has the technical bones of a SaaS (auth, isolation, rate limits, platform fee, deploy config). What still needs product, legal and operations work before accepting real customers:

1. **Billing beyond the platform fee** — optional seat/subscription pricing (PayPal Subscriptions or Stripe Billing).
2. **Payee onboarding via PayPal Commerce Platform** — delegated onboarding so freelancers consent with a flow that returns a `merchantId`, instead of just pasting a PayPal email. Requires PayPal partner approval.
3. **Database** — the JSON store is fine up to ~10k projects. Migrate to Postgres (schema already maps 1:1) before meaningful scale; use the current `DB` type as the ORM shape.
4. **Email deliverability** — SPF/DKIM/DMARC on your sending domain.
5. **ToS, privacy policy, DPA** — platforms that handle money and PII need these before launch.
6. **Compliance** — SOC 2 (or ISO 27001) if customers will ask; PCI scope is minimal because PayPal holds the card data.
7. **Observability** — structured logging to a sink (pino + Logtail / Datadog), error tracking (Sentry), uptime (Render/Better Stack).
8. **Backups & DR** — Render disk snapshots or RDS automated backups; document RPO/RTO.
9. **Support surface** — in-app help, status page, a real `support@`.
10. **Legal review of the "advisory expert panel"** — if you want the panel's decision to be binding (true expert determination), the agreement needs explicit dispute-resolution wording per jurisdiction. Current build keeps it advisory.

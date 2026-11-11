# Demo script & sponsor-key checklist

## 1. Live showcase (8–10 minutes)

Seeded project: **Northwind Outfitters — E-Commerce Storefront**, $8,500 over three milestones.
The advance and Milestone 1 are already paid, M2 (Search & Checkout) is funded and in progress —
so you start at the moment the freelancer submits, which is where the product earns its keep.

Use the **View as · Client / Freelancer / Expert** switch at the bottom of the left rail to change
sides without signing out. You stay on the same page, so the audience sees both sides of one moment.

### 0 · Landing (~30 s)
Open `http://127.0.0.1:4000/`. Point at the hero specimen: one real payment decision with its reasoning
— computer agent PASS, vision PASS, text NEEDS_CLARIFICATION, panel 2–1, **$3,000 released**. Scroll to
the three analysers and the domain tiles: each domain names which analysers check that kind of work.
Click **Open the demo** → **Demo** tab → **Sam Okafor** (freelancer).

### 1 · The freelancer submits (~1 min)
Projects → Northwind → **Submit & verify** in the rail. The URL of the demo storefront is pre-filled.
Leave *Let the computer agent use this site* ticked and press **Submit for verification**.
The stage track at the top moves Funded → Submitted.

### 2 · Three analysers at work (~3 min — the core of the demo)
The report opens in three layers:
- **Verdict** — one line, with counts per status and which engine produced each part.
- **Requirement by requirement** — open REQ-04 and REQ-05. Each shows what the agreement asks for, then
  what the computer agent, vision analyser and text analyser each found. REQ-04 carries a purple
  *Fairness rule applied* note: the SOW says "fast" and "relevant" with no threshold, so it cannot be passed.
- **Computer agent** tab — the journey replay. Read it out: it opened the site, resized to a phone,
  followed the catalogue link, **typed "linen" and 12 products became 2**, typed a nonsense term and
  checked the empty state, **chose a filter and 12 became 3**, opened a product and **clicked "Add to cart" —
  the cart went from (0) to (1)**. Click any thumbnail to enlarge the screenshot taken at that step.
- **Vision analyser** tab — the captured screenshots. With an AI key it reads them against the criteria.
- **Text analyser** tab — notes, documents and test reports read against the SOW.

Say the honest bit out loud: the badge says *Local browser* — a real Chromium running the exact
script Kernel would run. With `KERNEL_API_KEY` set it runs in Kernel's cloud browser instead.

### 3 · The agent talks to the freelancer (~30 s)
Rail → **Messages**. The **Freelancer Delivery Agent** has posted, privately to the freelancer, what each
non-passing requirement needs next. Agents have square monograms; people have round ones; private
messages say who they are for.

### 4 · In scope or out of scope? (~1 min)
**View as · Client.** In Messages, choose *Ask the AI project manager* and click the suggestion
**"Can you also add typo-tolerant search?"** → Send.
The **Client Expectation Agent** answers that it is outside the agreement, **quoting the SOW's exclusion**,
and states it will not count against delivered work. It then opens a change request automatically.
Rail → **Scope changes**: the request sits *Awaiting freelancer*. View as freelancer → quote a price and
days → view as client → approve → it becomes agreement v2 with its own milestone.
Contrast: ask *"When is the next milestone due?"* — that is answered from the agreement, no change request.

### 5 · Client review → expert panel → decision (~2 min)
As client: **Client review** → *Partially satisfied* → *Fill sample client concerns* → Submit.
Feedback is classified: typo-tolerance → out of scope, darker cart → subjective preference. Neither reduces pay.
**Expert panel** → request review (REQ-04 is picked up because it needed clarification) → acknowledge the fee
→ pay it. View as freelancer → acknowledge → *Generate votes for simulated experts*. Votes appear 2–1 compliant
with the dissent kept.
**Payment decision** → recalculate → **full payment $3,000**, with the calculation shown line by line →
acknowledge as freelancer → approve and release as client. Ledger: capture $3,000, payout $2,850,
platform fee $150.

### 6 · Contrast and transparency (~1 min)
Lumen Analytics (failed PDF export → $2,500 paid, $1,500 held), Harbor Dental (clean full payment),
**Delivery board** (an unpaid tranche visibly blocks M3), **Audit trail**.

### One-line pitch
> The work is checked by an agent that actually uses it, the money follows what was agreed, and anything
> genuinely ambiguous goes to people — not to a confidence score.

---

## 1b. How to test the AI and payment parts before you present

| What | How | Expected |
|---|---|---|
| Computer agent (no keys) | Submit the demo storefront URL as Sam | 12 steps, ~10 screenshots, "Cart (0) → Cart (1)", mode *Local browser* |
| Computer agent (Kernel) | Add `KERNEL_API_KEY`, deploy, submit the **public** URL | Same journey, mode *Kernel cloud browser*, a session id |
| Vision + text with a model | Add `GROQ_API_KEY` (or Anthropic/Gemini), restart, resubmit | Vision tab shows per-requirement observations; header names the model |
| Out-of-scope detection | Ask the PM "Can you also add typo-tolerant search?" as client | Exclusion quoted, change request opened |
| In-scope question | Ask "Does the agreement cover an admin login?" | Answered from REQ-06, no change request |
| Payments, simulated | Start with `PAYPAL_CLIENT_ID= PAYPAL_CLIENT_SECRET= npm start` | Everything completes; every row labelled *Simulated* |
| Payments, real sandbox | Default `.env`; fund M3 as client → PayPal button → log in as a sandbox **personal** account | Real order and authorization ids; status changes only after the server re-reads the order |
| Seeded money in sandbox mode | Release M2 with real creds set | Capture, payout and fee all stay *Simulated* — a simulated hold is never sent to PayPal |
| Payout to a real sandbox account | Payments tab → set the freelancer's payout email to a second sandbox account | Payout batch id from PayPal, status *Pending* → *Success* on refresh |
| Error path | Confirm an order without approving it | `PayPal 422 ORDER_NOT_APPROVED … [debug_id …]`, funding state unchanged |

Reset between rehearsals: **Integrations → Reset demo data**, or `npm run seed` with the server stopped.

---

## 2. Sponsor-key / dependency checklist

Everything the app does already works in a **labelled fallback** mode without any keys. Each key replaces one labelled fallback with the real thing.

| Sponsor | Env vars (`.env`) | What it enables | How to obtain |
|---|---|---|---|
| **PayPal** | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_WEBHOOK_ID` | Real Orders (authorize/capture/partial-capture/void), Payouts for freelancer disbursement & expert fees, webhook verification | developer.paypal.com → **Apps & Credentials** → Sandbox app · enable **Payouts** on the sandbox business account · create a webhook at `/webhooks/paypal` listening for `PAYMENT.CAPTURE.*`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.PAYOUTS-ITEM.*`, `CUSTOMER.DISPUTE.CREATED` and paste the webhook ID |
| **Kernel** | `KERNEL_API_KEY` (optional: `KERNEL_BASE_URL`) | Live headful Chromium inspection of submitted URLs — screenshots, responsive viewports, console errors, search probes. **Requires a public URL** for the deliverable (`PUBLIC_BASE_URL` on Render); Kernel cannot reach localhost | onkernel.com → dashboard → API key |
| **AI / vision** (one of) | `ANTHROPIC_API_KEY` *(recommended: `ANTHROPIC_MODEL=claude-sonnet-5-5`)* or `GEMINI_API_KEY` | SOW extraction, vision analysis of screenshots, text analysis of reports, feedback classification, PM chat, expert vote simulator reasoning | console.anthropic.com or aistudio.google.com |
| **APIMatic** | `APIMATIC_API_KEY` (plugin needs no key) | Three uses — see §2b: (1) PayPal calls already run through `@paypal/paypal-server-sdk`, the APIMatic-generated official SDK; (2) `npm run sdk:validate` / `sdk:generate` on our own OpenAPI spec; (3) the PayPal **Context Plugin** for AI coding agents | apimatic.io → account → API key · plugin: `npx context-plugins install paypal` |
| **Bryntum Gantt** | — | Trial package bundled (watermark). Three views: per-project timeline, cross-project **delivery board** where funding tranches are real predecessors of the work, and an **expert-review triage** resource view. See §2d. | bryntum.com license |
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

## 2d. Bryntum — where it is used, and what we deliberately did not build

Three views, all on the trial `@bryntum/gantt`:

**1. Per-project timeline** (`Workspace → Timeline`) — milestones, their requirements, dependencies
and the payment checkpoint at each due date.

**2. Cross-project delivery board** (`/board → Delivery timeline`) — every project you are a party
to on one Gantt. The point of this view: our product rule is *"work cannot begin on an unfunded
milestone"*, so a **funding tranche is modelled as its own task and wired as a predecessor** of the
milestone it pays for. An unpaid tranche therefore *visibly blocks the next phase* — striped red,
with the dependency arrow showing what it is holding up. A PayPal authorization that lapses before
its milestone is due is flagged on the bar, because it cannot be captured after that.

**3. Expert-review triage** (`/board → Expert review triage`) — one parent row per reviewer, one bar
per assigned review spanning invitation → close of voting, showing disputed amount, evidence
readiness (`covered/total` requirements) and votes-in vs quorum. Bars are flagged when a review has
a **deadline but no progress**: invited and never answered, accepted but never voted, or closing
short of quorum — the last being the real failure mode, since it makes the panel INCONCLUSIVE and
leaves the disputed amount frozen.

A Bryntum **Scheduler** is the natural widget for view 3. We installed it, found that combining
Scheduler with Gantt double-loads their shared Grid bundle and breaks the second to initialise, and
that Bryntum's documented fix — the `*-thin` packages — is licence-gated (`npm i @bryntum/grid-thin`
is refused without a licence). So view 3 is the same resource-vs-time view built on the trial Gantt,
and is labelled as such in the UI rather than credited to Scheduler. The Scheduler dependency was
removed rather than left unused.

**Payment-event flags** (`/board`, top) are the agent-driven rescheduler, scoped deliberately: the
AI PM detects unfunded-but-due milestones, lapsing authorizations, overdue phases and quorum risk,
and **flags or proposes** — it never moves a date. Our baseline rule is that neither party can
change agreed terms unilaterally, so an auto-reschedule would violate the product's core guarantee.
The same detections post into the project conversation via `coordinate()` in `services/pm.ts`.

**Not built: a subscription revenue radar.** It was considered and rejected — VeriPay has no
recurring billing. Money is one-off milestone tranches plus a per-release platform fee. Building a
renewals/failed-payment timeline would have meant inventing a subscription business we do not have
in order to fill a Scheduler row.

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

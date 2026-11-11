# VeriPay — SOW-based delivery verification, expert review & milestone payments

Clients and freelancers agree a Statement of Work, fund milestones through PayPal, submit work,
verify it with a Kernel browser agent + AI QA, collect client satisfaction, escalate ambiguous
items to an independent expert panel, and release money according to the **agreed amounts and
the evidence** — never because an AI score or one party says so.

## Run locally

```bash
# Node 20+ (this machine: ~/.local/node/bin)
npm run install:all
cp .env.example .env        # optional — every integration has a labelled fallback
npm run dev                 # API on http://127.0.0.1:4000, UI on http://127.0.0.1:5173
# or production mode:
npm run build && npm start  # UI + API on http://127.0.0.1:4000
npm run seed                # reset to the DEMO dataset
```

## Demo walkthrough (all people, votes and payments are labelled DEMO / SIMULATED)

Sign in from the landing page with a demo account. Use **Switch user** to change sides.

| Step | Who | Where |
|---|---|---|
| 1–5. Create project, upload SOW (*Load sample e-commerce SOW*), review extraction, choose funding plan, invite, both approve | Alex (client) → Jamie/Sam | **+ New project** → *SOW & Agreement*, *Funding*, *Overview* (invite code) |
| 6. Main story continues on **Northwind Outfitters** (advance + M1 already paid, M2 funded) | — | Dashboard |
| 7. Submit the demo storefront URL + sample test report | Sam (freelancer) | *Delivery & QA* → Submit |
| 8. Kernel inspection → vision/text → QA Mediator (REQ-04 = NEEDS_CLARIFICATION, REQ-05 = PASS) | automatic | *Delivery & QA* |
| 9. Partial recommendation: $1,800 eligible (REQ-05), $1,200 under review | either | *Payments* → Generate |
| 10. Client feedback (*Fill sample client concerns*) → OUT_OF_SCOPE + SUBJECTIVE; scope change auto-created | Alex | *Client feedback* |
| 11. Request expert review, both acknowledge fee, client pays fee ($75, separate expense) | both | *Expert review* |
| 12. *Generate votes for SIMULATED experts* → sealed votes revealed: 2 COMPLIANT / 1 PARTIAL (minority kept) | either | *Expert review* |
| 13. Recalculate → FULL $3,000; freelancer acknowledges, client approves, client releases | both | *Payments* |
| 14. Expert sees their review / votes | Mira (expert) | Expert portal |

Comparison projects: **Harbor Dental** (clear compliance → full payment) and **Lumen Analytics**
(PDF export fails → experts 2–1 NOT COMPLIANT → $2,500 partial release, $1,500 held, revision requested).

## Architecture

```
client/  React 19 + Vite + Tailwind · AG Grid/AG Charts (dashboards, ledgers, audit) · Bryntum Gantt (timeline)
server/  Express 5 + TypeScript · JSON document store (server/data) · role-based access per project party
  services/sow.ts         SOW intelligence (AI or rule-based clause parser; never invents terms; flags ambiguity)
  services/kernel.ts      Kernel computer agent (@onkernel/sdk) | DEMO ADAPTER (static HTTP GET only)
  services/qa.ts          Vision + text agents, domain AI agents, QA Mediator, deterministic fairness guardrails,
                          Client Expectation Agent (feedback classification)
  services/experts.ts     Conflict-free panel selection, DEMO vote simulator
  services/allocation.ts  Payment Allocation Engine (decision matrix §9.D) + quorum/majority vote aggregation
  services/paypal.ts      PayPal Server SDK (APIMatic-generated) for Orders/Payments; REST for Payouts & webhook verify
  services/pm.ts          AI Project Manager coordinator (de-duplicated, event-driven messages)
apimatic/src/spec/openapi.yaml   VeriPay API spec for APIMatic SDK generation
render.yaml                      Render blueprint
```

### Key rules enforced in code
- Agreement versions: any edit clears both approvals; only a both-approved version becomes the baseline. Scope changes create a new version.
- QA guardrails: no PASS without functional evidence where required; missing evidence → UNVERIFIED (not FAIL); unclarified vague wording → NEEDS_CLARIFICATION; static (demo adapter) absence is never treated as failure.
- Allocation uses only the agreed milestone / per-requirement amounts or a mutually agreed settlement. Subjective preferences and out-of-scope requests never reduce earned pay. Release requires client approval **and** freelancer acknowledgement; nothing transfers automatically.
- Expert votes are sealed until close; quorum + strict majority, ties/insufficient → INCONCLUSIVE; minority opinions preserved; fixed fee paid per valid review regardless of vote.

## Integrations and their honest status

| Integration | Live when | Fallback (labelled) |
|---|---|---|
| **PayPal** | `PAYPAL_CLIENT_ID/SECRET` (sandbox). Advance = order CAPTURE + Payout; milestone = order AUTHORIZE → partial/final capture on release → Payout; expert fee = CAPTURE → Payout per completed review. Status changes only after server-side verification (`getOrder`). Webhooks trusted only after `verify-webhook-signature` (`PAYPAL_WEBHOOK_ID`). | SIMULATED orders/ids (`SIM-…`) — no money moves |
| **Kernel** | `KERNEL_API_KEY`. `browsers.create` → `playwright.execute` (desktop 1440 & mobile 375 viewports, same-origin link discovery excluding pay/buy/delete, reversible search probe, screenshots) → `deleteByID`. Needs a **public** URL — set `PUBLIC_BASE_URL` / deploy. | DEMO ADAPTER: HTTP GET + static HTML only, no screenshots |
| **AI / vision** | `ANTHROPIC_API_KEY` (Claude, default `claude-sonnet-5-5`) or `GEMINI_API_KEY` | Rule-based heuristics |
| **APIMatic** | Always: PayPal calls use `@paypal/paypal-server-sdk`, the APIMatic-generated official SDK. With `APIMATIC_API_KEY`: `npm run sdk:validate` / `npm run sdk:generate` builds a TypeScript SDK for VeriPay's own API. | — |
| **Bryntum Gantt** | `@bryntum/gantt` aliased to the public trial package (watermark). Swap the alias for a licensed package in production. | — |
| **AG Grid / Charts** | Community editions | — |
| **Render** | `render.yaml` blueprint (not deployed from here) | — |

PayPal limitations respected: an authorization is valid ≤29 days with a 3-day honor period, so long
projects fund milestones as they become due; authorizations are **not escrow** and VeriPay holds no
wallet. Delegated payee onboarding (PayPal Commerce Platform partner referrals) needs PayPal partner
approval; this build onboards payees by PayPal email for Payouts, which must be enabled on the account.

## Security notes
- Server binds `127.0.0.1` by default and **refuses** a non-loopback bind unless `ALLOW_PUBLIC_DEMO=true`.
- Sign-in is a **demo identity selector without passwords**. Before real users, replace `server/src/auth.ts` with a real identity provider (OIDC). Session cookie is HttpOnly/SameSite=Lax; mutating calls require the `X-VeriPay` header (CSRF guard).
- Evidence files are served only to project parties and assigned experts. `/demo-store` is intentionally public (it is the sample deliverable Kernel inspects).

## See also
- [DEMO.md](./DEMO.md) — hackathon showcase script and the full sponsor-key checklist.

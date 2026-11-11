# APIMatic Context Plugin usage

Evidence for the APIMatic sponsor claim. Everything below is checkable in this repo.

## 1. The plugin is installed, project-scoped

[`.claude/settings.json`](./.claude/settings.json) — committed, so the plugin travels with the repo:

```json
{
  "enabledPlugins": {
    "paypal@context-plugins": true
  }
}
```

Installed with:

```bash
claude plugin marketplace add context-plugins/plugin-marketplace
claude plugin install paypal --scope project
```

`paypal@0.4.1` — *"Integrate and consume the APIMatic-generated PayPal Server SDK — bundled skills
for C#/.NET, python, TypeScript"*, author APIMatic (`developer@apimatic.io`),
homepage <https://context.apimatic.io/>.

Project scope was deliberate: the default installer (`npx context-plugins install paypal`) writes to
`~/.claude` and would affect every unrelated project on the machine. Repo scope keeps the evidence
with the code.

## 2. What we used it for

The plugin's TypeScript skills (`typescript-error-handling`, `typescript-configuration-resilience`,
`typescript-client-initialization`, `typescript-authentication`) describe the **generated SDK's**
real contract rather than what a model remembers about PayPal. Two of its points contradicted what
we had already shipped, and both were genuine bugs.

Critically, the skills say to **verify shapes against the installed package** rather than assume:

> *"Which shapes YOUR SDK uses … are facts of the API definition, not of this skill: take them from
> the operation's page … and apply only the guidance that matches."*

We did exactly that. `@paypal/paypal-server-sdk@2.5.0` turns out to use the **older** generator
shape — `ApiError extends Error` with `statusCode` / `headers` / `result` / `body`, **not** the newer
`{Api}Error` family with a closed `err.kind`. So we applied the matching half of the guidance. Had we
followed the skill blindly we'd have written `instanceof` branches that never fire.

### Fix 1 — no timeout, and retries silently off

Read off the installed package (`dist/cjs/defaultConfiguration.js`):

```js
DEFAULT_CONFIGURATION = { timeout: 0, environment: Environment.Sandbox }   // 0 = no timeout at all
DEFAULT_RETRY_CONFIG  = { maxNumberOfRetries: 0, httpMethodsToRetry: ['GET','PUT'], … }
```

A hung PayPal call would have blocked a payment release indefinitely, and nothing retried transient
429/5xx on our read-back verification. [`server/src/services/paypal.ts`](./server/src/services/paypal.ts)
now configures this explicitly — and keeps retries **GET-only**, because the skill's warning that
*"idempotent calls are retried by default and writes are not"* is exactly the trap that would
double-capture or double-pay a freelancer:

```ts
timeout: 30000,
httpClientOptions: {
  retryConfig: {
    maxNumberOfRetries: 3, retryInterval: 1, backoffFactor: 2, maximumRetryWaitTime: 20,
    retryOnTimeout: false,         // a timed-out write must surface, not silently repeat
    httpMethodsToRetry: ['GET'],   // never POST — a retried capture is a second charge
    httpStatusCodesToRetry: [408, 429, 500, 502, 503, 504],
  },
},
```

### Fix 2 — PayPal's `debug_id` was being thrown away

Our old handler stringified whatever it caught. The error-handling skill documents that the decoded
body lands on the error object, which for PayPal carries `name`, `details[].issue/description/field`
and **`debug_id`** — the one value PayPal support asks for. We now translate once into a typed
`PayPalCallError` that keeps `statusCode`, `issue`, `debugId` and a `retryable` verdict, and
distinguishes API errors from transport faults (which sit outside the SDK's error family and must
not be mistaken for them):

```ts
function toPayPalError(e: unknown): PayPalCallError {
  if (e instanceof ApiError) {
    const b = (e.result ?? {}) as PayPalErrorBody;      // decoded PayPal error body
    const detail = b.details?.[0];
    return new PayPalCallError(
      `PayPal ${e.statusCode}${…}`, e.statusCode, detail?.issue ?? b.name ?? null,
      b.debug_id ?? null, [408, 429, 500, 502, 503, 504].includes(e.statusCode),
    );
  }
  …  // transport/abort faults: outside the error family
}
```

`debug_id` and the retryable verdict are now written into the transaction ledger, so an operator
reading a `PAYMENT_FAILED` row gets *"PayPal 422 INSTRUMENT_DECLINED: … [debug_id abc123] This is
not a transient failure"* instead of an opaque message. See `ppFail()` in
[`server/src/routes.ts`](./server/src/routes.ts).

### Fix 3 — `ORDER_ALREADY_CAPTURED` detection was string-matching raw JSON

Previously `JSON.stringify(e?.result)` + regex. Now it reads the typed `details[].issue` field, so a
duplicated request is recognised properly and the authoritative `getOrder` read-back decides the
outcome — never an assumption that the write succeeded.

## 3. Where the generated SDK is used

[`server/src/services/paypal.ts`](./server/src/services/paypal.ts) drives the whole money flow
through the APIMatic-generated SDK:

| Operation | SDK call | Used for |
|---|---|---|
| Create order | `orders.createOrder` | advance (CAPTURE intent), milestone funding (AUTHORIZE intent), expert-review fee |
| Verify | `orders.getOrder` | **server-side** confirmation before any funding status changes |
| Authorize | `orders.authorizeOrder` | milestone funding hold |
| Capture | `orders.captureOrder` | advance / fee capture |
| Partial capture | `payments.captureAuthorizedPayment` | releasing only the eligible amount, leaving the disputed remainder authorized |
| Void | `payments.voidPayment` | releasing a hold |
| Refund | `payments.refundCapturedPayment` | reversal |

Outside the SDK by necessity (PayPal ships no controller for them, so they are hand-written REST):
Payouts `POST /v1/payments/payouts` for freelancer and expert disbursement, and webhook signature
verification `POST /v1/notifications/verify-webhook-signature` — webhooks are ignored unless PayPal
returns `verification_status: SUCCESS`.

## 4. Our own API, through APIMatic too

[`apimatic/src/spec/openapi.yaml`](./apimatic/src/spec/openapi.yaml) describes VeriPay's own API
(19 operations) and is served live at `GET /openapi.yaml`:

```bash
npm run sdk:validate    # apimatic api validate --file=apimatic/src/spec/openapi.yaml
npm run sdk:generate    # apimatic sdk generate -i apimatic -l typescript
```

Both need `APIMATIC_API_KEY`; `apimatic/sdk/` is gitignored because it is reproducible output.

## Honest scope

- The plugin **is** installed and **was** used to find and fix the three defects above.
- `@paypal/paypal-server-sdk` would be APIMatic-generated whether or not we used the plugin — that
  alone is not a plugin claim, which is why the specific fixes are listed instead.
- SDK generation from our own spec (§4) is wired but has not been executed — it needs a key.

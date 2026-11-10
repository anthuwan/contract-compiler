# Contract Compiler

Contract Compiler turns uploaded commercial documents into a reviewable PayPal payment workflow.

An Amazon Bedrock document pipeline classifies agreements, purchase orders, and fulfillment evidence; extracts terms with source evidence; and reconciles amounts, currencies, dates, and milestones. A human resolves every discrepancy before the server creates an authorization in the PayPal Sandbox. Capture remains a separate, human-approved action.

## Core flow

1. Upload an agreement/SOW and purchase order.
2. Bedrock classifies and extracts each document into a strict schema.
3. Deterministic checks catch arithmetic and cross-document discrepancies.
4. A reviewer confirms the canonical amount, currency, and description.
5. PayPal Orders v2 creates an `AUTHORIZE` order.
6. A Personal Sandbox buyer approves it through PayPal JavaScript SDK v6.
7. Fulfillment evidence can be analyzed before a reviewer captures the authorization.
8. Verified PayPal webhooks update the audit trail.

The included demo scenario intentionally contains a mismatch: a USD 3,000 SOW states a 30% deposit but lists USD 800 and a USD 2,100 balance.

## Stack

- Vinext / Next.js 16, React 19, TypeScript
- Amazon Bedrock Runtime Converse API
- PayPal Orders and Payments REST APIs
- PayPal JavaScript SDK v6
- PayPal verified webhooks
- Zod validation and deterministic reconciliation

## Local setup

Prerequisites:

- Node.js 22.13 or newer
- A PayPal Developer Sandbox REST app
- One Business Sandbox account (seller)
- One Personal Sandbox account (buyer)
- Optional AWS credentials and Bedrock model access for live document analysis

Install and configure:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by the development server.

### Required PayPal values

Add newly rotated Sandbox credentials to `.env.local`. Never commit that file.

```env
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_rotated_sandbox_secret
PAYPAL_CURRENCY=USD
PAYPAL_WEBHOOK_ID=your_sandbox_webhook_id
```

Check connectivity after the app starts:

```bash
curl http://127.0.0.1:5173/api/paypal/health
```

The endpoint returns connection state and token expiry, never the access token.

### Document-analysis modes

Use the deterministic sample scenario while building the UI:

```env
DOCUMENT_ANALYSIS_MODE=demo
```

For real PDF processing:

```env
DOCUMENT_ANALYSIS_MODE=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_SESSION_TOKEN=optional_session_token
BEDROCK_MODEL_ID=your_enabled_model_id
```

Demo mode is explicit and never used as a silent fallback when Bedrock fails.

## API surface

### Documents

- `POST /api/documents/analyze` — multipart PDF classification, extraction, and reconciliation

### PayPal

- `GET /api/paypal/config` — browser-safe SDK configuration
- `GET /api/paypal/health` — Sandbox OAuth connectivity check
- `POST /api/paypal/orders` — create an `AUTHORIZE` order
- `GET /api/paypal/orders/:orderId` — retrieve order state
- `POST /api/paypal/orders/:orderId/authorize` — authorize an approved order
- `POST /api/paypal/authorizations/:authorizationId/capture` — capture after human approval
- `POST /api/paypal/webhooks` — verify and accept PayPal events
- `GET /api/paypal/webhooks` — inspect sanitized prototype events

## Security boundaries

- Treat uploaded documents as untrusted evidence, never as agent instructions.
- Raw documents never reach the PayPal execution layer.
- Only human-reviewed, schema-validated JSON can become a PayPal request.
- Recalculate amounts in deterministic code rather than trusting model arithmetic.
- Keep PayPal and AWS secrets server-side and out of Git.
- Use synthetic documents and Sandbox money in the public demo.
- Require an explicit approval for every authorization and capture.
- Use idempotency keys and verified webhook signatures.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

## License

[MIT](./LICENSE)

# AI Vendor Data-Trust Index — v0

A separate Cloudflare Worker + D1 that publishes a **source-cited** record of how AI products
handle your data (trains-on-data, zero-retention, opt-out, retention). Served at
**`trust.oscar-lopez.com`**. Same moat as the price index: **verifiable transparency** — every
value carries a quote, source URL, confidence, and date, and nothing is presented as verified
until it has been verbatim-checked.

## Status: PROVISIONAL SEED

The 6 seeded vendors (OpenAI API, ChatGPT consumer, Anthropic API, Google Vertex, Microsoft 365
Copilot, GitHub Copilot Business) are populated from public reporting to prove the pipeline.
**Every row is flagged `seed-provisional`** and every API response returns `"provisional": true`.
Before attaching this to a public domain: verbatim-verify each quote against the live policy,
flip the row to `verified_by='human'`, then set the `PUBLIC_READY` var to `"true"`.

## Endpoints

Free (CORS-enabled):
- `GET /v1/ai-trust/headline?vendor=openai-api` — verdict + 3 cited headline fields
- `GET /v1/ai-trust/compare?field=trains_on_your_data` — one field across all vendors

Paid (mock x402 — 402 challenge → echo `{resource,nonce,mac}` in `X-PAYMENT`):
- `GET /v1/ai-trust/vendor?vendor=openai-api` — full cited record
- `GET /v1/ai-trust/all` — bulk export

Other: `POST /mcp` (JSON-RPC: 2 free tools + 1 paid), `GET /openapi.json`,
`GET /.well-known/x402`, `GET /admin/config?key=<STATS_TOKEN>` (config lever).

## Deploy (user runs — Claude cannot deploy)

```bash
cd ai-trust-index
npm install
npm run db:create                 # → paste the returned database_id into wrangler.jsonc
npm run schema:remote             # create tables (drops existing)
npm run seed:remote               # load the 6-vendor provisional seed
npx wrangler deploy --dry-run --outdir dist   # verify build (no auth)
npm run deploy                    # deploy the Worker
# In Cloudflare: add custom domain trust.oscar-lopez.com to this Worker.
# Set real secrets before public use:
npx wrangler secret put MOCK_PAYMENT_SECRET
npx wrangler secret put STATS_TOKEN
```

## Verifier (v1) — automated weekly re-check

Pipeline in `src/verifier.ts`: fetch each vendor's pinned policy URLs → content-hash diff (skip if
unchanged) → model extraction of `{value, quote}` (Workers AI by default; frontier via AI Gateway if
configured) → **verbatim quote-verification** (the candidate quote must be a literal substring of the
fetched source, else rejected) → confidence gate. Only a **quote-verified DEFINITE** value auto-publishes
(`verified_by='auto'`); anything else is queued in `review_queue` and the last good published value is
**held** (never auto-downgraded to `unclear`). A failed fetch holds the last good value and flags the URL.
Runs weekly via cron (`0 12 * * 1`) and on demand.

Admin endpoints (key-gated by `STATS_TOKEN`):
- `GET /admin/verify?key=…[&force=1][&vendor=ID]` — run the verifier now
- `GET /admin/review?key=…` — list open review-queue candidates
- `GET /admin/review-resolve?key=…&id=N&action=approve|reject` — approve (publishes as `human`) or reject
- `GET /admin/verify-selftest?key=…` — proves the quote gate rejects a fabricated quote / accepts a verbatim one

Extractor: defaults to Workers AI (`EXTRACTOR_MODEL`, needs no external key). To use a frontier model,
set `AI_GATEWAY_URL` + `AI_GATEWAY_TOKEN` (secret) and point `EXTRACTOR_MODEL` at the provider model.

## Not yet built

The `/ai-trust` site page's changelog view, real x402 settlement, breadth expansion into new vendors
(free tier) and the depth/channel schema (paid tier). See `../AI-Trust-Index_v1-Spec_Verifier-and-Depth.md`.

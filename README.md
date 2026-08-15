# AI Vendor Data-Trust Index

[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](./LICENSE) [![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-green.svg)](https://creativecommons.org/licenses/by/4.0/) [![MCP](https://img.shields.io/badge/MCP-streamable--http-8A2BE2.svg)](https://trust.oscar-lopez.com/mcp)

A **source-cited** record of how AI products handle your data — whether the vendor **trains on your
inputs**, whether **zero data retention** is available, and whether you can **opt out** — across 11
products (OpenAI, Anthropic, Google Vertex & Gemini, Azure OpenAI, AWS Bedrock, Microsoft 365 Copilot,
GitHub Copilot, Mistral, Meta Llama). Every value carries a **verbatim quote from the vendor's live
policy**, a source URL, a confidence level, and the date it was checked. Ambiguous cases are marked
`unclear` rather than guessed. An automated verifier re-checks the policies **weekly** and only publishes
a value when a verbatim quote supports it — otherwise it holds the last human-verified value.

- **Live index (human view):** https://data.oscar-lopez.com/ai-trust
- **Free comparison API:** `GET https://trust.oscar-lopez.com/v1/ai-trust/matrix`
- **Cite as:** López, O. E. (2026). *AI Vendor Data-Trust Index.* https://data.oscar-lopez.com/ai-trust

## For AI agents (MCP)

This is a remote MCP server (streamable-http). Add it to your MCP client:

```json
{
  "mcpServers": {
    "ai-vendor-data-trust": {
      "type": "streamable-http",
      "url": "https://trust.oscar-lopez.com/mcp"
    }
  }
}
```

Tools: `get_ai_vendor_trust_headline` (free — verdict + cited fields for one vendor),
`get_ai_vendor_trust_compare` (free — one field across all vendors), `get_ai_vendor_trust`
(paid, x402 — full cited record). Vendor IDs: `openai-api`, `openai-consumer`, `anthropic-api`,
`google-vertex`, `google-gemini-consumer`, `microsoft-copilot`, `azure-openai`, `aws-bedrock`,
`mistral-api`, `meta-llama`, `github-copilot`.

## Endpoints

Free (CORS-enabled):
- `GET /v1/ai-trust/headline?vendor=openai-api` — verdict + 3 cited headline fields
- `GET /v1/ai-trust/compare?field=trains_on_your_data` — one field across all vendors

Paid (mock x402 — 402 challenge → echo `{resource,nonce,mac}` in `X-PAYMENT`):
- `GET /v1/ai-trust/vendor?vendor=openai-api` — full cited record
- `GET /v1/ai-trust/all` — bulk export

Other: `POST /mcp` (JSON-RPC: 2 free tools + 1 paid), `GET /openapi.json`,
`GET /.well-known/x402`, `GET /admin/config?key=<STATS_TOKEN>` (config lever).

## Deploy

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

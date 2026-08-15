# Publishing this repo + the MCP server

This makes `ai-vendor-data-trust-index` public so it can be listed on the MCP Registry (which Smithery,
PulseMCP, and Glama mirror/index). Do the **security gate first** — it is not optional.

## ⚠️ Security gate — before the repo is public

The Worker's admin endpoints (`/admin/verify`, `/admin/config`, `/admin/review-clear`, `/admin/stats`,
`/admin/rebaseline`-style ops) and the mock-payment gate are protected by `STATS_TOKEN` and
`MOCK_PAYMENT_SECRET`. Today those are plain **vars** in `wrangler.jsonc` with the value
`sandbox-...-change-me` — i.e. the live admin key is publicly guessable and would be exposed by publishing
the file. Rotate them to real secrets and remove them from the committed config:

```bash
# 1. Set real, random secrets (not committed to the repo):
npx wrangler secret put STATS_TOKEN          # paste a long random string
npx wrangler secret put MOCK_PAYMENT_SECRET  # paste a long random string

# 2. In wrangler.jsonc, DELETE the STATS_TOKEN and MOCK_PAYMENT_SECRET lines from "vars"
#    (secrets set above take precedence and are not stored in the repo).
```

Also confirm before first commit:
- [ ] `wrangler.jsonc` no longer contains `STATS_TOKEN` / `MOCK_PAYMENT_SECRET` values.
- [ ] `database_id` in `wrangler.jsonc` — acceptable to publish (it's an identifier, not a credential), but you may template it if you prefer.
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`.
- [ ] No `.dev.vars` or `.env` file is tracked.

## Create the repo

```bash
cd ai-trust-index
git init && git add . && git commit -m "AI Vendor Data-Trust Index — Cloudflare Worker + D1"
# create an empty public repo on github.com/<you>/ai-vendor-data-trust-index, then:
git remote add origin https://github.com/<you>/ai-vendor-data-trust-index.git
git push -u origin main
```

## Publish to the MCP Registry

1. Edit `../submissions/server-ai-trust.json` → set `repository.url` to your real repo URL.
2. Add the `mcp-name` ownership marker the publisher expects (a `server.json` at repo root works; copy
   `../submissions/server-ai-trust.json` to `./server.json`).
3. Install and publish:
   ```bash
   # per modelcontextprotocol.io/registry publishing guide
   npx @modelcontextprotocol/publisher login   # GitHub OAuth (verifies the io.github.<you> namespace)
   npx @modelcontextprotocol/publisher publish  # uses ./server.json
   ```
4. Verify it resolves in the registry, then list on the mirrors (Smithery / PulseMCP / Glama) using the
   canonical facts in `../Traffic-Action-Plan.md`.

## Pre-submit smoke test
```bash
curl -s https://trust.oscar-lopez.com/mcp -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# expect: get_ai_vendor_trust_headline, get_ai_vendor_trust_compare, get_ai_vendor_trust
```

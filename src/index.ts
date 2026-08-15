// AI Vendor Data-Trust Index — Worker entrypoint / router.
// Free:  GET /v1/ai-trust/headline?vendor=ID   (verdict + 3 cited headline fields)
//        GET /v1/ai-trust/compare?field=KEY     (one field across all vendors)
// Paid:  GET /v1/ai-trust/vendor?vendor=ID       (full cited record — mock x402)
//        GET /v1/ai-trust/all                     (bulk — mock x402)
// Also:  POST /mcp (JSON-RPC), GET /openapi.json, /.well-known/x402, /admin/config

import {
  Env,
  CITE_AS,
  HEADLINE_FIELDS,
  FIELD_LABEL,
  getVendor,
  listVendors,
  currentRecords,
  compareField,
  verdict,
  isProvisional,
  getConfig,
  setConfig,
  json,
  withPayment,
} from "./lib";
import { mcpHandler } from "./mcp";
import { runVerification, listReview, resolveReview, quoteVerify, debugExtract } from "./verifier";
import { classifyUA, logEvent } from "./telemetry";

const FREE_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, X-PAYMENT",
};

function free(body: unknown, status = 200): Response {
  return json(body, { status, headers: { ...FREE_CORS, "X-Tier": "free" } });
}

function recView(r: {
  field_key: string;
  value: string | null;
  quote: string | null;
  source_url: string | null;
  confidence: string | null;
  checked_at: string;
}) {
  return {
    field: r.field_key,
    label: FIELD_LABEL[r.field_key] ?? r.field_key,
    value: r.value,
    quote: r.quote,
    source_url: r.source_url,
    confidence: r.confidence,
    checked_at: r.checked_at,
  };
}

async function route(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: FREE_CORS });

    // ---- info / health ----
    if (p === "/" || p === "/health") {
      return free({
        name: "AI Vendor Data-Trust Index",
        status: env.PUBLIC_READY === "true" ? "live" : "provisional-seed",
        note:
          env.PUBLIC_READY === "true"
            ? "Values are source-cited and verified."
            : "Seed values are PROVISIONAL pending verbatim verification against each vendor's live policy.",
        cite_as: CITE_AS,
        free_endpoints: ["/v1/ai-trust/headline?vendor=ID", "/v1/ai-trust/compare?field=KEY", "/v1/ai-trust/matrix"],
        paid_endpoints: ["/v1/ai-trust/vendor?vendor=ID", "/v1/ai-trust/all"],
        mcp: "/mcp",
      });
    }

    // ---- discovery ----
    if (p === "/openapi.json") return free(openapi());
    if (p === "/.well-known/x402") {
      return free({
        x402Version: 1,
        resources: [
          { resource: "/v1/ai-trust/vendor", price: env.PRICE_USD, asset: env.PAY_ASSET, network: env.PAY_NETWORK },
          { resource: "/v1/ai-trust/all", price: env.PRICE_USD, asset: env.PAY_ASSET, network: env.PAY_NETWORK },
        ],
      });
    }

    // ---- MCP ----
    if (p === "/mcp" && req.method === "POST") return mcpHandler(req, env);

    // ---- FREE: headline verdict for one vendor ----
    if (p === "/v1/ai-trust/headline") {
      const vid = url.searchParams.get("vendor");
      if (!vid) return free({ error: "missing ?vendor=" }, 400);
      const v = await getVendor(env.DB, vid);
      if (!v) return free({ error: `unknown vendor '${vid}'` }, 404);
      const recs = await currentRecords(env.DB, vid, HEADLINE_FIELDS);
      const vd = verdict(recs);
      return free({
        vendor: { id: v.vendor_id, name: v.name, product: v.product, tier: v.tier },
        verdict: vd.summary,
        posture: vd.posture,
        provisional: isProvisional(recs),
        fields: recs.map(recView),
        cite_as: CITE_AS,
      });
    }

    // ---- FREE: compare one field across vendors ----
    if (p === "/v1/ai-trust/compare") {
      const field = url.searchParams.get("field") ?? "trains_on_your_data";
      const rows = await compareField(env.DB, field);
      return free({
        field,
        label: FIELD_LABEL[field] ?? field,
        provisional: rows.some((r) => (r.verified_by ?? "").startsWith("seed")),
        vendors: rows.map((r) => ({
          vendor: r.vendor_id,
          name: r.name,
          product: r.product,
          value: r.value,
          quote: r.quote,
          source_url: r.source_url,
          confidence: r.confidence,
          checked_at: r.checked_at,
        })),
        cite_as: CITE_AS,
      });
    }

    // ---- FREE: full headline matrix (all vendors x headline fields) — one call ----
    if (p === "/v1/ai-trust/matrix") {
      const vendors = await listVendors(env.DB);
      const rows = [];
      let asOf = "";
      for (const v of vendors) {
        const recs = await currentRecords(env.DB, v.vendor_id, HEADLINE_FIELDS);
        const get = (k: string) => recs.find((r) => r.field_key === k)?.value ?? null;
        for (const r of recs) if (r.checked_at > asOf) asOf = r.checked_at;
        rows.push({
          vendor: v.vendor_id,
          name: v.name,
          product: v.product,
          trains_on_your_data: get("trains_on_your_data"),
          zero_retention_available: get("zero_retention_available"),
          opt_out_available: get("opt_out_available"),
          verdict: verdict(recs).posture,
          provisional: isProvisional(recs),
        });
      }
      return free({ as_of: asOf, vendors: rows, cite_as: CITE_AS });
    }

    // ---- PAID: full record for one vendor ----
    if (p === "/v1/ai-trust/vendor") {
      const vid = url.searchParams.get("vendor");
      if (!vid) return free({ error: "missing ?vendor=" }, 400);
      return withPayment(env, req, "/v1/ai-trust/vendor", async () => {
        const v = await getVendor(env.DB, vid);
        if (!v) return json({ error: `unknown vendor '${vid}'` }, { status: 404 });
        const recs = await currentRecords(env.DB, vid);
        return json({
          vendor: { id: v.vendor_id, name: v.name, product: v.product, tier: v.tier, homepage: v.homepage },
          provisional: isProvisional(recs),
          verdict: verdict(recs).summary,
          fields: recs.map(recView),
          cite_as: CITE_AS,
        });
      });
    }

    // ---- PAID: bulk (all vendors, all fields) ----
    if (p === "/v1/ai-trust/all") {
      return withPayment(env, req, "/v1/ai-trust/all", async () => {
        const vendors = await listVendors(env.DB);
        const out = [];
        for (const v of vendors) {
          const recs = await currentRecords(env.DB, v.vendor_id);
          out.push({
            vendor: { id: v.vendor_id, name: v.name, product: v.product, tier: v.tier },
            provisional: isProvisional(recs),
            verdict: verdict(recs).summary,
            fields: recs.map(recView),
          });
        }
        return json({ count: out.length, records: out, cite_as: CITE_AS });
      });
    }

    // ---- ADMIN: config lever (key-gated) ----
    if (p === "/admin/config") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const set = url.searchParams.get("set");
      const value = url.searchParams.get("value");
      if (set && value !== null) {
        await setConfig(env.DB, set, value);
        return json({ ok: true, set, value });
      }
      return json({
        methodology_version: await getConfig(env.DB, "methodology_version"),
        public_ready: env.PUBLIC_READY,
      });
    }

    // ---- ADMIN: verifier (key-gated) ----
    if (p === "/admin/verify") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const force = url.searchParams.get("force") === "1";
      const onlyVendor = url.searchParams.get("vendor") ?? undefined;
      const res = await runVerification(env, { force, onlyVendor });
      return json(res);
    }
    if (p === "/admin/review") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      return json(await listReview(env));
    }
    if (p === "/admin/review-resolve") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const id = Number(url.searchParams.get("id"));
      const action = url.searchParams.get("action") === "approve" ? "approve" : "reject";
      if (!id) return json({ error: "missing ?id=" }, { status: 400 });
      return json(await resolveReview(env, id, action));
    }
    // Bulk-dismiss the noise (unclear/unverified/fetch-failed candidates that can't improve on a
    // human value). Leaves 'differs_from_human' items untouched for genuine review.
    if (p === "/admin/review-clear") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const now = new Date().toISOString();
      const reason = url.searchParams.get("reason");
      let r;
      if (reason) {
        // clear a specific reason (e.g. differs_from_human once reviewed)
        r = await env.DB.prepare(`UPDATE review_queue SET resolved_at=?, resolver='human' WHERE resolved_at IS NULL AND reason=?`).bind(now, reason).run();
        return json({ ok: true, reason, cleared: r.meta?.changes ?? null });
      }
      // default: clear only the noise; leave differs_from_human for review
      r = await env.DB.prepare(
        `UPDATE review_queue SET resolved_at=?, resolver='auto-clear'
         WHERE resolved_at IS NULL AND reason IN ('no_candidate','quote_unverified','fetch_failed','ambiguous_or_unclear')`
      ).bind(now).run();
      return json({ ok: true, cleared: r.meta?.changes ?? null, kept: "differs_from_human left for review" });
    }
    if (p === "/admin/extract-debug") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const vid = url.searchParams.get("vendor") ?? "anthropic-api";
      return json(await debugExtract(env, vid));
    }
    // Proves the guardrail without needing the model: a fabricated quote is rejected,
    // a verbatim quote is accepted.
    if (p === "/admin/verify-selftest") {
      if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
      const sample = "Anthropic may not train models on Customer Content from Services.";
      return json({
        verbatim_quote_accepted: quoteVerify("may not train models on Customer Content", sample),
        fabricated_quote_rejected: quoteVerify("Anthropic sells your data to advertisers", sample) === false,
      });
    }

    return free({ error: "not found" }, 404);
}

// ---- traffic-sensing aggregates (key-gated) ----
async function handleStats(url: URL, env: Env): Promise<Response> {
  if (url.searchParams.get("key") !== env.STATS_TOKEN) return json({ error: "unauthorized" }, { status: 401 });
  const days = Math.max(1, Number(url.searchParams.get("days") ?? "30"));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const all = (sql: string) => env.DB.prepare(sql).bind(since).all<Record<string, unknown>>();
  const one = async (sql: string) => ((await env.DB.prepare(sql).bind(since).first<{ c: number }>())?.c ?? 0);

  const total = await one("SELECT COUNT(*) c FROM access_events WHERE ts>=?");
  const bots = await one("SELECT COUNT(*) c FROM access_events WHERE ts>=? AND bot_kind!='other'");
  const paid_delivered = await one("SELECT COUNT(*) c FROM access_events WHERE ts>=? AND paid=1");
  const by_kind = (await all("SELECT bot_kind, COUNT(*) c FROM access_events WHERE ts>=? GROUP BY bot_kind ORDER BY c DESC")).results ?? [];
  const by_bot = (await all("SELECT bot_name, COUNT(*) c FROM access_events WHERE ts>=? AND bot_kind!='other' GROUP BY bot_name ORDER BY c DESC")).results ?? [];
  const by_tier = (await all("SELECT tier, COUNT(*) c FROM access_events WHERE ts>=? GROUP BY tier ORDER BY c DESC")).results ?? [];
  const top_paths = (await all("SELECT path, COUNT(*) c FROM access_events WHERE ts>=? GROUP BY path ORDER BY c DESC LIMIT 15")).results ?? [];
  const referrers = (await all("SELECT referer, COUNT(*) c FROM access_events WHERE ts>=? AND referer IS NOT NULL GROUP BY referer ORDER BY c DESC LIMIT 10")).results ?? [];
  const recent = (await env.DB.prepare("SELECT ts,path,tier,paid,status,bot_name FROM access_events ORDER BY id DESC LIMIT 20").all()).results ?? [];

  return json({ since, days, total, bots, humans: total - bots, paid_delivered, by_kind, by_bot, by_tier, top_paths, referrers, recent });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/admin/stats") return handleStats(url, env); // admin-gated; not logged

    const res = await route(req, env);

    // SENSE: classify + log external requests. Skip our own server-render fetches
    // (X-Render header) and admin endpoints (keeps the key out of logs).
    try {
      if (!req.headers.get("X-Render") && !url.pathname.startsWith("/admin")) {
        const ua = req.headers.get("user-agent");
        const cls = classifyUA(ua);
        ctx.waitUntil(
          logEvent(env, {
            ts: new Date().toISOString(),
            path: url.pathname + url.search,
            method: req.method,
            tool: res.headers.get("X-Tool") ?? undefined,
            tier: res.headers.get("X-Tier") ?? undefined,
            paid: res.headers.get("X-Paid") === "true",
            status: res.status,
            ua: ua ?? "",
            referer: req.headers.get("referer"),
            bot_kind: cls.kind,
            bot_name: cls.name,
          })
        );
      }
    } catch {
      /* telemetry must never block a response */
    }
    return res;
  },

  // Weekly cron (see wrangler.jsonc triggers): run the verifier over all vendors.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runVerification(env, {}).then(() => undefined));
  },
};

function openapi() {
  return {
    openapi: "3.0.0",
    info: { title: "AI Vendor Data-Trust Index", version: "0.0.1", description: "Source-cited record of how AI products handle your data." },
    servers: [{ url: "https://trust.oscar-lopez.com" }],
    paths: {
      "/v1/ai-trust/headline": { get: { summary: "Free verdict + headline fields for a vendor", parameters: [{ name: "vendor", in: "query", required: true, schema: { type: "string" } }] } },
      "/v1/ai-trust/compare": { get: { summary: "Free comparison of one field across vendors", parameters: [{ name: "field", in: "query", schema: { type: "string" } }] } },
      "/v1/ai-trust/vendor": { get: { summary: "Paid full cited record (x402)", parameters: [{ name: "vendor", in: "query", required: true, schema: { type: "string" } }] } },
      "/v1/ai-trust/all": { get: { summary: "Paid bulk export (x402)" } },
    },
  };
}

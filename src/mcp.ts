// AI Vendor Data-Trust Index — MCP (JSON-RPC over POST /mcp).
// Free tools: get_ai_vendor_trust_headline, get_ai_vendor_trust_compare.
// Paid tool:  get_ai_vendor_trust (full record) — gated by the same mock x402 as REST.

import {
  Env,
  CITE_AS,
  HEADLINE_FIELDS,
  getVendor,
  currentRecords,
  compareField,
  verdict,
  isProvisional,
  verifyPayment,
  makeChallenge,
} from "./lib";

const TOOLS = [
  {
    name: "get_ai_vendor_trust_headline",
    description: "FREE. Plain-language, source-cited verdict on how an AI vendor handles your data (trains-on-data, zero-retention, opt-out).",
    inputSchema: {
      type: "object",
      properties: { vendor: { type: "string", description: "vendor id, e.g. 'openai-api', 'anthropic-api'" } },
      required: ["vendor"],
    },
  },
  {
    name: "get_ai_vendor_trust_compare",
    description: "FREE. Compare one data-trust field (default trains_on_your_data) across all tracked vendors, with citations.",
    inputSchema: {
      type: "object",
      properties: { field: { type: "string", description: "field key, e.g. 'trains_on_your_data'" } },
    },
  },
  {
    name: "get_ai_vendor_trust",
    description: "PAID (x402). Full source-cited data-trust record for one vendor: every field, quote, source URL, confidence, date.",
    inputSchema: {
      type: "object",
      properties: { vendor: { type: "string" } },
      required: ["vendor"],
    },
  },
];

function rpc(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json" },
  });
}
function rpcErr(id: unknown, code: number, message: string, httpStatus = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: httpStatus,
    headers: { "content-type": "application/json" },
  });
}
function textResult(id: unknown, payload: unknown, headers: Record<string, string> = {}) {
  const res = rpc(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export async function mcpHandler(req: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcErr(null, -32700, "Parse error");
  }
  const { id, method, params } = body ?? {};

  if (method === "initialize") {
    return rpc(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "ai-vendor-data-trust-index", version: "0.0.1" },
    });
  }

  if (method === "tools/list") return rpc(id, { tools: TOOLS });

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};

    if (name === "get_ai_vendor_trust_headline") {
      const v = await getVendor(env.DB, args.vendor);
      if (!v) return textResult(id, { error: `unknown vendor '${args.vendor}'` }, { "X-Tier": "free" });
      const recs = await currentRecords(env.DB, args.vendor, HEADLINE_FIELDS);
      return textResult(
        id,
        {
          vendor: { id: v.vendor_id, name: v.name, product: v.product },
          verdict: verdict(recs).summary,
          provisional: isProvisional(recs),
          fields: recs.map((r) => ({ field: r.field_key, value: r.value, quote: r.quote, source_url: r.source_url })),
          cite_as: CITE_AS,
        },
        { "X-Tier": "free", "X-Tool": name }
      );
    }

    if (name === "get_ai_vendor_trust_compare") {
      const field = args.field ?? "trains_on_your_data";
      const rows = await compareField(env.DB, field);
      return textResult(
        id,
        {
          field,
          vendors: rows.map((r) => ({ vendor: r.vendor_id, name: r.name, value: r.value, source_url: r.source_url })),
          cite_as: CITE_AS,
        },
        { "X-Tier": "free", "X-Tool": name }
      );
    }

    if (name === "get_ai_vendor_trust") {
      const resource = "mcp:get_ai_vendor_trust";
      const paid = await verifyPayment(env, resource, req.headers.get("X-PAYMENT"));
      if (!paid) {
        const challenge = await makeChallenge(env, resource);
        return textResult(id, { error: "payment required", ...challenge }, { "X-Tier": "paid", "X-Paid": "false" });
      }
      const v = await getVendor(env.DB, args.vendor);
      if (!v) return textResult(id, { error: `unknown vendor '${args.vendor}'` });
      const recs = await currentRecords(env.DB, args.vendor);
      return textResult(
        id,
        {
          vendor: { id: v.vendor_id, name: v.name, product: v.product, tier: v.tier },
          provisional: isProvisional(recs),
          verdict: verdict(recs).summary,
          fields: recs.map((r) => ({
            field: r.field_key,
            value: r.value,
            quote: r.quote,
            source_url: r.source_url,
            confidence: r.confidence,
            checked_at: r.checked_at,
          })),
          cite_as: CITE_AS,
        },
        { "X-Tier": "paid", "X-Paid": "true", "X-Tool": name }
      );
    }

    return rpcErr(id, -32601, `unknown tool '${name}'`);
  }

  return rpcErr(id, -32601, `unknown method '${method}'`);
}

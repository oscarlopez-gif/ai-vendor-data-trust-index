// AI Vendor Data-Trust Index — core library.
// The current record for a vendor is DERIVED: the latest published row per field.
// Nothing is precomputed; provenance (quote + source_url + date + confidence) travels
// with every value, and the provisional flag is surfaced until PUBLIC_READY flips true.

export interface Env {
  DB: D1Database;
  MOCK_PAYMENT_SECRET: string;
  STATS_TOKEN: string;
  PRICE_USD: string;
  PAY_TO: string;
  PAY_NETWORK: string;
  PAY_ASSET: string;
  PUBLIC_READY: string; // "true" once the seed has been verbatim-verified
  // Verifier (v1):
  AI?: { run: (model: string, input: unknown) => Promise<unknown> }; // Workers AI binding
  EXTRACTOR_MODEL?: string;   // e.g. "@cf/meta/llama-3.1-8b-instruct"
  AI_GATEWAY_URL?: string;    // optional: route to a frontier model instead of Workers AI
  AI_GATEWAY_TOKEN?: string;  // optional: provider key for AI Gateway (secret)
}

export const CITE_AS = "AI Vendor Data-Trust Index — https://trust.oscar-lopez.com/methodology";

// The three fields shown in the FREE comparison table / headline verdict.
export const HEADLINE_FIELDS = ["trains_on_your_data", "zero_retention_available", "opt_out_available"] as const;

export const FIELD_LABEL: Record<string, string> = {
  trains_on_your_data: "Trains on your data",
  zero_retention_available: "Zero data retention available",
  opt_out_available: "Opt-out available",
  retention_default: "Default retention",
  data_residency_options: "Data residency options",
  human_review: "Human review of your data",
  dpa_available: "DPA available",
};

export type Rec = {
  vendor_id: string;
  field_key: string;
  value: string | null;
  quote: string | null;
  source_url: string | null;
  confidence: string | null;
  verified_by: string | null;
  checked_at: string;
};

export type VendorRow = {
  vendor_id: string;
  name: string;
  product: string | null;
  tier: string | null;
  homepage: string | null;
  policy_urls: string | null;
};

// ---------- data access ----------

export async function getVendor(db: D1Database, vendorId: string): Promise<VendorRow | null> {
  return await db
    .prepare("SELECT vendor_id,name,product,tier,homepage,policy_urls FROM vendors WHERE vendor_id=? AND active=1")
    .bind(vendorId)
    .first<VendorRow>();
}

export async function listVendors(db: D1Database): Promise<VendorRow[]> {
  const r = await db
    .prepare("SELECT vendor_id,name,product,tier,homepage,policy_urls FROM vendors WHERE active=1 ORDER BY name")
    .all<VendorRow>();
  return r.results ?? [];
}

// Latest published row per field for one vendor.
export async function currentRecords(db: D1Database, vendorId: string, fields?: readonly string[]): Promise<Rec[]> {
  const r = await db
    .prepare(
      `SELECT t.vendor_id,t.field_key,t.value,t.quote,t.source_url,t.confidence,t.verified_by,t.checked_at
       FROM trust_records t
       JOIN (
         SELECT field_key, MAX(checked_at) AS mx
         FROM trust_records
         WHERE vendor_id=? AND status='published'
         GROUP BY field_key
       ) latest ON latest.field_key=t.field_key AND latest.mx=t.checked_at
       WHERE t.vendor_id=? AND t.status='published'`
    )
    .bind(vendorId, vendorId)
    .all<Rec>();
  let out = r.results ?? [];
  if (fields) out = out.filter((x) => fields.includes(x.field_key));
  return out;
}

// One field across all vendors (for the comparison table).
export async function compareField(db: D1Database, fieldKey: string): Promise<(Rec & { name: string; product: string | null })[]> {
  const r = await db
    .prepare(
      `SELECT t.vendor_id,t.field_key,t.value,t.quote,t.source_url,t.confidence,t.verified_by,t.checked_at,v.name,v.product
       FROM trust_records t
       JOIN vendors v ON v.vendor_id=t.vendor_id AND v.active=1
       JOIN (
         SELECT vendor_id, MAX(checked_at) AS mx
         FROM trust_records
         WHERE field_key=? AND status='published'
         GROUP BY vendor_id
       ) latest ON latest.vendor_id=t.vendor_id AND latest.mx=t.checked_at
       WHERE t.field_key=? AND t.status='published'
       ORDER BY v.name`
    )
    .bind(fieldKey, fieldKey)
    .all<Rec & { name: string; product: string | null }>();
  return r.results ?? [];
}

// ---------- verdict ----------

// A plain-language, source-cited verdict for one vendor from the headline fields.
// Deliberately conservative: 'unclear' and missing data never become a positive claim.
export function verdict(records: Rec[]): { summary: string; posture: "favorable" | "mixed" | "caution" | "unclear" } {
  const by = (k: string) => records.find((r) => r.field_key === k)?.value ?? null;
  const trains = by("trains_on_your_data");
  const zdr = by("zero_retention_available");

  if (trains === "no" && (zdr === "yes" || zdr === null)) {
    return { summary: "Does not train on your data by default; retention controls available.", posture: "favorable" };
  }
  if (trains === "opt_out_default_on") {
    return { summary: "Uses your data to improve models unless you opt out.", posture: "caution" };
  }
  if (trains === "yes") {
    return { summary: "Trains on your data.", posture: "caution" };
  }
  if (trains === "no") {
    return { summary: "Does not train on your data by default; other controls unclear.", posture: "mixed" };
  }
  return { summary: "Insufficient verified information to summarize.", posture: "unclear" };
}

export function isProvisional(records: Rec[]): boolean {
  return records.some((r) => (r.verified_by ?? "").startsWith("seed"));
}

// ---------- config ----------

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM config WHERE key=?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value).run();
}

// ---------- mock x402 payment (shared-secret HMAC — NOT real settlement) ----------

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeChallenge(env: Env, resource: string): Promise<Record<string, unknown>> {
  const nonce = crypto.randomUUID();
  const mac = await hmacHex(env.MOCK_PAYMENT_SECRET, `${resource}:${nonce}`);
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: env.PAY_NETWORK,
        maxAmountRequired: env.PRICE_USD,
        asset: env.PAY_ASSET,
        payTo: env.PAY_TO,
        resource,
        description: `Access to ${resource}`,
        mimeType: "application/json",
        // In this MOCK, the client echoes {resource,nonce,mac} back in X-PAYMENT to unlock.
        extra: { nonce, mac, note: "MOCK payment — shared-secret HMAC, no funds move." },
      },
    ],
  };
}

export async function verifyPayment(env: Env, resource: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  try {
    const obj = JSON.parse(header) as { resource?: string; nonce?: string; mac?: string };
    if (!obj.resource || !obj.nonce || !obj.mac) return false;
    if (obj.resource !== resource) return false;
    const expect = await hmacHex(env.MOCK_PAYMENT_SECRET, `${resource}:${obj.nonce}`);
    return timingSafeEq(expect, obj.mac);
  } catch {
    return false;
  }
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Wrap a paid handler: return 402 + challenge unless a valid X-PAYMENT is present.
export async function withPayment(
  env: Env,
  req: Request,
  resource: string,
  handler: () => Promise<Response>
): Promise<Response> {
  const paid = await verifyPayment(env, resource, req.headers.get("X-PAYMENT"));
  if (!paid) {
    const challenge = await makeChallenge(env, resource);
    return json(challenge, { status: 402, headers: { "X-Tier": "paid", "X-Paid": "false" } });
  }
  const res = await handler();
  res.headers.set("X-Tier", "paid");
  res.headers.set("X-Paid", "true");
  return res;
}

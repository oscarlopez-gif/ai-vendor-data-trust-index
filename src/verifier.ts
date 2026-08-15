// AI Vendor Data-Trust Index — automated verifier (v1).
// For each (vendor, field): fetch the pinned policy, diff by content hash, extract a
// {value, quote} with a model, VERIFY the quote is a verbatim substring of the source,
// then confidence-gate: only a quote-verified DEFINITE value auto-publishes. Everything
// else is queued for a human and the last good published value is HELD (never downgraded
// to 'unclear' automatically). "unclear" is the default whenever the gate isn't cleared.

import { Env, listVendors, getVendor, getConfig, setConfig } from "./lib";

export const FIELDS_TO_VERIFY = [
  "trains_on_your_data",
  "zero_retention_available",
  "opt_out_available",
  "retention_default",
] as const;

const ALLOWED: Record<string, string[] | "text"> = {
  trains_on_your_data: ["no", "yes", "opt_out_default_on", "unclear"],
  zero_retention_available: ["yes", "no", "unclear"],
  opt_out_available: ["yes", "not_applicable", "unclear"],
  retention_default: "text",
};

const UA = "oscar-lopez-ai-trust-verifier/1.0 (+https://data.oscar-lopez.com/ai-trust)";
const MAX_CORPUS = 12000; // chars fed to the model per vendor
const MIN_QUOTE = 12;     // reject quotes too short to be meaningful

// ---------- pure helpers (unit-tested separately) ----------

export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeForMatch(s: string): string {
  return (s || "")
    .replace(/[‘’‚′]/g, "'")   // curly/smart single quotes -> '
    .replace(/[“”″]/g, '"')          // curly double quotes -> "
    .replace(/[–—]/g, "-")                // en/em dash -> -
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The core guardrail: a candidate quote is only accepted if it appears verbatim
// (modulo whitespace/quote-style/case) in the fetched source text.
export function quoteVerify(quote: string, sourceText: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE) return false;
  return normalizeForMatch(sourceText).includes(q);
}

export function isDefinite(field: string, value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  if (v === "unclear" || v === "") return false;
  const allowed = ALLOWED[field];
  if (allowed === "text") return true;
  return Array.isArray(allowed) && allowed.includes(v);
}

// html -> rough plain text for substring matching + model input
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- fetch ----------

async function fetchSource(url: string): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/plain" }, cf: { cacheTtl: 300 } });
    if (!r.ok) return { ok: false, text: "" };
    const raw = await r.text();
    const text = htmlToText(raw);
    // A JS-only shell yields almost no text — treat as a failed fetch (hold last good).
    if (text.length < 400) return { ok: false, text };
    return { ok: true, text };
  } catch {
    return { ok: false, text: "" };
  }
}

// ---------- extraction (Workers AI, or AI Gateway if configured) ----------

type Cand = { field_key: string; value: string; quote: string };

function buildPrompt(corpus: string): string {
  return [
    "You extract data-handling facts from an AI vendor's official policy text.",
    "For EACH field below, return the value AND a quote copied VERBATIM from the SOURCE that proves it.",
    "If the source does not clearly state it, set value to \"unclear\" and quote to \"\". Never guess.",
    "Do not paraphrase the quote — copy exact characters from the SOURCE.",
    "",
    "Fields and allowed values:",
    '- trains_on_your_data: "no" | "yes" | "opt_out_default_on" | "unclear"',
    '- zero_retention_available: "yes" | "no" | "unclear"',
    '- opt_out_available: "yes" | "not_applicable" | "unclear"',
    '- retention_default: a short string like "30 days" | "unclear"',
    "",
    "Return ONLY a JSON array like:",
    '[{"field_key":"trains_on_your_data","value":"no","quote":"...exact text..."}, ...]',
    "",
    "SOURCE:",
    corpus.slice(0, MAX_CORPUS),
  ].join("\n");
}

// Accepts the model output in any shape: an already-parsed array (function-calling models),
// a wrapper object ({candidates:[...]}, {result:[...]}, ...), or a string containing a JSON array.
function toCandArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["candidates", "result", "results", "data", "response", "fields", "output"]) {
      if (Array.isArray((raw as any)[k])) return (raw as any)[k];
    }
    return [];
  }
  if (typeof raw === "string") {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      const a = JSON.parse(raw.slice(start, end + 1));
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseCandidates(raw: unknown): Cand[] {
  return toCandArray(raw)
    .filter((x) => x && typeof x.field_key === "string")
    .map((x) => ({ field_key: x.field_key, value: String(x.value ?? "unclear"), quote: String(x.quote ?? "") }));
}

// Model is a config lever: config('extractor_model') overrides the env default, so it can be
// swapped with no redeploy (e.g. when Cloudflare deprecates a model id).
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export async function resolveModel(env: Env): Promise<string> {
  return (await getConfig(env.DB, "extractor_model")) ?? env.EXTRACTOR_MODEL ?? DEFAULT_MODEL;
}

async function extract(env: Env, corpus: string, model: string): Promise<Cand[]> {
  const prompt = buildPrompt(corpus);
  // Preferred path: AI Gateway to a frontier model (set AI_GATEWAY_URL + AI_GATEWAY_TOKEN).
  if (env.AI_GATEWAY_URL && env.AI_GATEWAY_TOKEN) {
    try {
      const r = await fetch(env.AI_GATEWAY_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_GATEWAY_TOKEN}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0 }),
      });
      const j: any = await r.json();
      const text = j?.choices?.[0]?.message?.content ?? "";
      return parseCandidates(text);
    } catch {
      return [];
    }
  }
  // Default path: Workers AI binding (no external key required).
  if (env.AI) {
    try {
      const out: any = await env.AI.run(model, {
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 900,
      });
      // out.response may be a string OR an already-parsed array (function-calling models).
      return parseCandidates(out?.response ?? out);
    } catch {
      return [];
    }
  }
  return [];
}

// Diagnostic: run fetch + model extraction for one vendor and return the RAW model
// output (or the error), so we can see why candidates aren't parsing. Publishes nothing.
export async function debugExtract(env: Env, vendorId: string): Promise<unknown> {
  const v = await getVendor(env.DB, vendorId);
  if (!v) return { error: `unknown vendor '${vendorId}'` };
  let urls: string[] = [];
  try { urls = JSON.parse(v.policy_urls || "[]"); } catch { urls = []; }
  const texts = [];
  for (const u of urls) texts.push({ url: u, ...(await fetchSource(u)) });
  const okTexts = texts.filter((t) => t.ok);
  const corpus = okTexts.map((t) => `[SOURCE ${t.url}]\n${t.text}`).join("\n\n");

  const result: any = {
    vendor: vendorId,
    fetched: texts.map((t) => ({ url: t.url, ok: t.ok, chars: t.text.length })),
    corpus_chars: corpus.length,
    model: await resolveModel(env),
    ai_binding_present: !!env.AI,
    gateway_configured: !!(env.AI_GATEWAY_URL && env.AI_GATEWAY_TOKEN),
  };
  if (okTexts.length === 0) { result.note = "no source text fetched"; return result; }

  const prompt = buildPrompt(corpus);
  try {
    if (env.AI) {
      const out: any = await env.AI.run(result.model, { messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 900 });
      result.raw_output = typeof out === "string" ? out : (out?.response ?? JSON.stringify(out));
      result.parsed_candidate_count = parseCandidates(result.raw_output).length;
    } else {
      result.error = "no AI binding";
    }
  } catch (e: any) {
    result.model_error = String(e?.message ?? e);
  }
  return result;
}

// ---------- DB helpers ----------

async function currentPublished(env: Env, vendorId: string, field: string): Promise<{ value: string | null; verified_by: string | null } | null> {
  return await env.DB.prepare(
    `SELECT value, verified_by FROM trust_records WHERE vendor_id=? AND field_key=? AND status='published' ORDER BY checked_at DESC, id DESC LIMIT 1`
  ).bind(vendorId, field).first<{ value: string; verified_by: string }>();
}

async function queueReview(env: Env, vendorId: string, field: string, c: { value: string; quote: string; source_url: string; confidence: string; reason: string; extractor: string }, now: string) {
  await env.DB.prepare(
    `INSERT INTO review_queue (vendor_id,field_key,candidate_value,candidate_quote,source_url,confidence,reason,extractor,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(vendorId, field, c.value, c.quote, c.source_url, c.confidence, c.reason, c.extractor, now).run();
}

// ---------- main pipeline ----------

export async function runVerification(env: Env, opts: { force?: boolean; onlyVendor?: string } = {}): Promise<unknown> {
  const now = new Date().toISOString().slice(0, 10);
  const extractor = await resolveModel(env);
  let vendors = await listVendors(env.DB);
  if (opts.onlyVendor) vendors = vendors.filter((v) => v.vendor_id === opts.onlyVendor);

  const summary: any = { ran: now, extractor, vendors: [] as any[], published: 0, queued: 0, held: 0, unchanged: 0 };

  for (const v of vendors) {
    const vres: any = { vendor: v.vendor_id, actions: [] as any[] };
    let urls: string[] = [];
    try { urls = JSON.parse(v.policy_urls || "[]"); } catch { urls = []; }
    if (urls.length === 0) { vres.error = "no policy_urls"; summary.vendors.push(vres); continue; }

    // fetch all sources
    const texts: { url: string; text: string; ok: boolean }[] = [];
    for (const u of urls) {
      const f = await fetchSource(u);
      texts.push({ url: u, text: f.text, ok: f.ok });
      await env.DB.prepare(`INSERT INTO source_snapshots (vendor_id,url,content_hash,char_len,fetched_at,ok) VALUES (?,?,?,?,?,?)`)
        .bind(v.vendor_id, u, f.ok ? await sha256hex(f.text) : null, f.text.length, new Date().toISOString(), f.ok ? 1 : 0).run();
    }
    const okTexts = texts.filter((t) => t.ok);
    if (okTexts.length === 0) {
      // hold last good value; flag for a human
      for (const field of FIELDS_TO_VERIFY) {
        await queueReview(env, v.vendor_id, field, { value: "unclear", quote: "", source_url: urls[0], confidence: "low", reason: "fetch_failed", extractor }, new Date().toISOString());
      }
      summary.held++; vres.actions.push({ note: "all fetches failed — held last good, queued fetch_failed" });
      summary.vendors.push(vres); continue;
    }

    const corpus = okTexts.map((t) => `[SOURCE ${t.url}]\n${t.text}`).join("\n\n");
    const newHash = await sha256hex(corpus);
    const oldHash = await getConfig(env.DB, `hash:${v.vendor_id}`);
    if (!opts.force && oldHash === newHash) {
      summary.unchanged++; vres.actions.push({ note: "source unchanged — reaffirmed" });
      summary.vendors.push(vres); continue;
    }

    const cands = await extract(env, corpus, extractor);
    const byField = new Map(cands.map((c) => [c.field_key, c]));

    for (const field of FIELDS_TO_VERIFY) {
      const c = byField.get(field);
      if (!c) {
        await queueReview(env, v.vendor_id, field, { value: "unclear", quote: "", source_url: okTexts[0].url, confidence: "low", reason: "no_candidate", extractor }, new Date().toISOString());
        summary.queued++; vres.actions.push({ field, result: "queued", reason: "no_candidate" }); continue;
      }
      // attribute the quote to whichever source contains it
      const hit = okTexts.find((t) => quoteVerify(c.quote, t.text));
      const verified = !!hit;
      const definite = isDefinite(field, c.value);

      const cur = await currentPublished(env, v.vendor_id, field);
      if (verified && definite && cur && cur.verified_by === "human" && cur.value !== c.value) {
        // NEVER auto-overwrite a human-verified value on a differing answer (guards against a
        // real-but-mis-mapped quote). Route to human review; the curated value keeps showing.
        await queueReview(env, v.vendor_id, field, { value: c.value, quote: c.quote, source_url: hit!.url, confidence: "medium", reason: "differs_from_human", extractor }, new Date().toISOString());
        summary.queued++; vres.actions.push({ field, result: "queued", reason: "differs_from_human", candidate: c.value, human: cur.value });
      } else if (verified && definite) {
        // auto-publish: quote-verified + definite, and not clobbering a differing human value
        await env.DB.prepare(
          `INSERT INTO trust_records (vendor_id,field_key,value,quote,source_url,confidence,status,verified_by,content_hash,extractor,quote_verified,checked_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(v.vendor_id, field, c.value, c.quote, hit!.url, "high", "published", "auto", newHash, extractor, 1, now).run();
        if (cur && cur.value !== c.value) {
          await env.DB.prepare(`INSERT INTO trust_changelog (vendor_id,field_key,old_value,new_value,source_url,changed_at) VALUES (?,?,?,?,?,?)`)
            .bind(v.vendor_id, field, cur.value, c.value, hit!.url, now).run();
          vres.actions.push({ field, result: "published(changed)", from: cur.value, to: c.value });
        } else {
          vres.actions.push({ field, result: "published(confirmed)", value: c.value });
        }
        summary.published++;
      } else {
        // gate not cleared -> queue, HOLD last good published value (do not overwrite)
        const reason = !verified ? "quote_unverified" : "ambiguous_or_unclear";
        await queueReview(env, v.vendor_id, field, { value: definite ? c.value : "unclear", quote: c.quote, source_url: okTexts[0].url, confidence: verified ? "medium" : "low", reason, extractor }, new Date().toISOString());
        summary.queued++; vres.actions.push({ field, result: "queued", reason, candidate: c.value });
      }
    }

    await setConfig(env.DB, `hash:${v.vendor_id}`, newHash);
    summary.vendors.push(vres);
  }

  return summary;
}

// ---------- review queue ----------

export async function listReview(env: Env): Promise<unknown> {
  const r = await env.DB.prepare(
    `SELECT id,vendor_id,field_key,candidate_value,candidate_quote,source_url,confidence,reason,created_at
     FROM review_queue WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 200`
  ).all();
  return { open: r.results ?? [] };
}

// Approve a queued candidate -> publish as human-verified. Reject -> just close it.
export async function resolveReview(env: Env, id: number, action: "approve" | "reject"): Promise<unknown> {
  const row = await env.DB.prepare(`SELECT * FROM review_queue WHERE id=? AND resolved_at IS NULL`).bind(id).first<any>();
  if (!row) return { error: "not found or already resolved" };
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  if (action === "approve") {
    const cur = await currentPublished(env, row.vendor_id, row.field_key);
    await env.DB.prepare(
      `INSERT INTO trust_records (vendor_id,field_key,value,quote,source_url,confidence,status,verified_by,quote_verified,checked_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(row.vendor_id, row.field_key, row.candidate_value, row.candidate_quote, row.source_url, row.confidence ?? "medium", "published", "human", 1, today).run();
    if (cur && cur.value !== row.candidate_value) {
      await env.DB.prepare(`INSERT INTO trust_changelog (vendor_id,field_key,old_value,new_value,source_url,changed_at) VALUES (?,?,?,?,?,?)`)
        .bind(row.vendor_id, row.field_key, cur.value, row.candidate_value, row.source_url, today).run();
    }
  }
  await env.DB.prepare(`UPDATE review_queue SET resolved_at=?, resolver='human' WHERE id=?`).bind(now, id).run();
  return { ok: true, id, action };
}

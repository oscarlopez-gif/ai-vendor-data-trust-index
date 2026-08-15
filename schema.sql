-- AI Vendor Data-Trust Index schema (v1 — adds verifier support).
-- Dated, cited rows are the source of truth; the "current record" is derived
-- (latest PUBLISHED row per vendor+field). One row per (vendor, field, checked_at)
-- gives change-tracking + provenance-per-field for free.

DROP TABLE IF EXISTS vendors;
CREATE TABLE vendors (
  vendor_id    TEXT PRIMARY KEY,   -- e.g. 'openai-api'  (v1: an offering id)
  name         TEXT NOT NULL,
  product      TEXT,
  tier         TEXT,               -- 'api' | 'enterprise' | 'consumer'
  homepage     TEXT,
  policy_urls  TEXT,               -- JSON array of source URLs (fetched by the verifier)
  active       INTEGER NOT NULL DEFAULT 1
);

DROP TABLE IF EXISTS trust_records;
CREATE TABLE trust_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id    TEXT NOT NULL,
  field_key    TEXT NOT NULL,
  value        TEXT,               -- 'no' | 'yes' | 'opt_out_default_on' | 'not_applicable' | 'unclear' | ...
  quote        TEXT,               -- exact clause supporting the value
  source_url   TEXT,
  confidence   TEXT,               -- 'high' | 'medium' | 'low'
  status       TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'review'
  verified_by  TEXT,               -- 'human' | 'auto' | 'seed-provisional'
  content_hash TEXT,               -- hash of the source text this value was drawn from
  extractor    TEXT,               -- model/version that produced an auto candidate (provenance)
  quote_verified INTEGER NOT NULL DEFAULT 0,  -- 1 only if the quote is a verbatim substring of the source
  checked_at   TEXT NOT NULL
);
CREATE INDEX idx_tr_lookup ON trust_records(vendor_id, field_key, status, checked_at);

DROP TABLE IF EXISTS trust_changelog;
CREATE TABLE trust_changelog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id   TEXT, field_key TEXT, old_value TEXT, new_value TEXT, source_url TEXT, changed_at TEXT
);

-- Candidates that did NOT clear the confidence/quote gate: parked for a human.
DROP TABLE IF EXISTS review_queue;
CREATE TABLE review_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id       TEXT NOT NULL,
  field_key       TEXT NOT NULL,
  candidate_value TEXT,
  candidate_quote TEXT,
  source_url      TEXT,
  confidence      TEXT,
  reason          TEXT,            -- why it was queued (quote_unverified | low_confidence | ambiguous | fetch_failed)
  extractor       TEXT,
  created_at      TEXT NOT NULL,
  resolved_at     TEXT,
  resolver        TEXT             -- 'human' once actioned
);
CREATE INDEX idx_rq_open ON review_queue(resolved_at, vendor_id, field_key);

-- Audit trail of what each source page said on a date (proves provenance over time).
DROP TABLE IF EXISTS source_snapshots;
CREATE TABLE source_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id    TEXT NOT NULL,
  url          TEXT NOT NULL,
  content_hash TEXT,
  char_len     INTEGER,
  fetched_at   TEXT NOT NULL,
  ok           INTEGER NOT NULL DEFAULT 1  -- 0 if the fetch failed (page moved / JS-only / error)
);

DROP TABLE IF EXISTS config;
CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO config (key, value) VALUES ('methodology_version', 'v1-verifier');

-- Traffic sensing: one row per external request, classified by AI-bot user-agent.
DROP TABLE IF EXISTS access_events;
CREATE TABLE access_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,   -- ISO timestamp
  path      TEXT,            -- pathname + query (so ?vendor=/?field= is visible)
  method    TEXT,
  tool      TEXT,            -- MCP tool name, if any
  tier      TEXT,            -- 'free' | 'paid' | null
  paid      INTEGER,         -- 1 if a paid resource was actually delivered
  status    INTEGER,
  ua        TEXT,
  referer   TEXT,            -- e.g. chatgpt.com / perplexity.ai (assistant referrals)
  bot_kind  TEXT,            -- 'training' | 'search' | 'live' | 'other'
  bot_name  TEXT
);
CREATE INDEX idx_events_ts ON access_events(ts);
CREATE INDEX idx_events_kind ON access_events(bot_kind);

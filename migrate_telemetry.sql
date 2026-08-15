-- Additive migration: add traffic-sensing table without wiping existing data.
--   npx wrangler d1 execute ai-trust --remote --file=./migrate_telemetry.sql
CREATE TABLE IF NOT EXISTS access_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,
  path      TEXT,
  method    TEXT,
  tool      TEXT,
  tier      TEXT,
  paid      INTEGER,
  status    INTEGER,
  ua        TEXT,
  referer   TEXT,
  bot_kind  TEXT,
  bot_name  TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON access_events(ts);
CREATE INDEX IF NOT EXISTS idx_events_kind ON access_events(bot_kind);

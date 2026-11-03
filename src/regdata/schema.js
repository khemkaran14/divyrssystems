// Tables for Divyrs RegData: regulatory changes + enforcement actions.
const db = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS reg_sources (
  id TEXT PRIMARY KEY,
  regulator TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  last_fetched INTEGER,
  last_status TEXT,
  last_error TEXT,
  items_seen INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reg_documents (
  id INTEGER PRIMARY KEY,
  source_id TEXT,
  regulator TEXT NOT NULL,
  guid TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  ref_no TEXT,
  summary TEXT,
  impact TEXT,
  effective_date TEXT,
  applies_to TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  obligations TEXT NOT NULL DEFAULT '[]',
  deadlines TEXT NOT NULL DEFAULT '[]',
  amends TEXT NOT NULL DEFAULT '[]',
  pdf_url TEXT,
  is_enforcement INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | ready | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  extraction TEXT,                          -- 'ai' | 'rules'
  model TEXT,
  error TEXT,
  review_status TEXT NOT NULL DEFAULT 'unreviewed', -- unreviewed | verified | rejected
  notified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (regulator, guid)
);
CREATE INDEX IF NOT EXISTS idx_regdoc_pub ON reg_documents(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_regdoc_status ON reg_documents(status, attempts);

CREATE VIRTUAL TABLE IF NOT EXISTS reg_documents_fts USING fts5(title, summary, tokenize = 'porter unicode61');

CREATE TABLE IF NOT EXISTS reg_actions (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES reg_documents(id) ON DELETE CASCADE,
  regulator TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_norm TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'other',
  action_type TEXT NOT NULL DEFAULT 'other',
  amount_inr INTEGER,
  action_date TEXT,
  reason TEXT,
  url TEXT NOT NULL,
  pdf_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regact_doc ON reg_actions(document_id);
CREATE INDEX IF NOT EXISTS idx_regact_date ON reg_actions(action_date DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS reg_actions_fts USING fts5(entity_norm, tokenize = 'unicode61');

CREATE TABLE IF NOT EXISTS reg_webhooks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  filters TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reg_deliveries (
  id INTEGER PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES reg_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regdeliv_due ON reg_deliveries(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS reg_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS reg_ai_log (
  day TEXT PRIMARY KEY,
  runs INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);
`);

const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [col, type] of [['reg_plan', "TEXT NOT NULL DEFAULT 'reg_free'"], ['reg_plan_expires', 'INTEGER'], ['reg_api_key', 'TEXT']]) {
  if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reg_key ON users(reg_api_key)');

module.exports = db;

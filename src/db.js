const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_expires INTEGER,
  api_key TEXT UNIQUE,
  status_slug TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked INTEGER,
  last_response_ms INTEGER,
  next_check_at INTEGER NOT NULL DEFAULT 0,
  checks_total INTEGER NOT NULL DEFAULT 0,
  checks_up INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  up INTEGER NOT NULL,
  status_code INTEGER,
  response_ms INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_checks_monitor ON checks(monitor_id, checked_at);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  target TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  client TEXT NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT UNIQUE NOT NULL,
  payment_id TEXT,
  plan TEXT NOT NULL,
  months INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  notify_email TEXT NOT NULL,
  redirect_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_form_subs ON form_submissions(form_id, created_at);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  data TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_pages (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  intro TEXT,
  duration INTEGER NOT NULL DEFAULT 30,
  days TEXT NOT NULL DEFAULT '1,2,3,4,5',
  start_time TEXT NOT NULL DEFAULT '10:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  tz TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot ON bookings(user_id, date, time) WHERE status = 'confirmed';
`);

// Columns added after first release (safe to run on an existing database).
const monitorCols = db.prepare('PRAGMA table_info(monitors)').all().map((c) => c.name);
for (const [col, type] of [['ssl_expires', 'INTEGER'], ['ssl_checked', 'INTEGER'], ['ssl_alerted', 'INTEGER'], ['ssl_error', 'TEXT']]) {
  if (!monitorCols.includes(col)) db.exec(`ALTER TABLE monitors ADD COLUMN ${col} ${type}`);
}

module.exports = db;

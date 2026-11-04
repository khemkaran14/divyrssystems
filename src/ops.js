// Production health: /healthz, alerts to the owner, daily report.
const db = require('./db');
const config = require('./config');
const { sendMail } = require('./mailer');

const startedAt = Date.now();
const HOUR = 3600000;

// Sends at most one alert per key per interval (stored in the DB, so restarts don't spam).
async function alertOwner(key, subject, text, minIntervalMs = 6 * HOUR) {
  if (!config.adminEmail) { console.warn('[alert]', subject); return false; }
  const last = db.prepare('SELECT sent_at FROM alerts_sent WHERE key = ?').get(key);
  if (last && Date.now() - last.sent_at < minIntervalMs) return false;
  db.prepare('INSERT INTO alerts_sent (key, sent_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET sent_at = excluded.sent_at').run(key, Date.now());
  await sendMail({ to: config.adminEmail, subject: '[Divyrs alert] ' + subject, text: text + `\n\n${config.baseUrl}/admin/regdata\n` });
  return true;
}

function feedProblems() {
  const { SOURCES } = require('./regdata/sources');
  const rows = Object.fromEntries(db.prepare('SELECT * FROM reg_sources').all().map((r) => [r.id, r]));
  const out = [];
  for (const s of SOURCES) {
    const r = rows[s.id];
    if (!r) continue; // not checked yet (just started)
    if (r.last_status === 'error') out.push(`${s.id}: error — ${r.last_error}`);
    else if (Date.now() - r.last_fetched > 3 * HOUR) out.push(`${s.id}: not checked for ${Math.round((Date.now() - r.last_fetched) / HOUR)} hours`);
  }
  return out;
}

function health() {
  let dbOk = true;
  try { db.prepare('SELECT 1').get(); } catch (_) { dbOk = false; }
  let pending = null; let failed = null;
  try {
    pending = db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status = 'pending'").get().n;
    failed = db.prepare("SELECT COUNT(*) n FROM reg_documents WHERE status = 'failed'").get().n;
  } catch (_) { /* regdata tables not loaded */ }
  return { ok: dbOk, uptime_s: Math.round((Date.now() - startedAt) / 1000), db: dbOk ? 'ok' : 'error', feeds: feedProblems(), pending, failed };
}

async function checkAndAlert() {
  const probs = feedProblems();
  if (probs.length) await alertOwner('feeds', `${probs.length} RegData feed problem(s)`, 'These feeds need attention:\n\n' + probs.join('\n') + '\n\nRun `npm run regdata:check` on the server to see details.');
  const h = health();
  if (h.failed >= 5) await alertOwner('failed-docs', `${h.failed} documents failed to process`, 'Open the admin page, filter "failed", and press Re-extract, or check the error shown on each item.', 24 * HOUR);
  if (h.pending >= 200) await alertOwner('backlog', `${h.pending} documents waiting`, 'The processing queue is building up. Check the AI key and daily cap (REGDATA_MAX_AI_PER_DAY).', 12 * HOUR);
}

// One short email a day at 9am IST with yesterday's numbers.
async function dailyReport(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour !== 9 || !config.adminEmail) return false;
  const since = now - 24 * HOUR;
  const n = (sql, ...a) => { try { return db.prepare(sql).get(...a).n; } catch (_) { return 0; } };
  const revenue = db.prepare("SELECT currency, SUM(amount) t FROM payments WHERE status = 'paid' AND paid_at >= ? GROUP BY currency").all(since)
    .map((r) => `${r.currency} ${r.t.toLocaleString('en-IN')}`).join(' + ') || '0';
  const text = [
    `New sign-ups: ${n('SELECT COUNT(*) n FROM users WHERE created_at >= ?', since)}`,
    `Payments: ${n("SELECT COUNT(*) n FROM payments WHERE status = 'paid' AND paid_at >= ?", since)} (${revenue})`,
    `Contact messages: ${n('SELECT COUNT(*) n FROM messages WHERE created_at >= ?', since)}`,
    `RegData documents added: ${n('SELECT COUNT(*) n FROM reg_documents WHERE created_at >= ?', since)}`,
    `High-impact items waiting for your review: ${n("SELECT COUNT(*) n FROM reg_documents WHERE status = 'ready' AND review_status = 'unreviewed' AND impact = 'high'")}`,
    `API calls this month: ${n('SELECT COALESCE(SUM(calls), 0) n FROM reg_usage WHERE month = ?', new Date(now).toISOString().slice(0, 7))}`,
    `Newsletter subscribers: ${n("SELECT COUNT(*) n FROM reg_digests WHERE user_id IS NULL AND confirmed = 1")}`,
    `Page views yesterday: ${n('SELECT COALESCE(SUM(views), 0) n FROM page_views WHERE day = ?', new Date(since).toISOString().slice(0, 10))}`,
  ].join('\n');
  return alertOwner('daily-report', `Daily report — ${new Date(now).toLocaleDateString('en-IN')}`, text, 20 * HOUR);
}

// Crash alerts. PM2 restarts the app; this tells you it happened.
function installCrashAlerts() {
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    alertOwner('unhandled', 'Unhandled error in the app', String(err && err.stack || err), HOUR).catch(() => {});
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    alertOwner('crash', 'The app crashed and is restarting', String(err && err.stack || err), HOUR)
      .catch(() => {}).finally(() => setTimeout(() => process.exit(1), 2000));
  });
}

module.exports = { health, alertOwner, checkAndAlert, dailyReport, installCrashAlerts, feedProblems };

// Background uptime checker. Runs inside the web process (fine for one VPS).
const db = require('./db');
const { effectivePlan } = require('./plans');
const { parseHttpUrl, isPublicUrl } = require('./safeurl');
const { sendMail } = require('./mailer');
const config = require('./config');
const tls = require('tls');

const TICK_MS = 20000;
const TIMEOUT_MS = 10000;
const KEEP_CHECKS = 200;
let running = false;

async function checkUrl(url) {
  const start = Date.now();
  const u = parseHttpUrl(url);
  if (!u || !(await isPublicUrl(u))) return { up: false, code: null, ms: 0, error: 'Blocked or invalid URL' };
  try {
    const res = await fetch(u, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'DivyrsUptimeBot/1.0 (+' + config.baseUrl + ')' },
    });
    res.body?.cancel().catch(() => {});
    const ms = Date.now() - start;
    return { up: res.status < 400, code: res.status, ms, error: res.status < 400 ? null : 'HTTP ' + res.status };
  } catch (err) {
    return { up: false, code: null, ms: Date.now() - start, error: err.name === 'TimeoutError' ? 'Timed out' : err.message };
  }
}

// Reads the HTTPS certificate expiry date (checked twice a day per monitor).
function checkSsl(urlObj) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: urlObj.hostname,
      port: Number(urlObj.port) || 443,
      servername: urlObj.hostname,
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    }, () => {
      const cert = socket.getPeerCertificate();
      const ok = socket.authorized;
      const err = socket.authorizationError;
      socket.end();
      if (!cert || !cert.valid_to) return resolve({ expires: null, error: 'No certificate' });
      resolve({ expires: new Date(cert.valid_to).getTime(), error: ok ? null : String(err) });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ expires: null, error: 'Timed out' }); });
    socket.on('error', (e) => resolve({ expires: null, error: e.message }));
  });
}

async function runSsl(m, user, plan) {
  const u = parseHttpUrl(m.url);
  if (!u || u.protocol !== 'https:') return;
  if (m.ssl_checked && Date.now() - m.ssl_checked < 12 * 3600000) return;
  if (!(await isPublicUrl(u))) return;
  const r = await checkSsl(u);
  const now = Date.now();
  const daysLeft = r.expires ? Math.floor((r.expires - now) / 86400000) : null;
  let alerted = m.ssl_alerted;
  if (daysLeft !== null && daysLeft > 14) alerted = null; // renewed: allow future alerts
  const due = daysLeft !== null && daysLeft <= 14 && (!alerted || now - alerted > 3 * 86400000);
  if (due && plan.limits.sslAlerts && user) {
    await sendMail({
      to: user.email,
      subject: daysLeft < 0 ? `🔴 SSL certificate EXPIRED: ${m.name}` : `⚠️ SSL certificate for ${m.name} expires in ${daysLeft} days`,
      text: `Website: ${m.url}\nCertificate expires: ${new Date(r.expires).toUTCString()}\n\n` +
        `Renew it before it expires, or visitors will see a security warning.\n\n${config.baseUrl}/dashboard/monitors\n`,
    });
    alerted = now;
  }
  db.prepare('UPDATE monitors SET ssl_expires = ?, ssl_checked = ?, ssl_alerted = ?, ssl_error = ? WHERE id = ?')
    .run(r.expires, now, alerted, r.error, m.id);
}

async function runOne(m) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(m.user_id);
  const plan = effectivePlan(user);
  // After a downgrade, only the oldest monitors within the plan limit keep running.
  const rank = db.prepare('SELECT COUNT(*) n FROM monitors WHERE user_id = ? AND id < ?').get(m.user_id, m.id).n;
  if (rank >= plan.limits.monitors) {
    db.prepare("UPDATE monitors SET status = 'paused', next_check_at = ? WHERE id = ?").run(Date.now() + 3600000, m.id);
    return;
  }
  const r = await checkUrl(m.url);
  const now = Date.now();
  const newStatus = r.up ? 'up' : 'down';

  db.prepare('INSERT INTO checks (monitor_id, checked_at, up, status_code, response_ms, error) VALUES (?,?,?,?,?,?)')
    .run(m.id, now, r.up ? 1 : 0, r.code, r.ms, r.error);
  db.prepare(`UPDATE monitors SET status=?, last_checked=?, last_response_ms=?, next_check_at=?,
              checks_total=checks_total+1, checks_up=checks_up+? WHERE id=?`)
    .run(newStatus, now, r.ms, now + plan.limits.intervalMin * 60000, r.up ? 1 : 0, m.id);
  db.prepare(`DELETE FROM checks WHERE monitor_id=? AND id NOT IN
              (SELECT id FROM checks WHERE monitor_id=? ORDER BY checked_at DESC LIMIT ?)`)
    .run(m.id, m.id, KEEP_CHECKS);

  await runSsl(m, user, plan).catch((e) => console.error('ssl', m.id, e.message));

  const changed = (m.status === 'up' || m.status === 'down') && m.status !== newStatus;
  if (changed && plan.limits.emailAlerts && user) {
    const subject = r.up ? `✅ ${m.name} is back UP` : `🔴 ${m.name} is DOWN`;
    await sendMail({
      to: user.email,
      subject,
      text: `${subject}\n\nURL: ${m.url}\nTime: ${new Date(now).toUTCString()}\n` +
        (r.error ? `Reason: ${r.error}\n` : `Response time: ${r.ms} ms\n`) +
        `\nDashboard: ${config.baseUrl}/dashboard/monitors\n`,
    });
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare('SELECT * FROM monitors WHERE next_check_at <= ? ORDER BY next_check_at LIMIT 50').all(Date.now());
    // Check in small batches so one slow site does not hold up the rest.
    for (let i = 0; i < due.length; i += 10) {
      await Promise.all(due.slice(i, i + 10).map((m) => runOne(m).catch((e) => console.error('monitor', m.id, e.message))));
    }
  } finally {
    running = false;
  }
}

function start() {
  setInterval(tick, TICK_MS).unref();
  setTimeout(tick, 2000).unref();
}

module.exports = { start, checkUrl };

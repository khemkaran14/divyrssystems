// Webhook delivery: signed POSTs to customer URLs, with retries.
const crypto = require('crypto');
const db = require('./schema');
const { regPlanFor } = require('./plans');
const { parseHttpUrl, isPublicUrl } = require('../safeurl');
const { nameSimilarity } = require('./rules');

const BACKOFF_MIN = [1, 5, 30, 120, 360];
const parse = (s, d) => { try { return JSON.parse(s); } catch (_) { return d; } };

function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function matches(f, doc, actions) {
  const events = f.events && f.events.length ? f.events : ['change', 'enforcement'];
  const regOk = !f.regulators || !f.regulators.length || f.regulators.includes(doc.regulator);
  if (!regOk) return [];
  const out = [];
  if (events.includes('change')) {
    const applies = parse(doc.applies_to, []);
    const appliesOk = !f.applies_to || !f.applies_to.length || f.applies_to.some((a) => applies.includes(a) || applies.includes('all_regulated_entities'));
    const impactOk = !f.impact || !f.impact.length || f.impact.includes(doc.impact);
    if (appliesOk && impactOk) out.push('change.created');
  }
  if (events.includes('enforcement') && actions.length) {
    const watch = f.watchlist || [];
    const hit = !watch.length || actions.some((a) => watch.some((w) => nameSimilarity(w, a.entity_name) >= 0.8));
    if (hit) out.push('enforcement.created');
  }
  return out;
}

function enqueueForDocument(docId) {
  const { formatChange, formatAction } = require('./store');
  const doc = db.prepare("SELECT * FROM reg_documents WHERE id = ? AND status = 'ready' AND notified = 0").get(docId);
  if (!doc) return 0;
  db.prepare('UPDATE reg_documents SET notified = 1 WHERE id = ?').run(docId);
  // Old items found in a feed for the first time are not "news"; skip anything older than 3 days.
  if (Date.now() - doc.published_at > 3 * 86400000) return 0;
  const actions = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').all(docId);
  const hooks = db.prepare('SELECT w.*, u.reg_plan, u.reg_plan_expires FROM reg_webhooks w JOIN users u ON u.id = w.user_id WHERE w.active = 1').all();
  let n = 0;
  for (const h of hooks) {
    if (regPlanFor(h).limits.webhooks <= 0) continue;
    for (const event of matches(parse(h.filters, {}), doc, actions)) {
      const data = event === 'change.created' ? formatChange(doc) : { change: formatChange(doc, { full: false }), actions: actions.map((a) => formatAction(a)) };
      const payload = JSON.stringify({ id: 'evt_' + crypto.randomBytes(8).toString('hex'), event, created: new Date().toISOString(), data });
      db.prepare('INSERT INTO reg_deliveries (webhook_id, event, payload, next_attempt_at, created_at) VALUES (?,?,?,?,?)').run(h.id, event, payload, Date.now(), Date.now());
      n++;
    }
  }
  return n;
}

async function sendOne(d) {
  const h = db.prepare('SELECT * FROM reg_webhooks WHERE id = ?').get(d.webhook_id);
  if (!h || !h.active) { db.prepare("UPDATE reg_deliveries SET status='failed', last_error='webhook disabled' WHERE id=?").run(d.id); return; }
  let error = null;
  try {
    const u = parseHttpUrl(h.url);
    if (!u || !(await isPublicUrl(u))) throw new Error('URL is not public');
    const res = await fetch(u, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'DivyrsRegData-Webhooks/1.0', 'Divyrs-Signature': sign(h.secret, d.payload), 'Divyrs-Event': d.event },
      body: d.payload,
    });
    res.body?.cancel().catch(() => {});
    if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
  } catch (e) {
    error = e.message;
  }
  const attempts = d.attempts + 1;
  if (!error) {
    db.prepare("UPDATE reg_deliveries SET status='sent', attempts=? WHERE id=?").run(attempts, d.id);
    db.prepare("UPDATE reg_webhooks SET fail_count=0, last_status='ok' WHERE id=?").run(h.id);
    return;
  }
  const done = attempts > BACKOFF_MIN.length;
  db.prepare('UPDATE reg_deliveries SET status=?, attempts=?, next_attempt_at=?, last_error=? WHERE id=?')
    .run(done ? 'failed' : 'pending', attempts, Date.now() + (BACKOFF_MIN[attempts - 1] || 0) * 60000, error.slice(0, 300), d.id);
  db.prepare('UPDATE reg_webhooks SET fail_count=fail_count+1, last_status=?, active=CASE WHEN fail_count+1 >= 50 THEN 0 ELSE active END WHERE id=?')
    .run(error.slice(0, 200), h.id);
}

async function deliverDue(limit = 20) {
  const due = db.prepare("SELECT * FROM reg_deliveries WHERE status='pending' AND next_attempt_at <= ? ORDER BY id LIMIT ?").all(Date.now(), limit);
  for (const d of due) await sendOne(d).catch((e) => console.error('[regdata] webhook', d.id, e.message));
  return due.length;
}

module.exports = { enqueueForDocument, deliverDue, sign, matches };

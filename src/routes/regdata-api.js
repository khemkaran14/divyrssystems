// Divyrs RegData API v1 — Authorization: Bearer rdk_...
const express = require('express');
const crypto = require('crypto');
const db = require('../regdata/schema');
const store = require('../regdata/store');
const { SOURCES, REGULATORS } = require('../regdata/sources');
const { regPlanFor } = require('../regdata/plans');
const { parseHttpUrl, isPublicUrl } = require('../safeurl');
const { APPLIES_TO } = require('../regdata/extract');
const { DOC_TYPES, ACTION_TYPES } = require('../regdata/rules');

const router = express.Router();
router.use(express.json({ limit: '100kb' }));
router.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
router.options('*', (req, res) => res.set({ 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE' }).sendStatus(204));

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const month = () => new Date().toISOString().slice(0, 7);
const list = (v, allowed) => {
  if (!v) return null;
  const items = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  return allowed ? items.filter((x) => allowed.includes(x)) : items;
};
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const dayToMs = (v) => (isoDay(v) ? Date.parse(v + 'T00:00:00Z') : null);
const idOf = (v, prefix) => { const m = String(v).match(new RegExp(`^(?:${prefix}_)?(\\d+)$`)); return m ? Number(m[1]) : null; };

// ---------------------------------------------------------------- auth, quotas
const minuteHits = new Map();
setInterval(() => minuteHits.clear(), 60000).unref();

function usageOf(userId) {
  return db.prepare('SELECT calls FROM reg_usage WHERE user_id = ? AND month = ?').get(userId, month())?.calls || 0;
}

function auth(req, res, next) {
  const key = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const user = key.startsWith('rdk_') && db.prepare('SELECT * FROM users WHERE reg_api_key = ?').get(key);
  if (!user) return fail(res, 401, 'invalid_api_key', 'Missing or invalid API key. Create one at /dashboard/regdata.');
  const plan = regPlanFor(user);
  const m = (minuteHits.get(user.id) || 0) + 1;
  minuteHits.set(user.id, m);
  if (m > plan.limits.perMinute) return fail(res, 429, 'rate_limited', `Limit is ${plan.limits.perMinute} requests per minute on the ${plan.name} plan.`);
  req.regUser = user;
  req.regPlan = plan;
  res.set('X-Plan', plan.id);
  next();
}

// Counts n calls against the monthly quota; returns false (and responds) when over.
function charge(req, res, n = 1) {
  const used = usageOf(req.regUser.id);
  const limit = req.regPlan.limits.callsMonth;
  res.set({ 'X-Usage-Month': String(used + n), 'X-Usage-Limit': String(limit) });
  if (used + n > limit) {
    fail(res, 429, 'quota_exceeded', `Monthly limit of ${limit} calls reached on the ${req.regPlan.name} plan. Upgrade at /regdata#pricing.`);
    return false;
  }
  db.prepare(`INSERT INTO reg_usage (user_id, month, calls) VALUES (?, ?, ?)
    ON CONFLICT(user_id, month) DO UPDATE SET calls = calls + excluded.calls`).run(req.regUser.id, month(), n);
  return true;
}

// Developer plan sees data with a delay.
function delayMs(req) { return req.regPlan.limits.delayDays * 86400000; }

router.use(auth);

// ---------------------------------------------------------------- changes
router.get('/changes', (req, res) => {
  if (!charge(req, res)) return;
  const q = req.query;
  const delay = delayMs(req);
  const r = store.listChanges({
    regulator: list(q.regulator, REGULATORS), type: list(q.type, DOC_TYPES), impact: list(q.impact, ['high', 'medium', 'low']),
    applies_to: list(q.applies_to, APPLIES_TO), since: dayToMs(q.since), until: dayToMs(q.until), q: q.q,
    enforcement: q.enforcement === undefined ? undefined : q.enforcement === 'true',
    maxPublished: delay ? Date.now() - delay : undefined,
    before: q.cursor ? idOf(q.cursor, 'chg') : undefined, limit: q.limit,
  });
  res.json({
    data: r.rows.map((d) => store.formatChange(d)),
    next_cursor: r.more ? `chg_${r.rows[r.rows.length - 1].id}` : null,
    delayed_days: req.regPlan.limits.delayDays || undefined,
  });
});

router.get('/changes/:id', (req, res) => {
  if (!charge(req, res)) return;
  const d = store.getChange(idOf(req.params.id, 'chg'));
  if (!d || (delayMs(req) && d.published_at > Date.now() - delayMs(req))) return fail(res, 404, 'not_found', 'No such change.');
  const actions = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').all(d.id).map((a) => store.formatAction(a));
  res.json({ data: { ...store.formatChange(d), enforcement_actions: actions } });
});

// ---------------------------------------------------------------- enforcement
function maxDate(req) {
  const d = delayMs(req);
  return d ? new Date(Date.now() - d).toISOString().slice(0, 10) : undefined;
}

router.get('/enforcement', (req, res) => {
  if (!charge(req, res)) return;
  const q = req.query;
  if (q.name) {
    const minC = Math.min(Math.max(parseFloat(q.min_confidence) || 0.6, 0.3), 1);
    const data = store.searchActions({ name: String(q.name).slice(0, 200), regulator: list(q.regulator, REGULATORS), since: isoDay(q.since), maxDate: maxDate(req), minConfidence: minC, limit: parseInt(q.limit, 10) || 20 });
    return res.json({ query: q.name, data });
  }
  const r = store.listActions({ regulator: list(q.regulator, REGULATORS), actionType: list(q.action_type, ACTION_TYPES), since: isoDay(q.since), maxDate: maxDate(req), limit: q.limit, before: q.cursor ? idOf(q.cursor, 'act') : undefined });
  res.json({ data: r.rows.map((a) => store.formatAction(a)), next_cursor: r.more ? `act_${r.rows[r.rows.length - 1].id}` : null });
});

router.get('/enforcement/:id', (req, res) => {
  if (!charge(req, res)) return;
  const a = db.prepare('SELECT * FROM reg_actions WHERE id = ?').get(idOf(req.params.id, 'act'));
  if (!a || (maxDate(req) && (a.action_date || '') > maxDate(req))) return fail(res, 404, 'not_found', 'No such action.');
  res.json({ data: store.formatAction(a) });
});

// Bulk screening: check up to 100 names (vendors, borrowers, partners) in one request.
router.post('/enforcement/screen', (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.map((n) => String(n).slice(0, 200)).filter(Boolean) : [];
  if (!names.length || names.length > 100) return fail(res, 400, 'bad_request', 'Send {"names": [...]} with 1 to 100 names.');
  if (!charge(req, res, names.length)) return;
  const minC = Math.min(Math.max(parseFloat(req.body.min_confidence) || 0.75, 0.3), 1);
  const results = names.map((name) => {
    const matches = store.searchActions({ name, maxDate: maxDate(req), minConfidence: minC, limit: 10 });
    return { name, flagged: matches.length > 0, matches };
  });
  res.json({ data: results, flagged: results.filter((r) => r.flagged).length });
});

// ---------------------------------------------------------------- meta
router.get('/regulators', (req, res) => {
  const rows = db.prepare('SELECT * FROM reg_sources').all();
  res.json({
    data: SOURCES.map((s) => {
      const r = rows.find((x) => x.id === s.id) || {};
      return { id: s.id, regulator: s.regulator, name: s.name, last_checked: r.last_fetched ? new Date(r.last_fetched).toISOString() : null, status: r.last_status || 'not_checked_yet' };
    }),
  });
});

router.get('/usage', (req, res) => {
  res.json({ plan: req.regPlan.id, month: month(), calls: usageOf(req.regUser.id), limit: req.regPlan.limits.callsMonth, plan_expires: req.regUser.reg_plan_expires ? new Date(req.regUser.reg_plan_expires).toISOString() : null });
});

// ---------------------------------------------------------------- webhooks
const fmtHook = (h) => ({ id: `wh_${h.id}`, url: h.url, filters: JSON.parse(h.filters), active: !!h.active, last_status: h.last_status, created: new Date(h.created_at).toISOString() });

function cleanFilters(b = {}) {
  const arr = (v, allowed, max = 50) => (Array.isArray(v) ? v.map(String).filter((x) => !allowed || allowed.includes(x)).slice(0, max) : []);
  return {
    events: arr(b.events, ['change', 'enforcement']),
    regulators: arr(b.regulators, REGULATORS),
    applies_to: arr(b.applies_to, APPLIES_TO),
    impact: arr(b.impact, ['high', 'medium', 'low']),
    watchlist: arr(b.watchlist, null, 500).map((s) => s.slice(0, 200)),
  };
}

async function createWebhook(user, plan, body) {
  const count = db.prepare('SELECT COUNT(*) n FROM reg_webhooks WHERE user_id = ?').get(user.id).n;
  if (count >= plan.limits.webhooks) {
    return { error: plan.limits.webhooks ? `The ${plan.name} plan allows ${plan.limits.webhooks} webhooks.` : 'Webhooks need the Starter or Business plan.' };
  }
  const u = parseHttpUrl(body.url);
  if (!u || u.protocol !== 'https:') return { error: 'Webhook URL must be a full https:// address.' };
  if (!(await isPublicUrl(u))) return { error: 'Webhook URL must be reachable on the public internet.' };
  const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const info = db.prepare('INSERT INTO reg_webhooks (user_id, url, secret, filters, created_at) VALUES (?,?,?,?,?)')
    .run(user.id, u.href, secret, JSON.stringify(cleanFilters(body)), Date.now());
  return { hook: db.prepare('SELECT * FROM reg_webhooks WHERE id = ?').get(info.lastInsertRowid), secret };
}

router.get('/webhooks', (req, res) => {
  res.json({ data: db.prepare('SELECT * FROM reg_webhooks WHERE user_id = ?').all(req.regUser.id).map(fmtHook) });
});

router.post('/webhooks', async (req, res) => {
  const r = await createWebhook(req.regUser, req.regPlan, req.body || {});
  if (r.error) return fail(res, r.error.includes('plan') ? 402 : 400, 'webhook_rejected', r.error);
  res.status(201).json({ data: { ...fmtHook(r.hook), secret: r.secret } });
});

router.delete('/webhooks/:id', (req, res) => {
  const r = db.prepare('DELETE FROM reg_webhooks WHERE id = ? AND user_id = ?').run(idOf(req.params.id, 'wh'), req.regUser.id);
  if (!r.changes) return fail(res, 404, 'not_found', 'No such webhook.');
  res.json({ deleted: true });
});

router.use((req, res) => fail(res, 404, 'not_found', 'Unknown endpoint. See /regdata/docs.'));

module.exports = router;
module.exports.createWebhook = createWebhook;
module.exports.cleanFilters = cleanFilters;

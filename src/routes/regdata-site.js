// Website pages for Divyrs RegData: public product pages, customer dashboard, admin review.
const express = require('express');
const crypto = require('crypto');
const db = require('../regdata/schema');
const store = require('../regdata/store');
const pipeline = require('../regdata/pipeline');
const { REG_PLANS, regPlanFor } = require('../regdata/plans');
const { SOURCES, REGULATORS } = require('../regdata/sources');
const { APPLIES_TO } = require('../regdata/extract');
const ai = require('../regdata/extract');
const { requireUser, requireAdmin, rateLimit } = require('../auth');
const { createWebhook } = require('./regdata-api');

const pub = express.Router();
const dash = express.Router();
const admin = express.Router();
const parse = (s, d) => { try { return JSON.parse(s); } catch (_) { return d; } };
const month = () => new Date().toISOString().slice(0, 7);

const SAMPLE_CHANGE = {
  id: 'chg_1024', regulator: 'RBI', title: 'Digital Lending – Amendments to Directions', doc_type: 'circular',
  ref_no: 'RBI/2026-27/112', published: '2026-11-02', effective_date: '2027-01-01', impact: 'high',
  applies_to: ['bank', 'nbfc', 'digital_lending'], summary: 'Lenders must disclose the all-in annual percentage rate in the key fact statement for every digital loan and report lending apps to RBI.',
  obligations: [{ what: 'Show all-in APR in the key fact statement before the loan is signed', who: 'Regulated lender', deadline: '2027-01-01', page: 3 }],
  deadlines: [{ what: 'Report all digital lending apps to RBI CIMS portal', date: '2026-12-15' }],
  amends: ['RBI/2022-23/111'], url: 'https://www.rbi.org.in/…', verified: true,
};
const SAMPLE_ACTION = {
  id: 'act_311', regulator: 'SEBI', entity_name: 'ABC Securities Pvt. Ltd.', entity_type: 'broker', action_type: 'monetary_penalty',
  amount_inr: 500000, action_date: '2026-10-28', reason: 'Failed to segregate client funds and delayed reporting to the exchange.',
  url: 'https://www.sebi.gov.in/enforcement/orders/…', match_confidence: 0.97,
};

// ---------------------------------------------------------------- public pages
pub.get('/regdata', (req, res) => {
  const latest = store.listChanges({ limit: 8 }).rows;
  const actions = store.listActions({ limit: 6 }).rows;
  res.render('regdata/landing', {
    title: 'RegData API — Indian regulatory changes & enforcement data',
    description: 'API for RBI and SEBI regulatory changes and enforcement actions: structured obligations, deadlines, penalties and name screening, with webhooks.',
    latest, actions, stats: store.stats(), REG_PLANS, SOURCES,
    sampleChange: JSON.stringify(SAMPLE_CHANGE, null, 2), sampleAction: JSON.stringify(SAMPLE_ACTION, null, 2),
  });
});

pub.get('/regdata/docs', (req, res) => {
  res.render('regdata/docs', { title: 'RegData API documentation', APPLIES_TO, REGULATORS, REG_PLANS, sampleChange: JSON.stringify(SAMPLE_CHANGE, null, 2), sampleAction: JSON.stringify(SAMPLE_ACTION, null, 2) });
});

pub.get('/regdata/changes', (req, res) => {
  const regulator = REGULATORS.includes(req.query.regulator) ? [req.query.regulator] : null;
  const before = parseInt(req.query.before, 10) || undefined;
  const r = store.listChanges({ regulator, before, limit: 25, q: req.query.q ? String(req.query.q).slice(0, 100) : undefined });
  res.render('regdata/changes', { title: 'Latest RBI & SEBI regulatory changes', rows: r.rows, more: r.more, filter: { regulator: req.query.regulator || '', q: req.query.q || '' }, REGULATORS });
});

pub.get('/regdata/changes/:id', (req, res, next) => {
  const d = store.getChange(parseInt(req.params.id, 10));
  if (!d) return next();
  const actions = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').all(d.id);
  res.render('regdata/change', {
    title: d.title, description: (d.summary || d.title).slice(0, 160), d, change: store.formatChange(d), actions,
    obligationsCount: parse(d.obligations, []).length, deadlinesCount: parse(d.deadlines, []).length,
  });
});

pub.get('/regdata/enforcement', rateLimit(60, 600000), (req, res) => {
  const name = req.query.name ? String(req.query.name).slice(0, 200) : '';
  let results = null;
  let gate = null;
  if (name) {
    if (!req.user) return res.redirect('/signup?next=' + encodeURIComponent('/regdata/enforcement?name=' + name));
    // Website searches count against the same monthly quota as the API.
    const plan = regPlanFor(req.user);
    const used = db.prepare('SELECT calls FROM reg_usage WHERE user_id = ? AND month = ?').get(req.user.id, month())?.calls || 0;
    if (used >= plan.limits.callsMonth) gate = `You have used all ${plan.limits.callsMonth} searches on the ${plan.name} plan this month.`;
    else {
      db.prepare(`INSERT INTO reg_usage (user_id, month, calls) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET calls = calls + 1`).run(req.user.id, month());
      const maxDate = plan.limits.delayDays ? new Date(Date.now() - plan.limits.delayDays * 86400000).toISOString().slice(0, 10) : undefined;
      results = store.searchActions({ name, maxDate, minConfidence: 0.6, limit: 50 });
    }
  }
  const latest = store.listActions({ limit: 30 }).rows;
  res.render('regdata/enforcement', { title: 'RBI & SEBI enforcement actions — penalties and orders', name, results, latest, gate });
});

// ---------------------------------------------------------------- customer dashboard
dash.use(requireUser);

function dashPage(req, res, extra = {}) {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const plan = regPlanFor(me);
  const used = db.prepare('SELECT calls FROM reg_usage WHERE user_id = ? AND month = ?').get(me.id, month())?.calls || 0;
  const hooks = db.prepare('SELECT * FROM reg_webhooks WHERE user_id = ? ORDER BY id').all(me.id).map((h) => ({ ...h, filters: parse(h.filters, {}) }));
  res.render('regdata/dashboard', { title: 'RegData API', me, regPlan: plan, used, hooks, REG_PLANS, REGULATORS, APPLIES_TO, msg: req.query.msg || null, error: null, newSecret: null, ...extra });
}

dash.get('/', (req, res) => dashPage(req, res));

dash.post('/key', (req, res) => {
  db.prepare('UPDATE users SET reg_api_key = ? WHERE id = ?').run('rdk_' + crypto.randomBytes(24).toString('hex'), req.user.id);
  res.redirect('/dashboard/regdata?msg=' + encodeURIComponent('New API key created. Any old key stopped working.'));
});

dash.post('/webhooks', async (req, res) => {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const arr = (v) => [].concat(v || []).map(String).filter(Boolean);
  const r = await createWebhook(me, regPlanFor(me), {
    url: req.body.url, events: arr(req.body.events), regulators: arr(req.body.regulators), applies_to: arr(req.body.applies_to),
    impact: arr(req.body.impact), watchlist: String(req.body.watchlist || '').split('\n').map((s) => s.trim()).filter(Boolean),
  });
  if (r.error) return dashPage(req, res, { error: r.error });
  dashPage(req, res, { msg: 'Webhook added. Copy the signing secret now — it is shown only once.', newSecret: r.secret });
});

dash.post('/webhooks/:id/delete', (req, res) => {
  db.prepare('DELETE FROM reg_webhooks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/regdata?msg=Webhook+deleted');
});

dash.post('/webhooks/:id/test', (req, res) => {
  const h = db.prepare('SELECT * FROM reg_webhooks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (h) {
    const payload = JSON.stringify({ id: 'evt_test_' + crypto.randomBytes(6).toString('hex'), event: 'test', created: new Date().toISOString(), data: SAMPLE_CHANGE });
    db.prepare('INSERT INTO reg_deliveries (webhook_id, event, payload, next_attempt_at, created_at) VALUES (?,?,?,?,?)').run(h.id, 'test', payload, Date.now(), Date.now());
  }
  res.redirect('/dashboard/regdata?msg=' + encodeURIComponent('Test event queued. It is sent within 30 seconds.'));
});

// ---------------------------------------------------------------- admin
admin.use(requireUser, requireAdmin);

admin.get('/', (req, res) => {
  const filter = ['unreviewed', 'verified', 'rejected', 'failed', 'pending', 'enforcement'].includes(req.query.show) ? req.query.show : 'unreviewed';
  let where = "status='ready' AND review_status='unreviewed'";
  if (filter === 'verified' || filter === 'rejected') where = `review_status='${filter}'`;
  if (filter === 'failed' || filter === 'pending') where = `status='${filter}'`;
  if (filter === 'enforcement') where = "status='ready' AND is_enforcement=1";
  const docs = db.prepare(`SELECT * FROM reg_documents WHERE ${where} ORDER BY CASE impact WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, published_at DESC LIMIT 100`).all();
  const counts = Object.fromEntries(db.prepare('SELECT document_id, COUNT(*) n FROM reg_actions GROUP BY document_id').all().map((r) => [r.document_id, r.n]));
  const today = new Date().toISOString().slice(0, 10);
  res.render('regdata/admin', {
    title: 'RegData admin', docs, counts, filter, stats: store.stats(),
    sources: db.prepare('SELECT * FROM reg_sources').all(), SOURCES, REGULATORS,
    aiOn: ai.enabled(), aiModel: ai.MODEL, aiToday: db.prepare('SELECT * FROM reg_ai_log WHERE day = ?').get(today), aiLeft: pipeline.aiBudgetLeft(),
    users: db.prepare("SELECT id, name, email, reg_plan, reg_plan_expires FROM users WHERE reg_api_key IS NOT NULL OR reg_plan != 'reg_free' ORDER BY id DESC LIMIT 100").all(),
    REG_PLANS, msg: req.query.msg || null,
  });
});

const back = (res, msg, show) => res.redirect('/admin/regdata?' + (show ? 'show=' + show + '&' : '') + 'msg=' + encodeURIComponent(msg));

admin.post('/collect', async (req, res) => {
  const r = await pipeline.collectAll();
  back(res, r.map((x) => `${x.source}: ${x.error ? 'ERROR ' + x.error : x.added + ' new of ' + x.items}`).join(' · '));
});

admin.post('/process', async (req, res) => {
  const r = await pipeline.processPending(Math.min(parseInt(req.body.n, 10) || 10, 50));
  back(res, `Processed ${r.length} documents.`);
});

admin.post('/add', async (req, res) => {
  const regulator = REGULATORS.includes(req.body.regulator) ? req.body.regulator : 'RBI';
  const url = String(req.body.url || '').trim();
  if (!/^https?:\/\//.test(url)) return back(res, 'Enter a full URL.');
  const id = await pipeline.addByUrl({ regulator, url, title: String(req.body.title || '').trim() || null });
  back(res, id ? `Added (#${id}). It is processed within a minute.` : 'That URL is already in the database.', 'pending');
});

admin.post('/docs/:id/review', (req, res) => {
  const status = ['verified', 'rejected', 'unreviewed'].includes(req.body.status) ? req.body.status : 'unreviewed';
  const impact = ['high', 'medium', 'low'].includes(req.body.impact) ? req.body.impact : null;
  db.prepare('UPDATE reg_documents SET review_status = ?, impact = COALESCE(?, impact), updated_at = ? WHERE id = ?').run(status, impact, Date.now(), req.params.id);
  back(res, `Marked #${req.params.id} ${status}.`, req.body.show);
});

admin.post('/docs/:id/retry', (req, res) => {
  db.prepare("UPDATE reg_documents SET status = 'pending', attempts = 0, error = NULL WHERE id = ?").run(req.params.id);
  back(res, `#${req.params.id} queued again.`, req.body.show);
});

// Manual activation (bank transfer, invoice-based enterprise deals).
admin.post('/users/:id/plan', (req, res) => {
  const plan = REG_PLANS[req.body.plan] ? req.body.plan : 'reg_free';
  const days = Math.max(0, Math.min(3660, parseInt(req.body.days, 10) || 0));
  db.prepare('UPDATE users SET reg_plan = ?, reg_plan_expires = ? WHERE id = ?').run(plan, plan === 'reg_free' ? null : Date.now() + days * 86400000, req.params.id);
  back(res, 'RegData plan updated.');
});

module.exports = { pub, dash, admin };

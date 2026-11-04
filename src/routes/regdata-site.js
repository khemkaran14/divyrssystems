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
const digest = require('../regdata/digest');
const { DOC_TYPES } = require('../regdata/rules');

// CSV cell: quote everything and stop Excel from running formulas.
const csvCell = (v) => { let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const toCsv = (cols, rows) => '\ufeff' + [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');

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

pub.get('/regdata/status', (req, res) => {
  const seen = Object.fromEntries(db.prepare('SELECT * FROM reg_sources').all().map((r) => [r.id, r]));
  const staleMs = 3 * 3600000;
  const rows = SOURCES.map((s) => {
    const r = seen[s.id];
    let state = 'pending'; let label = 'Not checked yet';
    if (r && r.last_status === 'error') { state = 'error'; label = 'Problem fetching'; }
    else if (r && Date.now() - r.last_fetched > staleMs) { state = 'stale'; label = 'Delayed'; }
    else if (r) { state = 'ok'; label = 'Operational'; }
    return { regulator: s.regulator, name: s.name, state, label, checked: r && r.last_fetched };
  });
  res.render('regdata/status', { title: 'RegData status', rows, stats: store.stats() });
});

pub.get('/regdata/openapi.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*').json(require('../regdata/openapi')(require('../config').baseUrl));
});

pub.get('/regdata/docs', (req, res) => {
  res.render('regdata/docs', { title: 'RegData API documentation', APPLIES_TO, REGULATORS, REG_PLANS, sampleChange: JSON.stringify(SAMPLE_CHANGE, null, 2), sampleAction: JSON.stringify(SAMPLE_ACTION, null, 2) });
});

const topics = require('../regdata/topics');
pub.get('/regdata/topics', (req, res) => {
  const counts = Object.fromEntries(topics.TOPICS.map((t) => [t.slug, store.listChanges({ ...t.f, limit: 100 }).rows.length]));
  res.render('regdata/topics', { title: 'Indian regulatory topics — RBI & SEBI', description: 'Browse RBI and SEBI regulatory changes and penalties by topic: digital lending, KYC, cybersecurity, NBFCs, payments, brokers and more.', TOPICS: topics.TOPICS, counts });
});
pub.get('/regdata/topics/:slug', (req, res, next) => {
  const t = topics.bySlug[req.params.slug];
  if (!t) return next();
  const rows = store.listChanges({ ...t.f, limit: 40 }).rows;
  const apiQuery = new URLSearchParams(Object.entries(t.f).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])).toString();
  res.render('regdata/topic', { title: `${t.name}: latest RBI & SEBI updates`, description: t.intro, t, rows, apiQuery, TOPICS: topics.TOPICS });
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

// ---------------------------------------------------------------- newsletter (no account needed)
pub.post('/regdata/subscribe', rateLimit(10, 3600000), (req, res) => {
  const r = digest.subscribeNewsletter(req.body.email);
  res.render('regdata/subscribed', { title: 'Indian Regulatory Roundup', ok: !r.error, error: r.error || null, mode: 'pending' });
});
pub.get('/regdata/digest/confirm/:token', (req, res) => {
  const ok = digest.confirm(req.params.token);
  res.render('regdata/subscribed', { title: 'Subscription confirmed', ok, error: ok ? null : 'This link is not valid any more.', mode: 'confirmed' });
});
pub.get('/regdata/digest/unsubscribe/:token', (req, res) => {
  const ok = digest.unsubscribe(req.params.token);
  res.render('regdata/subscribed', { title: 'Unsubscribed', ok, error: ok ? null : 'You were already unsubscribed.', mode: 'unsubscribed' });
});
// One-click unsubscribe from email clients (RFC 8058).
pub.post('/regdata/digest/unsubscribe/:token', (req, res) => { digest.unsubscribe(req.params.token); res.sendStatus(200); });

// ---------------------------------------------------------------- CSV / Excel export (signed in)
function exportAllowed(req, res) {
  if (!req.user) { res.redirect('/signup?next=' + encodeURIComponent(req.originalUrl)); return null; }
  const plan = regPlanFor(req.user);
  const used = db.prepare('SELECT calls FROM reg_usage WHERE user_id = ? AND month = ?').get(req.user.id, month())?.calls || 0;
  if (used >= plan.limits.callsMonth) { res.status(429).render('error', { title: 'Monthly limit reached', message: `Exports count as one API call. You have used all ${plan.limits.callsMonth} on the ${plan.name} plan this month.` }); return null; }
  db.prepare('INSERT INTO reg_usage (user_id, month, calls) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET calls = calls + 1').run(req.user.id, month());
  return plan;
}
const csvList = (v, allowed) => (v ? String(v).split(',').filter((x) => !allowed || allowed.includes(x)) : null);

pub.get('/regdata/export/changes.csv', (req, res) => {
  const plan = exportAllowed(req, res); if (!plan) return;
  const q = req.query;
  const max = plan.id === 'reg_free' ? 200 : 5000;
  const rows = [];
  let before;
  while (rows.length < max) {
    const r = store.listChanges({
      regulator: csvList(q.regulator, REGULATORS), type: csvList(q.type, DOC_TYPES), impact: csvList(q.impact, ['high', 'medium', 'low']),
      applies_to: csvList(q.applies_to, APPLIES_TO), q: q.q ? String(q.q).slice(0, 100) : undefined,
      since: /^\d{4}-\d{2}-\d{2}$/.test(q.since || '') ? Date.parse(q.since) : undefined,
      maxPublished: plan.limits.delayDays ? Date.now() - plan.limits.delayDays * 86400000 : undefined, before, limit: 100,
    });
    rows.push(...r.rows.map((d) => {
      const c = store.formatChange(d);
      return { ...c, obligations: c.obligations.map((o) => o.what + (o.deadline ? ` (by ${o.deadline})` : '')), deadlines: c.deadlines.map((x) => `${x.date}: ${x.what}`) };
    }));
    if (!r.more) break;
    before = r.rows[r.rows.length - 1].id;
  }
  res.attachment(`regdata-changes-${new Date().toISOString().slice(0, 10)}.csv`).type('text/csv')
    .send(toCsv(['published', 'regulator', 'doc_type', 'ref_no', 'title', 'impact', 'effective_date', 'applies_to', 'summary', 'obligations', 'deadlines', 'amends', 'verified', 'url', 'page'], rows.slice(0, max)));
});

pub.get('/regdata/export/enforcement.csv', (req, res) => {
  const plan = exportAllowed(req, res); if (!plan) return;
  const maxDate = plan.limits.delayDays ? new Date(Date.now() - plan.limits.delayDays * 86400000).toISOString().slice(0, 10) : undefined;
  const rows = req.query.name
    ? store.searchActions({ name: String(req.query.name).slice(0, 200), maxDate, minConfidence: 0.6, limit: 100 })
    : store.listActions({ regulator: csvList(req.query.regulator, REGULATORS), maxDate, limit: 100 }).rows.map((a) => store.formatAction(a));
  res.attachment(`regdata-enforcement-${new Date().toISOString().slice(0, 10)}.csv`).type('text/csv')
    .send(toCsv(['action_date', 'regulator', 'entity_name', 'entity_type', 'action_type', 'amount_inr', 'reason', 'match_confidence', 'url', 'pdf_url'], rows));
});

// ---------------------------------------------------------------- customer dashboard
dash.use(requireUser);

function dashPage(req, res, extra = {}) {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const plan = regPlanFor(me);
  const used = db.prepare('SELECT calls FROM reg_usage WHERE user_id = ? AND month = ?').get(me.id, month())?.calls || 0;
  const hooks = db.prepare('SELECT * FROM reg_webhooks WHERE user_id = ? ORDER BY id').all(me.id).map((h) => ({ ...h, filters: parse(h.filters, {}) }));
  const digests = db.prepare('SELECT * FROM reg_digests WHERE user_id = ? ORDER BY id').all(me.id).map((d) => ({ ...d, filters: parse(d.filters, {}) }));
  const deliveries = db.prepare('SELECT d.id, d.event, d.status, d.attempts, d.last_error, d.created_at, w.url FROM reg_deliveries d JOIN reg_webhooks w ON w.id = d.webhook_id WHERE w.user_id = ? ORDER BY d.id DESC LIMIT 20').all(me.id);
  res.render('regdata/dashboard', { title: 'RegData API', me, regPlan: plan, used, hooks, digests, deliveries, digestLimits: digest.limitsFor(me), REG_PLANS, REGULATORS, APPLIES_TO, msg: req.query.msg || null, error: null, newSecret: null, ...extra });
}

dash.get('/', (req, res) => dashPage(req, res));

dash.post('/key', (req, res) => {
  if (!req.user.email_verified && !res.locals.isAdmin) {
    return res.redirect('/dashboard/regdata?msg=' + encodeURIComponent('Please confirm your email first — we sent you a link.'));
  }
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

dash.post('/digests', (req, res) => {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const arr = (v) => [].concat(v || []).map(String).filter(Boolean);
  const r = digest.createForUser(me, {
    frequency: req.body.frequency, regulators: arr(req.body.regulators).filter((x) => REGULATORS.includes(x)),
    applies_to: arr(req.body.applies_to).filter((x) => APPLIES_TO.includes(x)), impact: arr(req.body.impact).filter((x) => ['high', 'medium', 'low'].includes(x)),
    watchlist: String(req.body.watchlist || '').split('\n').map((s) => s.trim().slice(0, 200)).filter(Boolean),
  });
  if (r.error) return dashPage(req, res, { error: r.error });
  res.redirect('/dashboard/regdata?msg=' + encodeURIComponent(me.email_verified ? 'Digest created. It arrives at 8am IST.' : 'Digest created. It starts once you confirm your email.'));
});

dash.post('/digests/:id/delete', (req, res) => {
  db.prepare('DELETE FROM reg_digests WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/regdata?msg=Digest+deleted');
});

dash.post('/digests/:id/preview', rateLimit(10, 3600000), async (req, res) => {
  const d = db.prepare('SELECT * FROM reg_digests WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (d) await digest.sendOne({ ...d, last_sent: null }, { force: true });
  if (d) db.prepare('UPDATE reg_digests SET last_sent = ? WHERE id = ?').run(d.last_sent, d.id); // a preview doesn't change the schedule
  res.redirect('/dashboard/regdata?msg=' + encodeURIComponent('Preview sent to ' + req.user.email));
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

admin.post('/import', async (req, res) => {
  const lines = String(req.body.urls || '').split(/\s+/).filter(Boolean).slice(0, 2000);
  const r = await pipeline.importUrls(lines, { regulator: REGULATORS.includes(req.body.regulator) ? req.body.regulator : null });
  back(res, `Imported ${r.added} new documents (${r.skipped} already known, ${r.scanned} archive pages scanned).` + (r.errors.length ? ' Problems: ' + r.errors.slice(0, 3).join(' | ') : '') + ' They are processed 5 per minute.', 'pending');
});

// ---- manual correction of extracted data
const ENTITY_TYPES_ = require('../regdata/rules').ENTITY_TYPES;
const ACTION_TYPES_ = require('../regdata/rules').ACTION_TYPES;
const lines = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : null);

admin.get('/docs/:id/edit', (req, res, next) => {
  const d = db.prepare('SELECT * FROM reg_documents WHERE id = ?').get(req.params.id);
  if (!d) return next();
  const actions = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').all(d.id);
  res.render('regdata/edit', { title: 'Edit #' + d.id, d, actions, parse, APPLIES_TO, DOC_TYPES, ENTITY_TYPES: ENTITY_TYPES_, ACTION_TYPES: ACTION_TYPES_ });
});

admin.post('/docs/:id/edit', (req, res, next) => {
  const d = db.prepare('SELECT * FROM reg_documents WHERE id = ?').get(req.params.id);
  if (!d) return next();
  const b = req.body;
  // Lines like "what | who | deadline | page"
  const obligations = lines(b.obligations).map((l) => { const [what, who, deadline, page] = l.split('|').map((x) => (x || '').trim()); return { what, who: who || 'Regulated entity', deadline: iso(deadline), page: parseInt(page, 10) || null }; }).filter((o) => o.what);
  const deadlines = lines(b.deadlines).map((l) => { const [date, ...what] = l.split('|').map((x) => x.trim()); return { date: iso(date), what: what.join(' | ') }; }).filter((x) => x.date && x.what);
  const parties = lines(b.parties).map((l) => {
    const [name, et, at, amount, date, ...reason] = l.split('|').map((x) => (x || '').trim());
    return { entity_name: name, entity_type: ENTITY_TYPES_.includes(et) ? et : 'other', action_type: ACTION_TYPES_.includes(at) ? at : 'other',
      amount_inr: parseInt(String(amount).replace(/[^0-9]/g, ''), 10) || null, action_date: iso(date), reason: reason.join(' | ') || null };
  }).filter((a) => a.entity_name);
  store.saveResult(d.id, {
    doc_type: DOC_TYPES.includes(b.doc_type) ? b.doc_type : d.doc_type, ref_no: String(b.ref_no || '').trim() || null,
    summary: String(b.summary || '').trim() || null, impact: ['high', 'medium', 'low'].includes(b.impact) ? b.impact : null,
    effective_date: iso(b.effective_date), applies_to: [].concat(b.applies_to || []).filter((x) => APPLIES_TO.includes(x)),
    topics: lines(String(b.topics || '').replace(/,/g, '\n')), obligations, deadlines, amends: lines(b.amends),
    enforcement_actions: parties, pdf_url: d.pdf_url, extraction: d.extraction || 'rules', model: d.model,
  });
  const title = String(b.title || '').trim();
  const pub = iso(b.published);
  db.prepare('UPDATE reg_documents SET title = COALESCE(?, title), published_at = COALESCE(?, published_at), review_status = ?, notified = 1 WHERE id = ?')
    .run(title || null, pub ? Date.parse(pub) : null, b.verify ? 'verified' : d.review_status, d.id);
  db.prepare('DELETE FROM reg_documents_fts WHERE rowid = ?').run(d.id);
  const nd = db.prepare('SELECT title, summary FROM reg_documents WHERE id = ?').get(d.id);
  db.prepare('INSERT INTO reg_documents_fts (rowid, title, summary) VALUES (?, ?, ?)').run(d.id, nd.title, nd.summary || '');
  back(res, `Saved #${d.id}${b.verify ? ' and marked verified' : ''}.`);
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

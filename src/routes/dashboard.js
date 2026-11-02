const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireUser, hashPassword, checkPassword } = require('../auth');
const { parseHttpUrl, isPublicUrl } = require('../safeurl');

const router = express.Router();
router.use(requireUser);

const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const count = (table, userId) => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ?`).get(userId).n;

router.get('/', (req, res) => {
  const u = req.user.id;
  res.render('dashboard/index', {
    title: 'Dashboard',
    counts: {
      monitors: count('monitors', u), links: count('links', u), invoices: count('invoices', u),
      bookings: db.prepare("SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND status = 'confirmed' AND created_at >= ?").get(u, monthStart()).n,
      submissions: db.prepare('SELECT COUNT(*) n FROM form_submissions WHERE form_id IN (SELECT id FROM forms WHERE user_id = ?) AND created_at >= ?').get(u, monthStart()).n,
      cardViews: db.prepare('SELECT COALESCE(SUM(views), 0) n FROM cards WHERE user_id = ?').get(u).n,
    },
    down: db.prepare("SELECT * FROM monitors WHERE user_id = ? AND status = 'down'").all(u),
    flash: req.query.msg || null,
  });
});

// ---------------- Uptime monitors ----------------
function monitorsPage(req, res, error = null) {
  const monitors = db.prepare('SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const history = {};
  for (const m of monitors) {
    history[m.id] = db.prepare('SELECT up, response_ms, checked_at, error FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 40').all(m.id).reverse();
  }
  res.status(error ? 400 : 200).render('dashboard/monitors', { title: 'Uptime monitors', monitors, history, error });
}

router.get('/monitors', (req, res) => monitorsPage(req, res));

router.post('/monitors', async (req, res) => {
  const limit = req.plan.limits.monitors;
  if (count('monitors', req.user.id) >= limit) {
    return monitorsPage(req, res, `Your ${req.plan.name} plan allows ${limit} monitors. Upgrade to add more.`);
  }
  const url = parseHttpUrl(req.body.url);
  if (!url) return monitorsPage(req, res, 'Enter a full URL starting with http:// or https://');
  if (!(await isPublicUrl(url))) return monitorsPage(req, res, 'That address is not reachable from the public internet.');
  const name = String(req.body.name || url.hostname).trim().slice(0, 80) || url.hostname;
  db.prepare('INSERT INTO monitors (user_id, name, url, created_at) VALUES (?,?,?,?)').run(req.user.id, name, url.href, Date.now());
  res.redirect('/dashboard/monitors');
});

router.post('/monitors/:id/delete', (req, res) => {
  db.prepare('DELETE FROM monitors WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/monitors');
});

// ---------------- Short links ----------------
function linksPage(req, res, error = null) {
  const links = db.prepare('SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.status(error ? 400 : 200).render('dashboard/links', { title: 'Short links', links, error });
}

function createLink(userId, target, custom) {
  let code = custom ? String(custom).trim() : '';
  if (code) {
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(code)) return { error: 'Custom code: 3–40 letters, numbers, - or _' };
    if (db.prepare('SELECT 1 FROM links WHERE code = ?').get(code)) return { error: 'That custom code is taken.' };
  } else {
    do { code = crypto.randomBytes(5).toString('base64url').slice(0, 7); }
    while (db.prepare('SELECT 1 FROM links WHERE code = ?').get(code));
  }
  db.prepare('INSERT INTO links (user_id, code, target, created_at) VALUES (?,?,?,?)').run(userId, code, target, Date.now());
  return { code };
}

router.get('/links', (req, res) => linksPage(req, res));
router.post('/links', (req, res) => {
  if (count('links', req.user.id) >= req.plan.limits.links) {
    return linksPage(req, res, `Your ${req.plan.name} plan allows ${req.plan.limits.links} links. Upgrade for more.`);
  }
  const url = parseHttpUrl(req.body.url);
  if (!url) return linksPage(req, res, 'Enter a full URL starting with http:// or https://');
  const custom = req.plan.id === 'free' ? '' : req.body.code;
  const r = createLink(req.user.id, url.href, custom);
  if (r.error) return linksPage(req, res, r.error);
  res.redirect('/dashboard/links');
});
router.post('/links/:id/delete', (req, res) => {
  db.prepare('DELETE FROM links WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/links');
});

// ---------------- Invoices ----------------
router.get('/invoices', (req, res) => {
  const invoices = db.prepare('SELECT id, number, client, total, currency, updated_at FROM invoices WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.render('dashboard/invoices', { title: 'Saved invoices', invoices });
});

router.post('/invoices/save', express.json({ limit: '200kb' }), (req, res) => {
  const d = req.body || {};
  const number = String(d.number || '').slice(0, 50);
  const client = String(d.client?.name || 'Client').slice(0, 200);
  const total = Number(d.total) || 0;
  const currency = ['INR', 'USD', 'EUR', 'GBP', 'AED'].includes(d.currency) ? d.currency : 'INR';
  const data = JSON.stringify(d);
  const id = Number(d.id) || 0;

  if (id) {
    const r = db.prepare('UPDATE invoices SET number=?, client=?, total=?, currency=?, data=?, updated_at=? WHERE id=? AND user_id=?')
      .run(number, client, total, currency, data, Date.now(), id, req.user.id);
    if (r.changes) return res.json({ ok: true, id });
  }
  const limit = req.plan.limits.savedInvoices;
  if (count('invoices', req.user.id) >= limit) {
    return res.status(402).json({ ok: false, error: `Free plan saves up to ${limit} invoices. Upgrade to Pro for unlimited.` });
  }
  const info = db.prepare('INSERT INTO invoices (user_id, number, client, total, currency, data, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, number, client, total, currency, data, Date.now());
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.post('/invoices/:id/delete', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/invoices');
});

// ---------------- Account ----------------
function accountPage(req, res, msg = null, error = null) {
  const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.render('dashboard/account', { title: 'Account & billing', payments, me: user, msg, error });
}

router.get('/account', (req, res) => accountPage(req, res, req.query.msg || null));

router.post('/account/api-key', (req, res) => {
  if (!req.plan.limits.apiAccess) return accountPage(req, res, null, 'API access is part of Pro and Business.');
  db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run('dvk_' + crypto.randomBytes(24).toString('hex'), req.user.id);
  accountPage(req, res, 'New API key created. The old key no longer works.');
});

router.post('/account/status-slug', (req, res) => {
  if (!req.plan.limits.statusPage) return accountPage(req, res, null, 'Public status pages are part of Pro and Business.');
  const slug = String(req.body.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return accountPage(req, res, null, 'Status page name: 3–40 lowercase letters, numbers or -');
  const taken = db.prepare('SELECT id FROM users WHERE status_slug = ? AND id != ?').get(slug, req.user.id);
  if (taken) return accountPage(req, res, null, 'That name is taken.');
  db.prepare('UPDATE users SET status_slug = ? WHERE id = ?').run(slug, req.user.id);
  accountPage(req, res, 'Status page saved.');
});

router.post('/account/password', async (req, res) => {
  const { current = '', next = '' } = req.body;
  if (!(await checkPassword(current, req.user.password_hash))) return accountPage(req, res, null, 'Current password is wrong.');
  if (next.length < 8) return accountPage(req, res, null, 'New password must be at least 8 characters.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user.id);
  accountPage(req, res, 'Password changed.');
});

module.exports = router;
module.exports.createLink = createLink;

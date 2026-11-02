// JSON API for Pro/Business customers: Authorization: Bearer <api key>
const express = require('express');
const db = require('../db');
const config = require('../config');
const { effectivePlan } = require('../plans');
const { parseHttpUrl } = require('../safeurl');
const { createLink } = require('./dashboard');

const router = express.Router();
router.use(express.json({ limit: '20kb' }));

router.use((req, res, next) => {
  const key = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = key && db.prepare('SELECT * FROM users WHERE api_key = ?').get(key);
  if (!user) return res.status(401).json({ error: 'Invalid API key' });
  const plan = effectivePlan(user);
  if (!plan.limits.apiAccess) return res.status(402).json({ error: 'API access needs a Pro or Business plan' });
  req.apiUser = user;
  req.apiPlan = plan;
  next();
});

router.get('/monitors', (req, res) => {
  const rows = db.prepare('SELECT id, name, url, status, last_checked, last_response_ms, checks_total, checks_up FROM monitors WHERE user_id = ?').all(req.apiUser.id);
  res.json({ monitors: rows.map((m) => ({ ...m, uptime: m.checks_total ? +(100 * m.checks_up / m.checks_total).toFixed(2) : null })) });
});

router.get('/links', (req, res) => {
  res.json({ links: db.prepare('SELECT code, target, clicks, created_at FROM links WHERE user_id = ?').all(req.apiUser.id)
    .map((l) => ({ ...l, short_url: `${config.baseUrl}/s/${l.code}` })) });
});

router.post('/links', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM links WHERE user_id = ?').get(req.apiUser.id).n;
  if (n >= req.apiPlan.limits.links) return res.status(402).json({ error: 'Link limit reached for your plan' });
  const url = parseHttpUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: 'url must be a full http(s) URL' });
  const r = createLink(req.apiUser.id, url.href, req.body.code);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json({ code: r.code, short_url: `${config.baseUrl}/s/${r.code}`, target: url.href });
});

module.exports = router;

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { effectivePlan } = require('./plans');

const SESSION_DAYS = 30;
const COOKIE = 'dv_session';

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_DAYS * 86400000,
    signed: true,
  });
}

function destroySession(req, res) {
  const token = req.signedCookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
}

// Attaches req.user / res.locals.user / res.locals.plan on every request.
function loadUser(req, res, next) {
  const token = req.signedCookies[COOKIE];
  let user = null;
  if (token) {
    user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                       WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now()) || null;
  }
  req.user = user;
  req.plan = effectivePlan(user);
  res.locals.user = user;
  res.locals.plan = req.plan;
  res.locals.isAdmin = !!(user && config.adminEmail && user.email === config.adminEmail);
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.isAdmin) return res.status(404).render('error', { title: 'Not found', message: 'Page not found.' });
  next();
}

// Blocks cross-site form posts (CSRF) by checking Origin/Referer on unsafe methods.
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Webhook, API and form endpoints are meant to be called from other sites.
  if (req.path === '/billing/webhook' || req.path.startsWith('/api/') || req.path.startsWith('/f/')) return next();
  const origin = req.get('origin') || req.get('referer') || '';
  const host = req.get('host');
  try {
    if (origin && new URL(origin).host === host) return next();
  } catch (_) { /* fall through */ }
  res.status(403).send('Cross-site request blocked.');
}

// Very small in-memory rate limiter for login/signup/contact.
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count++;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).send('Too many requests. Please try again later.');
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 600000).unref();

async function hashPassword(pw) { return bcrypt.hash(pw, 11); }
async function checkPassword(pw, hash) { return bcrypt.compare(pw, hash); }

module.exports = {
  createSession, destroySession, loadUser, requireUser, requireAdmin,
  sameOrigin, rateLimit, hashPassword, checkPassword,
};

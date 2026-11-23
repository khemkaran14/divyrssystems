// The Ultimate Style Guide: web server and API
// Node 22+ (uses the built-in node:sqlite module, so there are no native packages to compile).
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { DatabaseSync } = require('node:sqlite');

// ---------- config ----------
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const SESSION_DAYS = 60;
// Public address of the site, used in password-reset emails, e.g. https://style.example.com
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
// Outgoing email (optional). With Hostinger email: SMTP_HOST=smtp.hostinger.com SMTP_PORT=465
const SMTP = {
  host: process.env.SMTP_HOST || '', port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || ''
};
const EMAIL_ON = !!(SMTP.host && SMTP.from && PUBLIC_URL);
// Site identity for page titles, legal pages and search engines
const SITE = {
  SITE_NAME: process.env.SITE_NAME || 'The Ultimate Style Guide',
  CONTACT_EMAIL: process.env.CONTACT_EMAIL || '',
  GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION || '',
  PUBLIC_URL
};
const RESET_MINUTES = 60;          // emailed links
const ADMIN_RESET_HOURS = 24;      // links an admin creates and shares
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- database ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'styleguide.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  pass TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
  created TEXT NOT NULL, last_active TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vibe TEXT, bt TEXT, occ TEXT NOT NULL DEFAULT '[]', saved TEXT NOT NULL DEFAULT '[]', updated INTEGER
);
CREATE TABLE IF NOT EXISTS looks (
  id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS site (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT,
  message TEXT NOT NULL, created INTEGER NOT NULL, ip TEXT
);
CREATE TABLE IF NOT EXISTS resets (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
`);
const q = sql => db.prepare(sql);
const today = () => new Date().toISOString().slice(0, 10);

// ---------- passwords & sessions ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}
function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  q('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie('sg_session', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: SESSION_DAYS * 864e5, path: '/' });
  return token;
}
// The phone app sends "X-Client: mobile" and keeps the session token itself (Authorization: Bearer).
const isMobile = req => req.get('X-Client') === 'mobile';
const withToken = (req, payload, token) => (isMobile(req) ? Object.assign(payload, { token }) : payload);
function readBearer(req) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.authorization || '');
  return m ? m[1].toLowerCase() : null;
}
// Reset tokens: the link carries the token, the database only keeps its SHA-256.
const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function newResetToken(userId, ms) {
  const token = crypto.randomBytes(32).toString('hex');
  q('DELETE FROM resets WHERE user_id = ?').run(userId);
  q('INSERT INTO resets (hash, user_id, expires) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + ms);
  return token;
}
let mailer = null;
function sendMail(to, subject, text, replyTo) {
  if (!mailer) {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465,
      auth: SMTP.user ? { user: SMTP.user, pass: SMTP.pass } : undefined });
  }
  return mailer.sendMail({ from: `"${String(process.env.SITE_NAME || 'The Ultimate Style Guide').replace(/"/g, '')}" <${SMTP.from}>`, to, subject, text, replyTo });
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '400kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
// attach the signed-in user: a Bearer token (phone app) first, then the sg_session cookie (website)
app.use((req, res, next) => {
  const token = readBearer(req) || readCookie(req, 'sg_session');
  if (token) {
    const row = q('SELECT u.id, u.email, u.name, u.role, u.created, u.last_active, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
    if (row && row.expires > Date.now()) {
      req.user = row; req.token = token;
      if (row.last_active !== today()) q('UPDATE users SET last_active = ? WHERE id = ?').run(today(), row.id);
    } else if (row) q('DELETE FROM sessions WHERE token = ?').run(token);
  }
  next();
});
// Block cross-site form/fetch posts: a browser always sends Origin on these.
app.use(['/api/', '/contact'], (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'Request blocked.' });
  }
  next();
});
const need = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in.' });
const needAdmin = (req, res, next) => req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/', apiLimiter);

const cleanEmail = e => String(e || '').trim().toLowerCase();
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const arr = (v, max = 100) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length <= 40).slice(0, max) : [];
const pick = (v, allowed) => allowed.includes(v) ? v : null;
const VIBES = ['ethnic', 'western', 'fusion'], BTS = ['petite', 'slim', 'regular', 'curvy', 'plus', 'tall'];

function mePayload(user) {
  if (!user) return { user: null };
  const p = q('SELECT vibe, bt, occ, saved, updated FROM profiles WHERE user_id = ?').get(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, admin: user.role === 'admin', created: user.created },
    profile: p ? { vibe: p.vibe, bt: p.bt, occ: JSON.parse(p.occ), saved: JSON.parse(p.saved), created: user.created } : null
  };
}

// ---------- auth ----------
app.post('/api/auth/signup', authLimiter, (req, res) => {
  const email = cleanEmail(req.body.email), name = String(req.body.name || '').trim().slice(0, 60), pw = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!okEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (pw.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  if (q('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  // With ADMIN_EMAILS set, only those emails become admin. Without it, the first account does.
  const first = !ADMIN_EMAILS.length && !q('SELECT 1 FROM users LIMIT 1').get();
  const role = first || ADMIN_EMAILS.includes(email) ? 'admin' : 'member';
  const id = 'u_' + crypto.randomBytes(12).toString('hex');
  q('INSERT INTO users (id, email, name, pass, role, created, last_active) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, name, hashPassword(pw), role, today(), today());
  const token = newSession(res, id);
  res.json(withToken(req, mePayload(q('SELECT * FROM users WHERE id = ?').get(id)), token));
});
app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = cleanEmail(req.body.email), pw = String(req.body.password || '');
  const u = q('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !checkPassword(pw, u.pass)) return res.status(401).json({ error: 'That email and password don’t match.' });
  if (ADMIN_EMAILS.includes(email) && u.role !== 'admin') q('UPDATE users SET role = ? WHERE id = ?').run('admin', u.id), u.role = 'admin';
  const token = newSession(res, u.id);
  res.json(withToken(req, mePayload(u), token));
});
app.post('/api/auth/logout', (req, res) => {
  if (req.token) q('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.clearCookie('sg_session', { path: '/' });
  res.json({ ok: true });
});
app.post('/api/auth/password', need, authLimiter, (req, res) => {
  const u = q('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!checkPassword(String(req.body.current || ''), u.pass)) return res.status(400).json({ error: 'Your current password is wrong.' });
  const pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  q('UPDATE users SET pass = ? WHERE id = ?').run(hashPassword(pw), u.id);
  q('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, req.token);
  res.json({ ok: true });
});
app.get('/api/auth/options', (req, res) => res.json({ emailReset: EMAIL_ON }));
app.post('/api/auth/forgot', authLimiter, async (req, res) => {
  if (!EMAIL_ON) return res.status(400).json({ error: 'Email resets aren’t set up on this site yet. Ask the site admin for a reset link.' });
  const email = cleanEmail(req.body.email);
  if (!okEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const u = q('SELECT id, name, email FROM users WHERE email = ?').get(email);
  // Same answer whether or not the account exists, so emails can't be probed.
  res.json({ ok: true });
  if (!u) return;
  const link = `${PUBLIC_URL}/?reset=${newResetToken(u.id, RESET_MINUTES * 6e4)}`;
  sendMail(u.email, 'Reset your password',
    `Hi ${u.name},\n\nSomeone (hopefully you) asked to reset the password for your Ultimate Style Guide account.\n\nChoose a new password here (the link works for ${RESET_MINUTES} minutes):\n${link}\n\nIf you didn't ask for this, ignore this email. Your password won't change.\n`
  ).catch(e => console.error('Reset email failed:', e.message));
});
app.post('/api/auth/reset', authLimiter, (req, res) => {
  const row = q('SELECT user_id, expires FROM resets WHERE hash = ?').get(sha256(req.body.token || ''));
  if (!row || row.expires < Date.now()) return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.' });
  const pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  q('UPDATE users SET pass = ? WHERE id = ?').run(hashPassword(pw), row.user_id);
  q('DELETE FROM resets WHERE user_id = ?').run(row.user_id);
  q('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  const token = newSession(res, row.user_id);
  res.json(withToken(req, mePayload(q('SELECT * FROM users WHERE id = ?').get(row.user_id)), token));
});
app.get('/api/me', (req, res) => res.json(mePayload(req.user)));
// Lets the phone app show a friendly offline state.
const VERSION = (() => { try { return require('./package.json').version; } catch (e) { return '1.0.0'; } })();
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

// ---------- profile, hearts, saved looks ----------
app.put('/api/profile', need, (req, res) => {
  const vibe = pick(req.body.vibe, VIBES) || 'fusion', bt = pick(req.body.bt, BTS) || 'regular', occ = JSON.stringify(arr(req.body.occ, 20));
  const saved = req.body.saved !== undefined ? JSON.stringify(arr(req.body.saved, 200)) : null;
  const exists = q('SELECT 1 FROM profiles WHERE user_id = ?').get(req.user.id);
  if (exists) q('UPDATE profiles SET vibe = ?, bt = ?, occ = ?, saved = COALESCE(?, saved), updated = ? WHERE user_id = ?').run(vibe, bt, occ, saved, Date.now(), req.user.id);
  else q('INSERT INTO profiles (user_id, vibe, bt, occ, saved, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, vibe, bt, occ, saved || '[]', Date.now());
  res.json(mePayload(req.user));
});
app.put('/api/saved', need, (req, res) => {
  const saved = JSON.stringify(arr(req.body.saved, 200));
  const r = q('UPDATE profiles SET saved = ?, updated = ? WHERE user_id = ?').run(saved, Date.now(), req.user.id);
  if (!r.changes) q('INSERT INTO profiles (user_id, vibe, bt, occ, saved, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, null, null, '[]', saved, Date.now());
  res.json({ ok: true });
});
app.get('/api/looks', need, (req, res) => {
  res.json({ looks: q('SELECT data FROM looks WHERE user_id = ? ORDER BY t DESC LIMIT 50').all(req.user.id).map(r => JSON.parse(r.data)) });
});
app.post('/api/looks', need, (req, res) => {
  const lk = req.body || {};
  const lid = String(lk.lid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!lid) return res.status(400).json({ error: 'Missing look id.' });
  const body = JSON.stringify(lk);
  if (body.length > 300000) return res.status(413).json({ error: 'That look is too large to save.' });
  const count = q('SELECT COUNT(*) AS n FROM looks WHERE user_id = ?').get(req.user.id).n;
  if (count >= 50 && !q('SELECT 1 FROM looks WHERE user_id = ? AND id = ?').get(req.user.id, lid)) return res.status(409).json({ error: 'You can keep up to 50 saved looks. Delete one to save another.' });
  q('INSERT INTO looks (id, user_id, data, t) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data, t = excluded.t').run(lid, req.user.id, body, Date.now());
  res.json({ ok: true });
});
app.delete('/api/looks/:lid', need, (req, res) => {
  q('DELETE FROM looks WHERE user_id = ? AND id = ?').run(req.user.id, String(req.params.lid));
  res.json({ ok: true });
});
app.delete('/api/account', need, (req, res) => {
  q('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
  q('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.clearCookie('sg_session', { path: '/' });
  res.json({ ok: true });
});

// ---------- site settings ----------
const siteDefaults = { hidden: [], featured: [], announce: '', announceOn: false };
app.get('/api/site', (req, res) => {
  const row = q('SELECT value FROM site WHERE key = ?').get('config');
  res.json(Object.assign({}, siteDefaults, row ? JSON.parse(row.value) : {}));
});
app.put('/api/site', needAdmin, (req, res) => {
  const b = req.body || {};
  const cfg = { announce: String(b.announce || '').slice(0, 200), announceOn: !!b.announceOn, featured: arr(b.featured, 8), hidden: arr(b.hidden, 100), updated: Date.now() };
  q('INSERT INTO site (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('config', JSON.stringify(cfg));
  res.json(cfg);
});

// ---------- admin ----------
app.get('/api/admin/members', needAdmin, (req, res) => {
  const rows = q(`SELECT u.id, u.name, u.email, u.role, u.created, u.last_active, p.vibe, p.bt, p.saved,
    (SELECT COUNT(*) FROM looks l WHERE l.user_id = u.id) AS looks
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created DESC, u.rowid DESC`).all();
  res.json({ members: rows.map(r => ({ id: r.id, name: r.name, email: r.email, admin: r.role === 'admin', joined: r.created, lastActive: r.last_active, vibe: r.vibe, bt: r.bt, saved: r.saved ? JSON.parse(r.saved) : [], looks: r.looks })) });
});
app.patch('/api/admin/members/:id', needAdmin, (req, res) => {
  const role = req.body.admin ? 'admin' : 'member';
  if (req.params.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'You can’t remove your own admin access.' });
  q('UPDATE users SET role = ? WHERE id = ?').run(role, String(req.params.id));
  res.json({ ok: true });
});
app.post('/api/admin/members/:id/reset', needAdmin, (req, res) => {
  const u = q('SELECT id FROM users WHERE id = ?').get(String(req.params.id));
  if (!u) return res.status(404).json({ error: 'Member not found.' });
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ link: `${base}/?reset=${newResetToken(u.id, ADMIN_RESET_HOURS * 36e5)}`, hours: ADMIN_RESET_HOURS });
});
app.delete('/api/admin/members/:id', needAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Delete your own account from My account instead.' });
  q('DELETE FROM users WHERE id = ?').run(String(req.params.id));
  res.json({ ok: true });
});
app.get('/api/admin/export.csv', needAdmin, (req, res) => {
  const rows = q('SELECT u.name, u.email, u.created, u.last_active, p.vibe, p.bt FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created').all();
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
  res.send(['name,email,joined,last_active,style,body_type', ...rows.map(r => [r.name, r.email, r.created, r.last_active, r.vibe, r.bt].map(esc).join(','))].join('\n'));
});

app.get('/api/admin/messages', needAdmin, (req, res) => {
  res.json({ messages: q('SELECT id, name, email, topic, message, created FROM messages ORDER BY id DESC LIMIT 500').all() });
});
app.delete('/api/admin/messages/:id', needAdmin, (req, res) => {
  q('DELETE FROM messages WHERE id = ?').run(Number(req.params.id) || 0);
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- static files ----------
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '30d', immutable: false, setHeaders: (res, file) => { if (/\.(js|css)$/.test(file)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d', index: false }));

// ---------- pages for people and search engines ----------
const siteHidden = () => { const r = q('SELECT value FROM site WHERE key = ?').get('config'); return r ? (JSON.parse(r.value).hidden || []) : []; };
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: 'Too many messages. Please try again later.' });
app.use('/contact', express.urlencoded({ extended: false, limit: '20kb' }));
const notFound = require('./pages')(app, {
  cfg: SITE, hiddenLooks: siteHidden, contactLimiter,
  async saveMessage(m, req) {
    q('INSERT INTO messages (name, email, topic, message, created, ip) VALUES (?, ?, ?, ?, ?, ?)').run(m.name, m.email, m.topic, m.message, Date.now(), req.ip || '');
    const to = SITE.CONTACT_EMAIL || ADMIN_EMAILS[0];
    if (EMAIL_ON && to) {
      sendMail(to, `[${SITE.SITE_NAME}] ${m.topic || 'Message'} from ${m.name}`,
        `${m.message}\n\n--\nFrom: ${m.name} <${m.email}>\nReply to this email to answer them.`, m.email)
        .catch(e => console.error('Contact email failed:', e.message));
    }
  }
});

// The app's home page, with search and sharing tags added
const homeTemplate = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
app.get('/', (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const N = SITE.SITE_NAME;
  const title = `${N}: Indian, Fusion & Western Outfit Ideas for Women`;
  const desc = 'Outfit ideas for every occasion: sarees, lehengas, sharara sets, Indo-western fusion and western looks, with a style quiz, colour combinations and a Dressing Room to try on and recolour outfits.';
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: N, url: base + '/', inLanguage: 'en-IN', description: desc },
    { '@context': 'https://schema.org', '@type': 'Organization', name: N, url: base + '/', logo: base + '/icon-512.png', ...(SITE.CONTACT_EMAIL ? { email: SITE.CONTACT_EMAIL } : {}) }
  ];
  const seo = `<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${e(base)}/">
<meta property="og:site_name" content="${e(N)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:url" content="${e(base)}/">
<meta property="og:image" content="${e(base)}/assets/img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
${app.locals.headCommon()}
${ld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}`;
  const html = homeTemplate.replace('<!--SEO-->', seo).replace('<!--FOOTER-->', app.locals.footerHTML());
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});
app.use(notFound);

// clean expired sessions daily
setInterval(() => {
  q('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  q('DELETE FROM resets WHERE expires < ?').run(Date.now());
  q('DELETE FROM messages WHERE created < ?').run(Date.now() - 365 * 864e5);
}, 36e5).unref();

if (require.main !== module) { module.exports = app; return; }
app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`Style guide running on http://127.0.0.1:${PORT}`);
  console.log(EMAIL_ON ? `Password-reset emails on (from ${SMTP.from})` : 'Password-reset emails off (admins can create reset links)');
});

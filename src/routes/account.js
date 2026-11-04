const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const config = require('../config');
const { sendMail } = require('../mailer');
const { createSession, destroySession, rateLimit, hashPassword, checkPassword } = require('../auth');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const router = express.Router();

// Only allow local redirects after login.
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/dashboard');

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('signup', { title: 'Create your free account', error: null, form: {}, next: req.query.next || '' });
});

router.post('/signup', rateLimit(10, 3600000), async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body.password || '');
  const render = (error) => res.status(400).render('signup', { title: 'Create your free account', error, form: { name, email }, next: req.body.next || '' });

  if (!name) return render('Please enter your name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return render('Please enter a valid email.');
  if (password.length < 8) return render('Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return render('An account with this email already exists. Try logging in.');

  const info = db.prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?,?,?,?)')
    .run(email, name, await hashPassword(password), Date.now());
  createSession(res, info.lastInsertRowid);
  sendMail({
    to: email,
    subject: 'Welcome to Divyrs Systems',
    text: `Hi ${name},\n\nYour account is ready.\n\n` +
      `• RegData API (regulatory changes & enforcement data): ${config.baseUrl}/dashboard/regdata\n` +
      `• Tools (invoices, booking page, business card, uptime & SSL, forms, links): ${config.baseUrl}/dashboard\n` +
      `• API docs: ${config.baseUrl}/regdata/docs\n\nQuestions? Just reply to this email.\n\n— ${config.business.name}\n`,
    replyTo: config.business.email,
  }).catch(() => {});
  res.redirect(safeNext(req.body.next));
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Log in', error: null, email: '', next: req.query.next || '' });
});

router.post('/login', rateLimit(10, 900000), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await checkPassword(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).render('login', { title: 'Log in', error: 'Wrong email or password.', email, next: req.body.next || '' });
  }
  createSession(res, user.id);
  res.redirect(safeNext(req.body.next));
});

// ---------------- password reset ----------------
router.get('/forgot', (req, res) => res.render('forgot', { title: 'Reset your password', sent: false }));

router.post('/forgot', rateLimit(5, 3600000), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND password_hash != '!'").get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), user.id, Date.now() + 3600000);
    await sendMail({
      to: user.email,
      subject: 'Reset your Divyrs password',
      text: `Hi ${user.name},\n\nUse this link within 1 hour to set a new password:\n${config.baseUrl}/reset/${token}\n\nIf you did not ask for this, ignore this email.\n`,
    });
  }
  // Same answer either way, so the form does not reveal who has an account.
  res.render('forgot', { title: 'Reset your password', sent: true });
});

function findReset(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) return null;
  return db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(sha256(token), Date.now()) || null;
}

router.get('/reset/:token', (req, res) => {
  const ok = !!findReset(req.params.token);
  res.render('reset', { title: 'Choose a new password', token: req.params.token, ok, error: null });
});

router.post('/reset/:token', rateLimit(10, 3600000), async (req, res) => {
  const r = findReset(req.params.token);
  if (!r) return res.render('reset', { title: 'Choose a new password', token: req.params.token, ok: false, error: null });
  const pw = String(req.body.password || '');
  if (pw.length < 8) return res.status(400).render('reset', { title: 'Choose a new password', token: req.params.token, ok: true, error: 'Password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(pw), r.user_id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(r.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(r.user_id); // sign out everywhere
  createSession(res, r.user_id);
  res.redirect('/dashboard?msg=' + encodeURIComponent('Password changed.'));
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

module.exports = router;

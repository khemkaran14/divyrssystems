const express = require('express');
const db = require('../db');
const { createSession, destroySession, rateLimit, hashPassword, checkPassword } = require('../auth');

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

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.redirect('/');
});

module.exports = router;

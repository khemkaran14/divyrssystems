// Owner-only page: who signed up, who paid, who wrote in. Set ADMIN_EMAIL in .env.
const express = require('express');
const db = require('../db');
const { requireUser, requireAdmin } = require('../auth');
const { PLANS } = require('../plans');

const router = express.Router();
router.use(requireUser, requireAdmin);

router.get('/', (req, res) => {
  const now = Date.now();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const revenue = db.prepare("SELECT currency, SUM(amount) total FROM payments WHERE status='paid' AND paid_at >= ? GROUP BY currency").all(monthStart.getTime());
  res.render('admin', {
    title: 'Admin',
    stats: {
      users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
      paying: db.prepare("SELECT COUNT(*) n FROM users WHERE plan != 'free' AND plan_expires > ?").get(now).n,
      monitors: db.prepare('SELECT COUNT(*) n FROM monitors').get().n,
      links: db.prepare('SELECT COUNT(*) n FROM links').get().n,
      cards: db.prepare('SELECT COUNT(*) n FROM cards').get().n,
      forms: db.prepare('SELECT COUNT(*) n FROM forms').get().n,
      bookings: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'").get().n,
      revenue,
    },
    users: db.prepare('SELECT id, name, email, plan, plan_expires, created_at FROM users ORDER BY created_at DESC LIMIT 100').all(),
    payments: db.prepare("SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status='paid' ORDER BY p.paid_at DESC LIMIT 100").all(),
    messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 100').all(),
    msg: req.query.msg || null,
  });
});

// Manual activation, e.g. a company paid by bank transfer / UPI.
router.post('/users/:id/plan', (req, res) => {
  const plan = PLANS[req.body.plan] ? req.body.plan : 'free';
  const days = Math.max(0, Math.min(3660, parseInt(req.body.days, 10) || 0));
  db.prepare('UPDATE users SET plan = ?, plan_expires = ? WHERE id = ?')
    .run(plan, plan === 'free' ? null : Date.now() + days * 86400000, req.params.id);
  res.redirect('/admin?msg=Plan+updated');
});

module.exports = router;

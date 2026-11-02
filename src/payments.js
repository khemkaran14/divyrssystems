// Razorpay Orders API. Razorpay accepts INR from Indian customers and, once
// "International payments" is enabled on your account, USD cards from abroad.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const enabled = () => !!(config.razorpay.keyId && config.razorpay.keySecret);

async function createOrder({ amount, currency, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
    // Razorpay amounts are in the smallest unit (paise / cents).
    body: JSON.stringify({ amount: amount * 100, currency, receipt, notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || 'Razorpay order failed');
  return data;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

// Marks an order paid and extends the user's plan. Safe to call twice
// (checkout callback + webhook both call it).
const markPaid = db.transaction((orderId, paymentId) => {
  const p = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
  if (!p || p.status === 'paid') return p;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.user_id);
  const now = Date.now();
  // Same plan still active: add time on top. Otherwise start from today.
  const base = user.plan === p.plan && user.plan_expires > now ? user.plan_expires : now;
  const expires = base + p.months * 30 * 86400000;
  db.prepare('UPDATE users SET plan = ?, plan_expires = ? WHERE id = ?').run(p.plan, expires, user.id);
  db.prepare("UPDATE payments SET status = 'paid', payment_id = ?, paid_at = ? WHERE id = ?").run(paymentId, now, p.id);
  return { ...p, status: 'paid' };
});

module.exports = { enabled, createOrder, verifyCheckoutSignature, verifyWebhookSignature, markPaid };

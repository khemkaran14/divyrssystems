const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const payments = require('../payments');
const { requireUser } = require('../auth');
const { CURRENCIES, priceFor, anyPlan } = require('../plans');
const { sendMail } = require('../mailer');
const { taxFor } = require('../gst');

const router = express.Router();

// Webhook needs the raw body for signature checks, so it is mounted before json parsing (see server.js).
async function webhook(req, res) {
  const sig = req.get('x-razorpay-signature') || '';
  if (!payments.verifyWebhookSignature(req.body, sig)) return res.status(400).send('bad signature');
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch (_) { return res.status(400).send('bad json'); }
  const entity = event?.payload?.payment?.entity;
  if (['payment.captured', 'order.paid'].includes(event.event) && entity?.order_id) {
    payments.markPaid(entity.order_id, entity.id);
  }
  res.json({ ok: true });
}

router.get('/checkout', requireUser, async (req, res) => {
  const plan = anyPlan(req.query.plan);
  const currency = CURRENCIES.includes(req.query.cur) ? req.query.cur : res.locals.cur;
  const months = req.query.months === '12' ? 12 : 1;
  if (!plan || plan.id === 'free' || plan.id === 'reg_free') return res.redirect(String(req.query.plan || '').startsWith('reg_') ? '/regdata#pricing' : '/pricing');

  if (!payments.enabled()) {
    return res.render('error', { title: 'Payments coming soon', message: 'Online payments are being set up. Please contact us to upgrade and we will activate your plan manually.' });
  }

  const base = priceFor(plan.id, currency, months);
  const t = taxFor(base, currency, req.user.billing_state);
  const amount = t.total;
  try {
    const order = await payments.createOrder({
      amount, currency,
      receipt: 'dv_' + req.user.id + '_' + crypto.randomBytes(4).toString('hex'),
      notes: { user_id: String(req.user.id), plan: plan.id, months: String(months) },
    });
    db.prepare('INSERT INTO payments (user_id, order_id, plan, months, amount, base_amount, tax_amount, currency, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, order.id, plan.id, months, amount, base, t.tax, currency, Date.now());
    res.render('checkout', { title: 'Checkout', plan, amount, tax: t, currency, months, order, keyId: config.razorpay.keyId });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(502).render('error', { title: 'Payment error', message: 'Could not start the payment. Please try again in a minute.' });
  }
});

router.post('/verify', requireUser, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body;
  const p = db.prepare('SELECT * FROM payments WHERE order_id = ? AND user_id = ?').get(orderId, req.user.id);
  if (!p || !payments.verifyCheckoutSignature(orderId, paymentId, sig)) {
    return res.status(400).render('error', { title: 'Payment not verified', message: 'We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded — contact us with your payment ID.' });
  }
  const before = p.status;
  payments.markPaid(orderId, paymentId);
  if (before !== 'paid') {
    const invoiceUrl = `${config.baseUrl}/dashboard/account/payments/${p.id}/invoice`;
    await sendMail({
      to: req.user.email,
      subject: `Payment received — ${anyPlan(p.plan).name} plan activated`,
      text: `Hi ${req.user.name},\n\nThanks for upgrading to Divyrs ${anyPlan(p.plan).name}.\n` +
        `Amount: ${p.currency} ${p.amount}\nPeriod: ${p.months} month(s)\nPayment ID: ${paymentId}\n\nInvoice: ${invoiceUrl}\n`,
    });
    if (config.adminEmail) {
      await sendMail({
        to: config.adminEmail,
        subject: `💰 New payment: ${p.currency} ${p.amount} — ${anyPlan(p.plan).name}`,
        text: `${req.user.name} <${req.user.email}>${req.user.company ? ' (' + req.user.company + ')' : ''} bought ${anyPlan(p.plan).name} for ${p.months} month(s).\nPayment ID: ${paymentId}\n${config.baseUrl}/admin\n`,
      });
    }
  }
  const back = p.plan.startsWith('reg_') ? '/dashboard/regdata' : '/dashboard/account';
  res.redirect(back + '?msg=' + encodeURIComponent('Payment successful. Your plan is active.'));
});

module.exports = router;
module.exports.webhook = webhook;

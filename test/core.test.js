// Run with: npm test
process.env.DB_PATH = ':memory:';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const db = require('../src/db');
const payments = require('../src/payments');
const { priceFor, effectivePlan } = require('../src/plans');
const { isPrivateIp, parseHttpUrl } = require('../src/safeurl');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');

test('prices: yearly is 10x monthly', () => {
  assert.strictEqual(priceFor('pro', 'INR', 1), 499);
  assert.strictEqual(priceFor('pro', 'USD', 12), 90);
  assert.strictEqual(priceFor('pro', 'EUR', 1), null);
});

test('expired paid plan falls back to free', () => {
  assert.strictEqual(effectivePlan({ plan: 'pro', plan_expires: Date.now() - 1 }).id, 'free');
  assert.strictEqual(effectivePlan({ plan: 'pro', plan_expires: Date.now() + 1e6 }).id, 'pro');
});

test('checkout and webhook signatures', () => {
  assert.ok(payments.verifyCheckoutSignature('order_1', 'pay_1', hmac('secret', 'order_1|pay_1')));
  assert.ok(!payments.verifyCheckoutSignature('order_1', 'pay_1', 'forged'));
  const body = Buffer.from('{"event":"payment.captured"}');
  assert.ok(payments.verifyWebhookSignature(body, hmac('whsec', body)));
  assert.ok(!payments.verifyWebhookSignature(body, hmac('wrong', body)));
});

test('markPaid activates plan once and stacks renewals', () => {
  const u = db.prepare("INSERT INTO users (email, name, password_hash, created_at) VALUES ('t@t.t','T','x',0)").run().lastInsertRowid;
  const add = (id) => db.prepare("INSERT INTO payments (user_id, order_id, plan, months, amount, currency, created_at) VALUES (?,?,?,?,?,?,0)").run(u, id, 'pro', 1, 499, 'INR');
  add('o1');
  payments.markPaid('o1', 'p1');
  payments.markPaid('o1', 'p1'); // duplicate (webhook + callback) must not add time twice
  const first = db.prepare('SELECT * FROM users WHERE id = ?').get(u);
  assert.strictEqual(first.plan, 'pro');
  const days = (first.plan_expires - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days <= 30);
  add('o2');
  payments.markPaid('o2', 'p2');
  const second = db.prepare('SELECT * FROM users WHERE id = ?').get(u);
  assert.ok(Math.abs(second.plan_expires - first.plan_expires - 30 * 86400000) < 1000);
});

test('private addresses are blocked for monitors', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.ok(isPrivateIp(ip), ip);
  }
  assert.ok(!isPrivateIp('8.8.8.8'));
  assert.strictEqual(parseHttpUrl('javascript:alert(1)'), null);
  assert.ok(parseHttpUrl('https://divyrs.com'));
});

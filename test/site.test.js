// Website completeness: pages, accounts, password reset, GST invoices, data export and deletion.
process.env.DB_PATH = ':memory:';
process.env.DISABLE_MONITOR = '1';
process.env.DISABLE_REGDATA = '1';

const test = require('node:test');
const assert = require('node:assert');

// Capture emails instead of sending them (patched before routes load).
const mailer = require('../src/mailer');
const mails = [];
mailer.sendMail = async (m) => { mails.push(m); };

const config = require('../src/config');
const app = require('../server');
const db = require('../src/db');
const gst = require('../src/gst');

let server;
let base;
test('start', async () => {
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

// Tiny browser: keeps cookies, sends same-origin headers on POST.
function browser() {
  let cookie = '';
  return async (path, { form, method } = {}) => {
    const opts = { method: method || (form ? 'POST' : 'GET'), redirect: 'manual', headers: { cookie } };
    if (form) { opts.headers['content-type'] = 'application/x-www-form-urlencoded'; opts.headers.origin = base; opts.body = new URLSearchParams(form).toString(); }
    const res = await fetch(base + path, opts);
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const name = kv.split('=')[0];
      cookie = cookie.split('; ').filter((x) => x && !x.startsWith(name + '=')).concat(kv).join('; ');
    }
    return res;
  };
}

test('public pages render', async () => {
  for (const p of ['/', '/about', '/pricing', '/security', '/regdata', '/regdata/status', '/regdata/docs', '/contact', '/forgot', '/privacy', '/terms', '/refund', '/login', '/signup']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
  }
  const pricing = await (await fetch(base + '/pricing')).text();
  assert.match(pricing, /RegData API/);
  assert.match(pricing, /Business tools/);
  const contact = await (await fetch(base + '/contact?topic=demo')).text();
  assert.match(contact, /<option value="demo" selected>/);
  const sec = await (await fetch(base + '/.well-known/security.txt')).text();
  assert.match(sec, /^Contact: mailto:/m);
  const og = await fetch(base + '/og.png');
  assert.strictEqual(og.headers.get('content-type'), 'image/png');
});

test('OpenAPI file is valid JSON describing the API', async () => {
  const spec = await (await fetch(base + '/regdata/openapi.json')).json();
  assert.strictEqual(spec.openapi, '3.1.0');
  for (const p of ['/changes', '/changes/{id}', '/enforcement', '/enforcement/screen', '/webhooks', '/usage']) assert.ok(spec.paths[p], p);
  assert.match(spec.servers[0].url, /\/api\/regdata\/v1$/);
});

test('sitemap lists regulatory change pages', async () => {
  require('../src/regdata/schema');
  const now = Date.now();
  db.prepare(`INSERT INTO reg_documents (regulator, guid, url, title, published_at, status, created_at, updated_at)
    VALUES ('RBI', 'g1', 'https://www.rbi.org.in/x', 'Test circular', ?, 'ready', ?, ?)`).run(now, now, now);
  const xml = await (await fetch(base + '/sitemap.xml')).text();
  assert.match(xml, /\/regdata\/changes\/\d+<\/loc>/);
  assert.match(xml, /\/security<\/loc>/);
});

test('sign-up sends a welcome email; contact form keeps the topic', async () => {
  const b = browser();
  const r = await b('/signup', { form: { name: 'Priya', email: 'priya@co.in', password: 'password123' } });
  assert.strictEqual(r.status, 302);
  assert.ok(mails.some((m) => m.to === 'priya@co.in' && /Welcome/.test(m.subject)));
  await b('/contact', { form: { name: 'Priya', email: 'priya@co.in', company: 'Co', topic: 'enterprise', message: 'We want a licence' } });
  assert.strictEqual(db.prepare('SELECT topic FROM messages ORDER BY id DESC').get().topic, 'enterprise');
  assert.ok(mails.some((m) => /^\[Enterprise/.test(m.subject)));
});

test('password reset works once and does not reveal accounts', async () => {
  const b = browser();
  mails.length = 0;
  const unknown = await (await b('/forgot', { form: { email: 'nobody@x.in' } })).text();
  assert.match(unknown, /If an account exists/);
  assert.strictEqual(mails.length, 0);

  await b('/forgot', { form: { email: 'priya@co.in' } });
  const link = mails[0].text.match(/\/reset\/([a-f0-9]{64})/);
  assert.ok(link, 'reset link emailed');
  assert.match(await (await b('/reset/' + link[1])).text(), /New password/);
  const done = await b('/reset/' + link[1], { form: { password: 'newpassword456' } });
  assert.strictEqual(done.status, 302);
  // Link is single-use.
  assert.match(await (await b('/reset/' + link[1])).text(), /expired or was already used/);
  // New password works, old one doesn't.
  const b2 = browser();
  assert.strictEqual((await b2('/login', { form: { email: 'priya@co.in', password: 'password123' } })).status, 401);
  assert.strictEqual((await b2('/login', { form: { email: 'priya@co.in', password: 'newpassword456' } })).status, 302);
});

test('GST calculation and invoice numbers', () => {
  const saved = { ...config.business };
  Object.assign(config.business, { gstin: '27ABCDE1234F1Z5', state: 'MH', gstRate: 18 });
  assert.deepStrictEqual(gst.taxFor(14999, 'INR', 'MH'), { base: 14999, tax: 2700, total: 17699, rate: 18, mode: 'intra' });
  assert.strictEqual(gst.taxFor(14999, 'INR', 'KA').mode, 'inter');
  assert.strictEqual(gst.taxFor(179, 'USD', null).tax, 0);
  Object.assign(config.business, saved);
  assert.strictEqual(gst.taxFor(499, 'INR', 'MH').tax, saved.gstRate ? Math.round(499 * saved.gstRate / 100) : 0);
  assert.strictEqual(gst.financialYear(Date.UTC(2026, 2, 31)), '2025-26');
  assert.strictEqual(gst.financialYear(Date.UTC(2026, 3, 1)), '2026-27');
  assert.ok(gst.GSTIN_RE.test('27ABCDE1234F1Z5'));
  assert.ok(!gst.GSTIN_RE.test('27ABCDE1234'));
});

test('billing details, invoice page, data export and account deletion', async () => {
  const b = browser();
  await b('/login', { form: { email: 'priya@co.in', password: 'newpassword456' } });
  const bad = await (await b('/dashboard/account/billing', { form: { company: 'Co', gstin: 'NOTVALID' } })).text();
  assert.match(bad, /GSTIN does not look right/);
  await b('/dashboard/account/billing', { form: { company: 'Priya Fintech Pvt Ltd', gstin: '27abcde1234f1z5', billing_state: 'MH', billing_address: 'Pune' } });
  const me = db.prepare("SELECT * FROM users WHERE email = 'priya@co.in'").get();
  assert.strictEqual(me.gstin, '27ABCDE1234F1Z5');

  // A paid order gets an invoice number and a printable invoice.
  const payments = require('../src/payments');
  db.prepare("INSERT INTO payments (user_id, order_id, plan, months, amount, base_amount, tax_amount, currency, created_at) VALUES (?, 'o1', 'reg_starter', 1, 17699, 14999, 2700, 'INR', 0)").run(me.id);
  payments.markPaid('o1', 'pay_1');
  const pay = db.prepare("SELECT * FROM payments WHERE order_id = 'o1'").get();
  assert.match(pay.invoice_no, /^DIV\/\d{4}-\d{2}\/0001$/);
  const inv = await (await b(`/dashboard/account/payments/${pay.id}/invoice`)).text();
  assert.match(inv, /Priya Fintech Pvt Ltd/);
  assert.match(inv, /27ABCDE1234F1Z5/);
  assert.match(inv, /Starter/);
  // Someone else can't open it.
  const other = browser();
  await other('/signup', { form: { name: 'Eve', email: 'eve@x.in', password: 'password123' } });
  assert.strictEqual((await other(`/dashboard/account/payments/${pay.id}/invoice`)).status, 404);

  const exp = await b('/dashboard/account/export');
  assert.match(exp.headers.get('content-disposition'), /divyrs-my-data\.json/);
  const data = await exp.json();
  assert.strictEqual(data.account.email, 'priya@co.in');
  assert.strictEqual(data.payments.length, 1);

  // Wrong password: nothing happens.
  assert.match(await (await b('/dashboard/account/delete', { form: { password: 'wrong', confirm: 'DELETE' } })).text(), /Password is wrong/);
  // With a paid invoice the account becomes an anonymous shell; the invoice survives.
  const del = await b('/dashboard/account/delete', { form: { password: 'newpassword456', confirm: 'delete' } });
  assert.strictEqual(del.headers.get('location'), '/?deleted=1');
  const shell = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
  assert.strictEqual(shell.name, 'Deleted user');
  assert.notStrictEqual(shell.email, 'priya@co.in');
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM payments WHERE user_id = ? AND status = 'paid'").get(me.id).n, 1);
  assert.strictEqual((await b('/dashboard')).status, 302); // signed out

  // Without payments the account is removed completely.
  const eve = db.prepare("SELECT id FROM users WHERE email = 'eve@x.in'").get();
  await other('/dashboard/account/delete', { form: { password: 'password123', confirm: 'DELETE' } });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM users WHERE id = ?').get(eve.id).n, 0);
});

test('stop', () => server.close());

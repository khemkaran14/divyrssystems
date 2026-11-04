// Production features: health, analytics, email verification, digests, newsletter, export, back-fill, admin edit, alerts.
process.env.DB_PATH = ':memory:';
process.env.DISABLE_MONITOR = '1';
process.env.DISABLE_REGDATA = '1';
process.env.ADMIN_EMAIL = 'owner@divyrs.com';
delete process.env.ANTHROPIC_API_KEY;

const test = require('node:test');
const assert = require('node:assert');

const mailer = require('../src/mailer');
const mails = [];
mailer.sendMail = async (m) => { mails.push(m); return true; };

// Fake regulator site for back-fill tests; everything else goes to the real network stack (local server).
const realFetch = global.fetch;
const FAKE = {
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2': `<html><a href="https://www.sebi.gov.in/enforcement/orders/mar-2024/order-in-the-matter-of-alpha-traders_82000.html">Order in the matter of Alpha Traders Pvt. Ltd.</a>
     <a href="/legal/circulars/mar-2024/circular-on-margin-rules_82001.html">Circular on margin rules for brokers</a>
     <a href="https://example.com/not-a-doc.html">Elsewhere</a><a href="/about.html">About SEBI</a></html>`,
  'https://www.sebi.gov.in/enforcement/orders/mar-2024/order-in-the-matter-of-alpha-traders_82000.html': '<p>Date: 14.03.2024</p><p>A penalty of Rs. 2,00,000 is imposed.</p>',
  'https://www.sebi.gov.in/legal/circulars/mar-2024/circular-on-margin-rules_82001.html': '<p>March 20, 2024</p><p>All brokers shall …</p>',
};
global.fetch = async (url, opts) => {
  const u = String(url);
  if (FAKE[u]) return new Response(FAKE[u], { headers: { 'content-type': 'text/html' } });
  return realFetch(url, opts);
};

const app = require('../server');
const db = require('../src/db');
const store = require('../src/regdata/store');
const digest = require('../src/regdata/digest');
const pipeline = require('../src/regdata/pipeline');
const ops = require('../src/ops');

let server; let base;
test('start', async () => { await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); }); base = `http://127.0.0.1:${server.address().port}`; });

function browser(ua = 'Mozilla/5.0 Test') {
  let cookie = '';
  return async (path, { form, headers } = {}) => {
    const opts = { method: form ? 'POST' : 'GET', redirect: 'manual', headers: { cookie, 'user-agent': ua, ...(headers || {}) } };
    if (form) { opts.headers['content-type'] = 'application/x-www-form-urlencoded'; opts.headers.origin = base; opts.body = new URLSearchParams(form).toString(); }
    const res = await fetch(base + path, opts);
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const n = kv.split('=')[0]; cookie = cookie.split('; ').filter((x) => x && !x.startsWith(n + '=')).concat(kv).join('; '); }
    return res;
  };
}

function seedDoc(title, extra = {}) {
  const id = store.addDocument({ source_id: 'rbi-press', regulator: extra.regulator || 'RBI', guid: title, url: 'https://www.rbi.org.in/' + encodeURIComponent(title), title, published_at: extra.published_at || Date.now(), doc_type: 'circular', is_enforcement: 0 });
  store.saveResult(id, { doc_type: 'circular', summary: 'Summary of ' + title, impact: extra.impact || 'high', applies_to: extra.applies_to || ['nbfc'], obligations: [{ what: 'Do the thing', who: 'NBFC', deadline: '2027-01-01', page: 1 }], extraction: 'ai', enforcement_actions: extra.actions || [] });
  return id;
}

test('health check', async () => {
  const r = await fetch(base + '/healthz');
  assert.strictEqual(r.status, 200);
  const h = await r.json();
  assert.strictEqual(h.ok, true);
  assert.ok(Array.isArray(h.feeds));
});

test('page views are counted for people, not bots', async () => {
  await browser()('/regdata');
  await browser('Googlebot/2.1')('/regdata');
  await browser()('/regdata/changes/99999'); // 404 is not counted
  await new Promise((r) => setTimeout(r, 50));
  const row = db.prepare("SELECT SUM(views) v FROM page_views WHERE path = '/regdata'").get();
  assert.strictEqual(row.v, 1);
});

test('email verification gates API key creation', async () => {
  const b = browser();
  mails.length = 0;
  await b('/signup', { form: { name: 'Ravi', email: 'ravi@nbfc.in', password: 'password123' } });
  const link = mails.find((m) => m.to === 'ravi@nbfc.in').text.match(/\/verify\/([a-f0-9]{48})/);
  assert.ok(link, 'verification link in welcome email');
  await b('/dashboard/regdata/key', { form: {} });
  assert.strictEqual(db.prepare("SELECT reg_api_key FROM users WHERE email='ravi@nbfc.in'").get().reg_api_key, null);
  assert.match(await (await b('/dashboard/regdata')).text(), /Please confirm your email/);
  assert.strictEqual((await b('/verify/' + link[1])).status, 302);
  assert.strictEqual(db.prepare("SELECT email_verified FROM users WHERE email='ravi@nbfc.in'").get().email_verified, 1);
  await b('/dashboard/regdata/key', { form: {} });
  assert.match(db.prepare("SELECT reg_api_key FROM users WHERE email='ravi@nbfc.in'").get().reg_api_key, /^rdk_/);
  assert.strictEqual((await b('/verify/' + link[1])).status, 400); // single use
});

test('newsletter: double opt-in, weekly send, one-click unsubscribe', async () => {
  seedDoc('Digital lending amendments', { impact: 'high' });
  seedDoc('Minor data release', { impact: 'low' });
  mails.length = 0;
  const b = browser();
  assert.match(await (await b('/regdata/subscribe', { form: { email: 'reader@bank.in' } })).text(), /Check your inbox/);
  const token = mails[0].text.match(/digest\/confirm\/([a-f0-9]+)/)[1];
  assert.match(await (await b('/regdata/digest/confirm/' + token)).text(), /You're subscribed/);

  // Monday 9 Nov 2026, 08:05 IST
  mails.length = 0;
  const sent = await digest.runDue(Date.UTC(2026, 10, 9, 2, 35));
  assert.strictEqual(sent, 1);
  const m = mails[0];
  assert.strictEqual(m.to, 'reader@bank.in');
  assert.match(m.html, /Digital lending amendments/);
  assert.doesNotMatch(m.html, /Minor data release/); // free roundup: high & medium only
  assert.doesNotMatch(m.html, /Do the thing/); // obligations are for paid plans
  assert.match(m.headers['List-Unsubscribe'], /unsubscribe/);
  // Not sent twice the same morning, and not on Tuesday for weekly.
  assert.strictEqual(await digest.runDue(Date.UTC(2026, 10, 9, 2, 45)), 0);
  assert.strictEqual(await digest.runDue(Date.UTC(2026, 10, 10, 2, 35)), 0);
  // Email clients unsubscribe with a cross-site POST.
  const r = await fetch(base + '/regdata/digest/unsubscribe/' + token, { method: 'POST', headers: { origin: 'https://mail.google.com' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM reg_digests WHERE token = ?').get(token).n, 0);
});

test('paid daily digest includes obligations and watchlist hits', async () => {
  const user = db.prepare("SELECT * FROM users WHERE email='ravi@nbfc.in'").get();
  db.prepare("UPDATE users SET reg_plan='reg_starter', reg_plan_expires=? WHERE id=?").run(Date.now() + 86400000, user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  assert.ok(digest.createForUser(u, { frequency: 'daily', regulators: ['RBI'], watchlist: ['Sunrise Fincorp'] }).ok);
  seedDoc('RBI cancels registration of Sunrise Fincorp Private Limited', { actions: [{ entity_name: 'Sunrise Fincorp Private Limited', entity_type: 'nbfc', action_type: 'licence_cancellation', action_date: new Date().toISOString().slice(0, 10) }] });
  mails.length = 0;
  const sub = db.prepare('SELECT * FROM reg_digests WHERE user_id = ?').get(user.id);
  assert.ok(await digest.sendOne(sub));
  assert.match(mails[0].subject, /Watchlist match/);
  assert.match(mails[0].html, /Do the thing/);
  assert.match(mails[0].html, /Sunrise Fincorp/);
});

test('CSV export needs an account and protects against Excel formulas', async () => {
  assert.strictEqual((await browser()('/regdata/export/changes.csv')).status, 302);
  seedDoc('=HYPERLINK("http://evil")');
  const b = browser();
  await b('/login', { form: { email: 'ravi@nbfc.in', password: 'password123' } });
  const r = await b('/regdata/export/changes.csv');
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM so Excel reads ₹ and Hindi correctly
  const csv = bytes.toString('utf8');
  assert.ok(csv.includes('"published","regulator"'));
  assert.match(csv, /"'=HYPERLINK/);
  const e = await (await b('/regdata/export/enforcement.csv?name=Sunrise')).text();
  assert.match(e, /Sunrise Fincorp/);
});

test('back-fill from an archive page with real document dates', async () => {
  const r = await pipeline.importUrls(['https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2', 'https://example.com/x']);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.scanned, 1);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual((await pipeline.importUrls(['https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2'])).added, 0);
  await pipeline.processPending(10);
  const order = db.prepare("SELECT * FROM reg_documents WHERE url LIKE '%alpha-traders%'").get();
  assert.strictEqual(order.status, 'ready');
  assert.strictEqual(new Date(order.published_at).toISOString().slice(0, 10), '2024-03-14');
  assert.strictEqual(order.notified, 1);
  assert.strictEqual(order.title, 'Order in the matter of Alpha Traders Pvt. Ltd.');
  const act = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').get(order.id);
  assert.strictEqual(act.entity_name, 'Alpha Traders Pvt. Ltd');
  const circ = db.prepare("SELECT * FROM reg_documents WHERE url LIKE '%margin-rules%'").get();
  assert.strictEqual(new Date(circ.published_at).toISOString().slice(0, 10), '2024-03-20');
});

test('admin can correct extracted data', async () => {
  const b = browser();
  await b('/signup', { form: { name: 'Owner', email: 'owner@divyrs.com', password: 'password123' } });
  const id = seedDoc('Something to fix');
  assert.strictEqual((await b(`/admin/regdata/docs/${id}/edit`)).status, 200);
  await b(`/admin/regdata/docs/${id}/edit`, { form: {
    title: 'Fixed title about outsourcing', doc_type: 'circular', impact: 'medium', published: '2026-10-30', summary: 'Corrected summary.',
    obligations: 'Board must approve policy | Bank | 2027-03-31 | 4\nNotify RBI | Bank | | ', deadlines: '2027-03-31 | Board approval',
    parties: 'Beta Bank Ltd | bank | monetary_penalty | ₹5,00,000 | 2026-10-30 | Late reporting', verify: '1',
  } });
  const d = db.prepare('SELECT * FROM reg_documents WHERE id = ?').get(id);
  assert.strictEqual(d.title, 'Fixed title about outsourcing');
  assert.strictEqual(d.review_status, 'verified');
  assert.strictEqual(new Date(d.published_at).toISOString().slice(0, 10), '2026-10-30');
  const obl = JSON.parse(d.obligations);
  assert.deepStrictEqual(obl[0], { what: 'Board must approve policy', who: 'Bank', deadline: '2027-03-31', page: 4 });
  assert.strictEqual(obl[1].deadline, null);
  const a = db.prepare('SELECT * FROM reg_actions WHERE document_id = ?').get(id);
  assert.strictEqual(a.amount_inr, 500000);
  assert.strictEqual(store.listChanges({ q: 'outsourcing' }).rows[0].id, id); // search index updated
});

test('topic pages and sitemap', async () => {
  for (const p of ['/regdata/topics', '/regdata/topics/nbfc', '/regdata/topics/sebi-orders', '/regdata/topics/digital-lending']) {
    assert.strictEqual((await fetch(base + p)).status, 200, p);
  }
  assert.strictEqual((await fetch(base + '/regdata/topics/nope')).status, 404);
  assert.match(await (await fetch(base + '/regdata/topics/digital-lending')).text(), /Digital lending amendments/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/regdata\/topics\/nbfc</);
});

test('owner alerts are de-duplicated; daily report goes out at 9am IST', async () => {
  mails.length = 0;
  assert.strictEqual(await ops.alertOwner('t1', 'Test', 'x'), true);
  assert.strictEqual(await ops.alertOwner('t1', 'Test', 'x'), false);
  assert.strictEqual(await ops.dailyReport(Date.UTC(2026, 10, 9, 1, 0)), false); // 06:30 IST
  assert.strictEqual(await ops.dailyReport(Date.UTC(2026, 10, 9, 3, 40)), true); // 09:10 IST
  const rep = mails.find((m) => /Daily report/.test(m.subject));
  assert.strictEqual(rep.to, 'owner@divyrs.com');
  assert.match(rep.text, /New sign-ups: \d+/);
});

test('stop', () => server.close());

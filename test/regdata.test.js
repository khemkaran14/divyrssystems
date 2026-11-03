// End-to-end tests for RegData with fake regulator websites and a fake Claude.
process.env.DB_PATH = ':memory:';
process.env.DISABLE_MONITOR = '1';
process.env.DISABLE_REGDATA = '1';
delete process.env.ANTHROPIC_API_KEY;

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');

// ---------------------------------------------------------------- fake internet
const realFetch = global.fetch;
const sent = [];
const PAGES = {
  'https://www.rbi.org.in/pressreleases_rss.xml': { body: fx('rbi-press.xml'), type: 'application/rss+xml' },
  'https://www.rbi.org.in/notifications_rss.xml': { body: fx('rbi-notifications.xml'), type: 'application/rss+xml' },
  'https://www.sebi.gov.in/sebirss.xml': { body: fx('sebi.xml'), type: 'application/rss+xml' },
  'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=70001': { body: '<html><body><p>The Reserve Bank has imposed a monetary penalty of ₹2.50 lakh on The Shree Ganesh Urban Co-operative Bank Ltd.</p><a href="https://rbidocs.rbi.org.in/rdocs/PressRelease/PDFs/PR70001.PDF">PDF</a></body></html>', type: 'text/html' },
  'https://rbidocs.rbi.org.in/rdocs/PressRelease/PDFs/PR70001.PDF': { body: '%PDF-1.4 fake', type: 'application/pdf' },
  'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=70002': { body: '<p>penalty of ₹75.00 lakh on HDFC Bank Limited</p>', type: 'text/html' },
  'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=70003': { body: '<p>Money supply data.</p><a href="https://evil.example.com/x.pdf">x</a>', type: 'text/html' },
  'https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13001': { body: '<p>All lenders shall disclose the APR.</p><a href="/rdocs/notification/PDFs/DL13001.PDF">pdf</a>', type: 'text/html' },
  'https://www.rbi.org.in/rdocs/notification/PDFs/DL13001.PDF': { body: '%PDF-1.7 fake digital lending', type: 'application/pdf' },
  'https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13002': { body: '<p>KYC amendment text.</p>', type: 'text/html' },
  'https://www.sebi.gov.in/enforcement/orders/nov-2026/adjudication-order-abc_90001.html': { body: "<iframe src='../../../web/?file=https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/90001.pdf'></iframe><p>a penalty of Rs. 5,00,000 is imposed</p>", type: 'text/html' },
  'https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/90001.pdf': { body: '%PDF-1.4 order', type: 'application/pdf' },
  'https://www.sebi.gov.in/legal/circulars/nov-2026/framework-cyber_90002.html': { body: '<p>Clarifications on CSCRF.</p>', type: 'text/html' },
};
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
  if (u.startsWith('https://93.184.216.34/')) { sent.push({ url: u, opts }); return new Response('ok', { status: 200 }); }
  const p = PAGES[u];
  if (!p) return new Response('not found', { status: 404 });
  return new Response(p.body, { status: 200, headers: { 'content-type': p.type } });
};

const pipeline = require('../src/regdata/pipeline');
const store = require('../src/regdata/store');
const ai = require('../src/regdata/extract');
const webhooks = require('../src/regdata/webhooks');
const { SOURCES } = require('../src/regdata/sources');
const db = store.db;

test('collects feeds, skips bad links, and does not duplicate', async () => {
  const r = await pipeline.collectAll();
  const bySource = Object.fromEntries(r.map((x) => [x.source, x]));
  assert.strictEqual(bySource['rbi-press'].added, 3); // javascript: link ignored
  assert.strictEqual(bySource['rbi-notifications'].added, 2);
  assert.strictEqual(bySource['sebi-all'].added, 2);
  const again = await pipeline.collectAll();
  assert.strictEqual(again.reduce((n, x) => n + x.added, 0), 0);
});

test('rules-only processing (no AI key) finds penalised parties and amounts', async () => {
  // Process everything except the digital lending circular, which the AI test handles.
  const keep = db.prepare("SELECT id FROM reg_documents WHERE title LIKE 'Digital Lending%'").get().id;
  db.prepare("UPDATE reg_documents SET status = 'hold' WHERE id = ?").run(keep);
  await pipeline.processPending(20);
  db.prepare("UPDATE reg_documents SET status = 'pending' WHERE id = ?").run(keep);

  const acts = db.prepare('SELECT * FROM reg_actions ORDER BY id').all();
  const byName = Object.fromEntries(acts.map((a) => [a.entity_name, a]));
  assert.ok(byName['The Shree Ganesh Urban Co-operative Bank Ltd'], JSON.stringify(acts.map((a) => a.entity_name)));
  assert.strictEqual(byName['The Shree Ganesh Urban Co-operative Bank Ltd'].amount_inr, 250000);
  assert.strictEqual(byName['HDFC Bank Limited'].amount_inr, 7500000);
  assert.strictEqual(byName['ABC Securities Pvt. Ltd'].amount_inr, 500000);
  assert.ok(byName['Mr. Ramesh Kumar']);
  // PDFs found from links and SEBI's embedded viewer; other hosts ignored.
  const sebiDoc = db.prepare("SELECT * FROM reg_documents WHERE regulator='SEBI' AND is_enforcement=1").get();
  assert.strictEqual(sebiDoc.pdf_url, 'https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/90001.pdf');
  const money = db.prepare("SELECT * FROM reg_documents WHERE title LIKE 'Money Supply%'").get();
  assert.strictEqual(money.pdf_url, null);
  assert.strictEqual(money.is_enforcement, 0);
});

test('AI extraction stores obligations and sends the PDF with fallbacks enabled', async () => {
  let request = null;
  ai.setClient({
    beta: {
      messages: {
        create: async (req) => {
          request = req;
          return {
            model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 300 },
            content: [{ type: 'text', text: JSON.stringify({
              doc_type: 'circular', ref_no: 'RBI/2026-27/112', summary: 'Lenders must disclose the APR.', impact: 'high', effective_date: '2027-01-01',
              applies_to: ['bank', 'nbfc', 'not_a_real_type'], topics: ['digital lending'],
              obligations: [{ what: 'Disclose APR in KFS', who: 'Lender', deadline: '2027-01-01', page: 3 }],
              deadlines: [{ what: 'Report apps', date: '2026-12-15' }, { what: 'bad', date: 'soon' }],
              amends: ['RBI/2022-23/111'], enforcement_actions: [],
            }) }],
          };
        },
      },
    },
  });
  await pipeline.processPending(5);
  ai.setClient(null);

  assert.ok(request, 'Claude was called');
  assert.strictEqual(request.model, 'claude-opus-5-5');
  assert.strictEqual(request.fallbacks, 'default');
  assert.deepStrictEqual(request.betas, ['server-side-fallback-2026-07-01']);
  assert.strictEqual(request.output_config.format.type, 'json_schema');
  assert.strictEqual(request.messages[0].content[0].type, 'document');

  const d = db.prepare("SELECT * FROM reg_documents WHERE title LIKE 'Digital Lending%'").get();
  assert.strictEqual(d.extraction, 'ai');
  assert.deepStrictEqual(JSON.parse(d.applies_to), ['bank', 'nbfc']); // unknown value dropped
  assert.strictEqual(JSON.parse(d.deadlines).length, 1); // bad date dropped
  assert.strictEqual(JSON.parse(d.obligations)[0].page, 3);
  assert.strictEqual(d.pdf_url, 'https://www.rbi.org.in/rdocs/notification/PDFs/DL13001.PDF');
  assert.strictEqual(db.prepare('SELECT runs FROM reg_ai_log').get().runs, 1);
});

test('fuzzy name search ranks the right party', () => {
  const r = store.searchActions({ name: 'Shree Ganesh Urban Coop Bank' });
  assert.ok(r.length >= 1);
  assert.match(r[0].entity_name, /Shree Ganesh/);
  assert.ok(r[0].match_confidence >= 0.8);
  assert.strictEqual(store.searchActions({ name: 'Totally Unrelated Widgets' }).length, 0);
  const h = store.searchActions({ name: 'hdfc bank ltd' });
  assert.strictEqual(h[0].entity_name, 'HDFC Bank Limited');
});

test('full-text search over changes', () => {
  const r = store.listChanges({ q: 'cybersecurity' });
  assert.strictEqual(r.rows.length, 1);
  assert.match(r.rows[0].title, /cybersecurity/i);
});

// ---------------------------------------------------------------- HTTP API
let server;
let base;
let userId;
let key;

test('API: start server and create a key', async () => {
  const app = require('../server');
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  userId = db.prepare("INSERT INTO users (email, name, password_hash, created_at) VALUES ('api@x.in','Api','x',0)").run().lastInsertRowid;
  key = 'rdk_' + crypto.randomBytes(8).toString('hex');
  db.prepare('UPDATE users SET reg_api_key = ? WHERE id = ?').run(key, userId);
});

const call = (p, opts = {}) => fetch(base + '/api/regdata/v1' + p, { ...opts, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });

test('API: rejects bad keys', async () => {
  const r = await fetch(base + '/api/regdata/v1/changes', { headers: { Authorization: 'Bearer rdk_nope' } });
  assert.strictEqual(r.status, 401);
  assert.strictEqual((await r.json()).error.code, 'invalid_api_key');
});

test('API: free plan sees data with a 7-day delay', async () => {
  const r = await (await call('/changes')).json();
  // Only the KYC master direction (15 Oct) is older than 7 days.
  assert.deepStrictEqual(r.data.map((d) => d.doc_type), ['master_direction']);
  assert.strictEqual(r.delayed_days, 7);
  const e = await (await call('/enforcement?name=HDFC%20Bank')).json();
  assert.strictEqual(e.data.length, 0);
});

test('API: paid plan gets live data, filters, pagination and screening', async () => {
  db.prepare("UPDATE users SET reg_plan = 'reg_starter', reg_plan_expires = ? WHERE id = ?").run(Date.now() + 86400000, userId);
  const all = await (await call('/changes?limit=2')).json();
  assert.strictEqual(all.data.length, 2);
  assert.ok(all.next_cursor);
  const page2 = await (await call('/changes?limit=2&cursor=' + all.next_cursor)).json();
  assert.ok(page2.data.length >= 1);
  assert.ok(!page2.data.some((d) => all.data.some((x) => x.id === d.id)));

  const nbfc = await (await call('/changes?applies_to=nbfc&impact=high')).json();
  assert.strictEqual(nbfc.data.length, 1);
  assert.strictEqual(nbfc.data[0].obligations[0].what, 'Disclose APR in KFS');

  const enf = await (await call('/changes?enforcement=true&regulator=RBI')).json();
  assert.strictEqual(enf.data.length, 2);

  const one = await (await call('/changes/' + enf.data[0].id)).json();
  assert.ok(one.data.enforcement_actions.length >= 1);

  const s = await (await call('/enforcement/screen', { method: 'POST', body: JSON.stringify({ names: ['HDFC Bank Ltd', 'Unrelated Co'] }) })).json();
  assert.strictEqual(s.flagged, 1);
  assert.strictEqual(s.data[0].matches[0].amount_inr, 7500000);

  const usage = await (await call('/usage')).json();
  assert.ok(usage.calls >= 8); // the screen call counted 2
});

test('API: quota is enforced', async () => {
  db.prepare('UPDATE reg_usage SET calls = 10000 WHERE user_id = ?').run(userId);
  const r = await call('/changes');
  assert.strictEqual(r.status, 429);
  assert.strictEqual((await r.json()).error.code, 'quota_exceeded');
  db.prepare('UPDATE reg_usage SET calls = 0 WHERE user_id = ?').run(userId);
});

test('API: webhooks need a public https URL', async () => {
  const bad = await call('/webhooks', { method: 'POST', body: JSON.stringify({ url: 'https://127.0.0.1/x' }) });
  assert.strictEqual(bad.status, 400);
  const ok = await call('/webhooks', { method: 'POST', body: JSON.stringify({ url: 'https://93.184.216.34/hook', events: ['enforcement'], watchlist: ['New Penalised Bank'] }) });
  assert.strictEqual(ok.status, 201);
  const body = await ok.json();
  assert.match(body.data.secret, /^whsec_/);
});

test('webhooks: watchlist match sends a signed event', async () => {
  const hook = db.prepare('SELECT * FROM reg_webhooks WHERE user_id = ?').get(userId);
  const id = store.addDocument({ source_id: 'rbi-press', regulator: 'RBI', guid: 'g-new', url: 'https://www.rbi.org.in/new', title: 'RBI imposes monetary penalty on New Penalised Bank Ltd.', published_at: Date.now(), doc_type: 'press_release', is_enforcement: 1 });
  store.saveResult(id, { doc_type: 'press_release', extraction: 'rules', enforcement_actions: [{ entity_name: 'New Penalised Bank Ltd', entity_type: 'bank', action_type: 'monetary_penalty', amount_inr: 100000, action_date: '2026-11-03' }] });
  assert.strictEqual(webhooks.enqueueForDocument(id), 1);
  // A document without a watchlisted name sends nothing.
  const other = store.addDocument({ source_id: 'rbi-press', regulator: 'RBI', guid: 'g-other', url: 'https://www.rbi.org.in/o', title: 'RBI imposes monetary penalty on Someone Else Ltd.', published_at: Date.now(), doc_type: 'press_release', is_enforcement: 1 });
  store.saveResult(other, { doc_type: 'press_release', extraction: 'rules', enforcement_actions: [{ entity_name: 'Someone Else Ltd', entity_type: 'company', action_type: 'monetary_penalty' }] });
  assert.strictEqual(webhooks.enqueueForDocument(other), 0);

  await webhooks.deliverDue();
  assert.strictEqual(sent.length, 1);
  const { opts } = sent[0];
  const [t, v1] = opts.headers['Divyrs-Signature'].split(',').map((p) => p.split('=')[1]);
  assert.strictEqual(crypto.createHmac('sha256', hook.secret).update(`${t}.${opts.body}`).digest('hex'), v1);
  const payload = JSON.parse(opts.body);
  assert.strictEqual(payload.event, 'enforcement.created');
  assert.strictEqual(payload.data.actions[0].entity_name, 'New Penalised Bank Ltd');
  assert.strictEqual(db.prepare("SELECT status FROM reg_deliveries").get().status, 'sent');
});

test('website pages render', async () => {
  for (const p of ['/regdata', '/regdata/docs', '/regdata/changes', '/regdata/changes?regulator=SEBI&q=cyber', '/regdata/enforcement', '/']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
  }
  const d = db.prepare("SELECT id FROM reg_documents WHERE status='ready' LIMIT 1").get();
  assert.strictEqual((await fetch(`${base}/regdata/changes/${d.id}`)).status, 200);
  // Searching on the website needs an account.
  const s = await fetch(base + '/regdata/enforcement?name=HDFC', { redirect: 'manual' });
  assert.strictEqual(s.status, 302);
});

test('RegData plan purchase extends the right columns', () => {
  const payments = require('../src/payments');
  db.prepare("INSERT INTO payments (user_id, order_id, plan, months, amount, currency, created_at) VALUES (?, 'o_reg', 'reg_business', 1, 49999, 'INR', 0)").run(userId);
  db.prepare("UPDATE users SET reg_plan = 'reg_free', reg_plan_expires = NULL WHERE id = ?").run(userId);
  payments.markPaid('o_reg', 'p_reg');
  const u = db.prepare('SELECT plan, reg_plan, reg_plan_expires FROM users WHERE id = ?').get(userId);
  assert.strictEqual(u.reg_plan, 'reg_business');
  assert.strictEqual(u.plan, 'free');
  assert.ok(u.reg_plan_expires > Date.now() + 29 * 86400000);
});

test('stop server', () => { server.close(); assert.ok(SOURCES.length >= 3); });

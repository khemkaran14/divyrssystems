process.env.DB_PATH = ':memory:';
process.env.DISABLE_MONITOR = '1';
process.env.DISABLE_REGDATA = '1';
const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const config = require('../src/config');

test('Nutwise privacy policy page is public and indexable', async () => {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(base + '/apps/nutwise/privacy'); // no login cookie
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.match(html, /Nutwise/);
    assert.match(html, /<title>Nutwise – Privacy Policy/);
    assert.match(html, /Last updated: 26 November 2026/);
    assert.match(html, /11\. Contact/);
    assert.ok(html.includes(`mailto:${config.business.email}`));
    assert.ok(html.includes(`${config.business.name} – <a href="mailto:${config.business.email}"`));
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, /<link rel="canonical" href="[^"]*\/apps\/nutwise\/privacy">/);

    const redirect = await fetch(base + '/nutwise/privacy', { redirect: 'manual' });
    assert.strictEqual(redirect.status, 301);
    assert.strictEqual(redirect.headers.get('location'), '/apps/nutwise/privacy');

    assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/apps\/nutwise\/privacy</);
  } finally {
    server.close();
  }
});

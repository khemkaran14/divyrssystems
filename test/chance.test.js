process.env.DB_PATH = ':memory:';
process.env.DISABLE_MONITOR = '1';
process.env.DISABLE_REGDATA = '1';
const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const config = require('../src/config');

test('Chance app privacy policy page', async () => {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/chance/privacy`);
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.match(html, /Privacy Policy – Chance: Probability &amp; Stats/);
  assert.match(html, /com\.divyrs\.chance/);
  assert.match(html, /11\. Contact/);
  assert.ok(html.includes(`mailto:${config.business.email}`));
  assert.doesNotMatch(html, /YOUR_PUBLIC_EMAIL/);
  assert.doesNotMatch(html, /Sign in with Google|Firebase|delete-account/); // commented-out section left out
  const map = await (await fetch(`http://127.0.0.1:${server.address().port}/sitemap.xml`)).text();
  assert.match(map, /\/chance\/privacy</);
  server.close();
});

// Bearer-token sign-in for the phone app, alongside the website's cookie.
// Run from the website repo root: node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'usg-test-'));
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_EMAILS = '';
const app = require(fs.existsSync(path.join(__dirname, '../server.js')) ? '../server.js' : '../../server.js');

let base, server;
test.before(() => new Promise(r => { server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

const call = async (method, url, { body, token, cookie, mobile } = {}) => {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (mobile) headers['X-Client'] = 'mobile';
  const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};

test('health', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.version);
});

test('mobile signup returns a token that works as a Bearer token', async () => {
  const r = await call('POST', '/api/auth/signup', { mobile: true, body: { name: 'Asha', email: 'asha@example.com', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.match(r.json.token, /^[a-f0-9]{64}$/);
  assert.equal(r.json.user.admin, true); // first account
  const me = await call('GET', '/api/me', { token: r.json.token });
  assert.equal(me.json.user.email, 'asha@example.com');
  // saved looks work with the token
  assert.equal((await call('POST', '/api/looks', { token: r.json.token, body: { lid: 'abc123', who: 'model', thumb: 'x', t: 1 } })).status, 200);
  assert.equal((await call('GET', '/api/looks', { token: r.json.token })).json.looks[0].lid, 'abc123');
});

test('website signup and login do not return a token, and the cookie still works', async () => {
  const r = await call('POST', '/api/auth/signup', { body: { name: 'Web', email: 'web@example.com', password: 'password123' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.token, undefined);
  assert.match(r.cookie, /^sg_session=/);
  const me = await call('GET', '/api/me', { cookie: r.cookie });
  assert.equal(me.json.user.email, 'web@example.com');
  const login = await call('POST', '/api/auth/login', { body: { email: 'web@example.com', password: 'password123' } });
  assert.equal(login.json.token, undefined);
});

test('mobile login, then logout deletes the bearer session', async () => {
  const r = await call('POST', '/api/auth/login', { mobile: true, body: { email: 'asha@example.com', password: 'password123' } });
  const t = r.json.token;
  assert.ok(t);
  assert.equal((await call('GET', '/api/me', { token: t })).json.user.name, 'Asha');
  assert.equal((await call('POST', '/api/auth/logout', { token: t })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: t })).json.user, null);
  assert.equal((await call('GET', '/api/looks', { token: t })).status, 401);
});

test('a bad or malformed token is ignored', async () => {
  assert.equal((await call('GET', '/api/me', { token: 'f'.repeat(64) })).json.user, null);
  assert.equal((await call('GET', '/api/me', { token: 'not-a-token' })).json.user, null);
});

test('account deletion removes the bearer session', async () => {
  const r = await call('POST', '/api/auth/signup', { mobile: true, body: { name: 'Del', email: 'del@example.com', password: 'password123' } });
  const t = r.json.token;
  assert.equal((await call('DELETE', '/api/account', { token: t })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: t })).json.user, null);
});

// Email digests (customers) and the weekly roundup newsletter (anyone).
const crypto = require('crypto');
const db = require('./schema');
const config = require('../config');
const store = require('./store');
const { regPlanFor } = require('./plans');
const { nameSimilarity } = require('./rules');
const { sendMail } = require('../mailer');

db.exec(`
CREATE TABLE IF NOT EXISTS reg_digests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  filters TEXT NOT NULL DEFAULT '{}',
  confirmed INTEGER NOT NULL DEFAULT 0,
  token TEXT UNIQUE NOT NULL,
  last_sent INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digest_email ON reg_digests(email);
`);

const parse = (s, d) => { try { return JSON.parse(s); } catch (_) { return d; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;

// Clock in India, because digests go out at 8am IST.
function istNow(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

function newToken() { return crypto.randomBytes(18).toString('hex'); }

// ---------------------------------------------------------------- subscriptions
function subscribeNewsletter(email) {
  const e = String(email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: 'Please enter a valid email.' };
  let row = db.prepare('SELECT * FROM reg_digests WHERE email = ? AND user_id IS NULL').get(e);
  if (!row) {
    db.prepare("INSERT INTO reg_digests (email, frequency, filters, token, created_at) VALUES (?, 'weekly', '{}', ?, ?)").run(e, newToken(), Date.now());
    row = db.prepare('SELECT * FROM reg_digests WHERE email = ? AND user_id IS NULL').get(e);
  }
  if (!row.confirmed) {
    sendMail({
      to: e,
      subject: 'Confirm your subscription to the Indian Regulatory Roundup',
      text: `Please confirm you want the weekly Indian Regulatory Roundup from Divyrs (RBI & SEBI changes and penalties):\n${config.baseUrl}/regdata/digest/confirm/${row.token}\n\nIf you didn't ask for this, ignore this email.\n`,
    }).catch(() => {});
  }
  return { ok: true };
}

function confirm(token) {
  const r = db.prepare('SELECT * FROM reg_digests WHERE token = ?').get(String(token));
  if (!r) return false;
  db.prepare('UPDATE reg_digests SET confirmed = 1 WHERE id = ?').run(r.id);
  return true;
}

function unsubscribe(token) {
  return db.prepare('DELETE FROM reg_digests WHERE token = ?').run(String(token)).changes > 0;
}

function limitsFor(user) {
  const paid = regPlanFor(user).id !== 'reg_free';
  return { paid, max: paid ? 10 : 1, frequencies: paid ? ['daily', 'weekly'] : ['weekly'] };
}

function createForUser(user, { frequency, regulators, applies_to, impact, watchlist }) {
  const lim = limitsFor(user);
  const have = db.prepare('SELECT COUNT(*) n FROM reg_digests WHERE user_id = ?').get(user.id).n;
  if (have >= lim.max) return { error: lim.paid ? `You can have up to ${lim.max} digests.` : 'The free plan includes one weekly digest. Upgrade for daily digests with filters and watchlists.' };
  const f = lim.frequencies.includes(frequency) ? frequency : 'weekly';
  const filters = lim.paid ? { regulators, applies_to, impact, watchlist: (watchlist || []).slice(0, 500) } : {};
  db.prepare('INSERT INTO reg_digests (user_id, email, frequency, filters, confirmed, token, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(user.id, user.email, f, JSON.stringify(filters), user.email_verified ? 1 : 0, newToken(), Date.now());
  return { ok: true };
}

// ---------------------------------------------------------------- content
function collect(sub, user, since) {
  const f = parse(sub.filters, {});
  const paid = user ? regPlanFor(user).id !== 'reg_free' : false;
  const list = (a) => (a && a.length ? a : null);
  let changes = store.listChanges({
    regulator: list(f.regulators), applies_to: list(f.applies_to),
    impact: list(f.impact) || (paid ? null : ['high', 'medium']),
    enforcement: false, since, limit: 100,
  }).rows;
  if (!paid) changes = changes.slice(0, 15);
  const actions = store.listActions({ regulator: list(f.regulators), since: new Date(since).toISOString().slice(0, 10), limit: 100 }).rows;
  const watch = f.watchlist || [];
  const hits = watch.length ? actions.filter((a) => watch.some((w) => nameSimilarity(w, a.entity_name) >= 0.8)) : [];
  return { changes, actions: paid ? actions : actions.slice(0, 10), hits, paid };
}

function render(sub, { changes, actions, hits, paid }, title) {
  const unsub = `${config.baseUrl}/regdata/digest/unsubscribe/${sub.token}`;
  const link = (d) => `${config.baseUrl}/regdata/changes/${d.id}`;
  const amt = (n) => (n ? '₹' + Number(n).toLocaleString('en-IN') : '');
  let text = `${title}\n\n`;
  let html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827">
    <h2 style="color:#4f46e5;margin-bottom:4px">${esc(title)}</h2>
    <p style="color:#6b7280;margin-top:0">From Divyrs RegData · <a href="${config.baseUrl}/regdata">divyrs.com/regdata</a></p>`;
  if (hits.length) {
    text += '⚠️ WATCHLIST MATCHES\n' + hits.map((a) => `- ${a.entity_name}: ${a.action_type.replace(/_/g, ' ')} by ${a.regulator} ${amt(a.amount_inr)} (${a.action_date})`).join('\n') + '\n\n';
    html += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0"><strong>⚠️ Watchlist matches</strong><ul>` +
      hits.map((a) => `<li><strong>${esc(a.entity_name)}</strong>: ${esc(a.action_type.replace(/_/g, ' '))} by ${esc(a.regulator)} ${esc(amt(a.amount_inr))} (${esc(a.action_date)}) — <a href="${esc(a.url)}">order</a></li>`).join('') + '</ul></div>';
  }
  if (changes.length) {
    text += 'REGULATORY CHANGES\n';
    html += '<h3>Regulatory changes</h3>';
    for (const d of changes) {
      const obl = paid ? parse(d.obligations, []) : [];
      text += `- [${d.regulator}${d.impact ? ', ' + d.impact : ''}] ${d.title}\n  ${link(d)}\n` + (d.summary ? `  ${d.summary.slice(0, 300)}\n` : '') +
        obl.slice(0, 5).map((o) => `  • ${o.what}${o.deadline ? ' (by ' + o.deadline + ')' : ''}\n`).join('');
      html += `<div style="border-bottom:1px solid #e5e7eb;padding:10px 0">
        <div style="font-size:12px;color:#6b7280">${esc(d.regulator)} · ${new Date(d.published_at).toLocaleDateString('en-IN')}${d.impact ? ' · <strong>' + esc(d.impact) + ' impact</strong>' : ''}</div>
        <a href="${link(d)}" style="font-weight:bold;color:#111827">${esc(d.title)}</a>
        ${d.summary ? `<div style="font-size:14px;color:#374151;margin-top:4px">${esc(d.summary.slice(0, 400))}</div>` : ''}
        ${obl.length ? '<ul style="font-size:13px">' + obl.slice(0, 5).map((o) => `<li>${esc(o.what)}${o.deadline ? ' — <strong>by ' + esc(o.deadline) + '</strong>' : ''}</li>`).join('') + '</ul>' : ''}
      </div>`;
    }
  }
  if (actions.length) {
    text += '\nENFORCEMENT ACTIONS\n' + actions.map((a) => `- ${a.entity_name}: ${a.action_type.replace(/_/g, ' ')} by ${a.regulator} ${amt(a.amount_inr)} (${a.action_date})`).join('\n') + '\n';
    html += '<h3>Enforcement actions</h3><table style="width:100%;font-size:13px;border-collapse:collapse">' +
      actions.map((a) => `<tr><td style="padding:4px 0">${esc(a.action_date)}</td><td>${esc(a.regulator)}</td><td><strong>${esc(a.entity_name)}</strong></td><td>${esc(a.action_type.replace(/_/g, ' '))}</td><td style="text-align:right">${esc(amt(a.amount_inr))}</td></tr>`).join('') + '</table>';
  }
  if (!paid) {
    text += `\nGet obligations, deadlines, filters and watchlist alerts: ${config.baseUrl}/regdata#pricing\n`;
    html += `<p style="background:#eef0ff;padding:12px 16px;border-radius:8px;margin-top:20px">Want obligations, deadlines, your own filters and watchlist alerts? <a href="${config.baseUrl}/regdata#pricing">See RegData plans</a>.</p>`;
  }
  text += `\nUnsubscribe: ${unsub}\nInformation only, not legal advice.\n`;
  html += `<p style="font-size:12px;color:#9ca3af;margin-top:24px">Information only, not legal advice. Always rely on the official text.<br><a href="${unsub}" style="color:#9ca3af">Unsubscribe</a></p></div>`;
  return { text, html, unsub };
}

async function sendOne(sub, { force = false } = {}) {
  const user = sub.user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(sub.user_id) : null;
  const span = sub.frequency === 'daily' ? DAY : 7 * DAY;
  const since = sub.last_sent && !force ? sub.last_sent : Date.now() - span;
  const content = collect(sub, user, since);
  if (!content.changes.length && !content.actions.length && !force) {
    db.prepare('UPDATE reg_digests SET last_sent = ? WHERE id = ?').run(Date.now(), sub.id);
    return false; // nothing new: don't send an empty email
  }
  const title = sub.user_id
    ? `${sub.frequency === 'daily' ? 'Daily' : 'Weekly'} RegData digest — ${istNow().date}`
    : `Indian Regulatory Roundup — week of ${istNow().date}`;
  const { text, html, unsub } = render(sub, content, title);
  await sendMail({ to: sub.email, subject: (content.hits.length ? '⚠️ Watchlist match · ' : '') + title, text, html, headers: { 'List-Unsubscribe': `<${unsub}>` } });
  db.prepare('UPDATE reg_digests SET last_sent = ? WHERE id = ?').run(Date.now(), sub.id);
  return true;
}

// Called every hour by the scheduler. Sends at 8am IST: daily every day, weekly on Mondays.
async function runDue(now = Date.now()) {
  const t = istNow(now);
  if (t.hour !== 8) return 0;
  const startOfDay = now - 2 * 3600000; // anything sent in the last 2h counts as today's
  const subs = db.prepare('SELECT * FROM reg_digests WHERE confirmed = 1 AND (last_sent IS NULL OR last_sent < ?)').all(startOfDay);
  let sent = 0;
  for (const s of subs) {
    if (s.frequency === 'weekly' && t.weekday !== 'Mon') continue;
    try { if (await sendOne(s)) sent++; } catch (e) { console.error('[digest]', s.id, e.message); }
  }
  return sent;
}

module.exports = { subscribeNewsletter, confirm, unsubscribe, createForUser, limitsFor, sendOne, runDue, collect, render, istNow };

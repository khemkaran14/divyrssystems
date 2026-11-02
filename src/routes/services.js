// Forms backend, digital business cards and booking pages.
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const { requireUser, rateLimit } = require('../auth');
const { effectivePlan } = require('../plans');
const { parseHttpUrl } = require('../safeurl');
const { sendMail } = require('../mailer');
const { TIMEZONES, DAY_NAMES, availableSlots, nowIn } = require('../services/booking');

const dash = express.Router();   // mounted at /dashboard
const pub = express.Router();    // mounted at /
dash.use(requireUser);

const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const clean = (s, n = 200) => String(s ?? '').trim().slice(0, n);
const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;

/* =====================================================================
   FORMS: a form endpoint for any website. Submissions are saved and emailed.
   ===================================================================== */
function formsPage(req, res, error = null) {
  const forms = db.prepare(`SELECT f.*, (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id) total,
    (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id AND s.created_at >= ?) month
    FROM forms f WHERE user_id = ? ORDER BY created_at DESC`).all(monthStart(), req.user.id);
  res.status(error ? 400 : 200).render('dashboard/forms', { title: 'Forms', forms, error });
}

dash.get('/forms', (req, res) => formsPage(req, res));

dash.post('/forms', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM forms WHERE user_id = ?').get(req.user.id).n;
  if (n >= req.plan.limits.forms) return formsPage(req, res, `Your ${req.plan.name} plan allows ${req.plan.limits.forms} form(s). Upgrade to add more.`);
  const name = clean(req.body.name, 80) || 'Contact form';
  const notify = clean(req.body.notify_email) || req.user.email;
  if (!isEmail(notify)) return formsPage(req, res, 'Enter a valid email for notifications.');
  let redirect = null;
  if (clean(req.body.redirect_url)) {
    const u = parseHttpUrl(req.body.redirect_url);
    if (!u) return formsPage(req, res, 'Thank-you page must be a full http(s) URL.');
    redirect = u.href;
  }
  db.prepare('INSERT INTO forms (user_id, key, name, notify_email, redirect_url, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, crypto.randomBytes(9).toString('base64url'), name, notify, redirect, Date.now());
  res.redirect('/dashboard/forms');
});

dash.post('/forms/:id/delete', (req, res) => {
  db.prepare('DELETE FROM forms WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/forms');
});

function ownForm(req) {
  return db.prepare('SELECT * FROM forms WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
}

dash.get('/forms/:id', (req, res, next) => {
  const form = ownForm(req);
  if (!form) return next();
  const subs = db.prepare('SELECT * FROM form_submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT 500').all(form.id)
    .map((s) => ({ ...s, data: JSON.parse(s.data) }));
  res.render('dashboard/form-detail', { title: form.name, form, subs });
});

dash.get('/forms/:id/export.csv', (req, res, next) => {
  const form = ownForm(req);
  if (!form) return next();
  const subs = db.prepare('SELECT * FROM form_submissions WHERE form_id = ? ORDER BY created_at').all(form.id)
    .map((s) => ({ ...s, data: JSON.parse(s.data) }));
  const cols = [...new Set(subs.flatMap((s) => Object.keys(s.data)))];
  // Prefix cells that start with =,+,-,@ so Excel does not run them as formulas.
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [['submitted_at', ...cols].map(cell).join(',')]
    .concat(subs.map((s) => [new Date(s.created_at).toISOString(), ...cols.map((c) => s.data[c])].map(cell).join(',')));
  res.attachment(form.name.replace(/[^a-z0-9]+/gi, '-') + '.csv').type('text/csv').send('\ufeff' + rows.join('\n'));
});

// Public endpoint that websites post to. Any origin is allowed.
pub.options('/f/:key', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Accept' }).sendStatus(204);
});
pub.post('/f/:key', express.json({ limit: '100kb' }), rateLimit(30, 600000), async (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  const wantsJson = (req.get('accept') || '').includes('application/json');
  const form = db.prepare('SELECT * FROM forms WHERE key = ?').get(req.params.key);
  if (!form) return next();
  const reply = (status, ok, message) => (wantsJson
    ? res.status(status).json({ ok, message })
    : res.status(status).render('form-thanks', { title: ok ? 'Thank you' : 'Not sent', ok, message, back: req.get('referer') || null }));

  const body = req.body || {};
  if (body._gotcha) return reply(200, true, 'Thank you! Your message has been sent.'); // bot filled the hidden field

  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(form.user_id);
  const plan = effectivePlan(owner);
  const used = db.prepare('SELECT COUNT(*) n FROM form_submissions WHERE form_id IN (SELECT id FROM forms WHERE user_id = ?) AND created_at >= ?')
    .get(form.user_id, monthStart()).n;
  if (used >= plan.limits.formSubmissionsMonth) return reply(429, false, 'This form is not accepting messages right now. Please contact the website owner directly.');

  const data = {};
  for (const [k, v] of Object.entries(body).slice(0, 40)) {
    if (k.startsWith('_')) continue;
    data[clean(k, 60)] = clean(Array.isArray(v) ? v.join(', ') : v, 5000);
  }
  if (!Object.values(data).some(Boolean)) return reply(400, false, 'The form was empty.');

  db.prepare('INSERT INTO form_submissions (form_id, data, ip, created_at) VALUES (?,?,?,?)').run(form.id, JSON.stringify(data), req.ip, Date.now());
  const replyTo = Object.values(data).find(isEmail);
  await sendMail({
    to: form.notify_email,
    replyTo,
    subject: `New submission: ${form.name}`,
    text: Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n') +
      `\n\n— Sent by Divyrs Forms. All submissions: ${config.baseUrl}/dashboard/forms/${form.id}\n`,
  });

  if (form.redirect_url && !wantsJson) return res.redirect(303, form.redirect_url);
  reply(200, true, 'Thank you! Your message has been sent.');
});

/* =====================================================================
   DIGITAL BUSINESS CARDS: public page + "Save contact" vCard + QR code.
   ===================================================================== */
const CARD_FIELDS = ['name', 'title', 'company', 'phone', 'whatsapp', 'email', 'website', 'address', 'about', 'upi'];

function readCard(body) {
  const d = {};
  for (const f of CARD_FIELDS) d[f] = clean(body[f], f === 'about' || f === 'address' ? 600 : 200);
  d.color = /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : '#4f46e5';
  d.photo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo || '') && body.photo.length < 200000 ? body.photo : '';
  d.links = [];
  for (let i = 0; i < 6; i++) {
    const label = clean(body['link_label_' + i], 40);
    const u = parseHttpUrl(body['link_url_' + i]);
    if (label && u) d.links.push({ label, url: u.href });
  }
  if (d.website) { const u = parseHttpUrl(/^https?:/.test(d.website) ? d.website : 'https://' + d.website); d.website = u ? u.href : ''; }
  return d;
}

dash.get('/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id)
    .map((c) => ({ ...c, data: JSON.parse(c.data) }));
  res.render('dashboard/cards', { title: 'Business cards', cards });
});

dash.get('/cards/new', (req, res) => {
  res.render('dashboard/card-edit', { title: 'New business card', card: { slug: '', data: { name: req.user.name, email: req.user.email, color: '#4f46e5', links: [] } }, error: null });
});

dash.get('/cards/:id', (req, res, next) => {
  const c = db.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return next();
  res.render('dashboard/card-edit', { title: 'Edit business card', card: { ...c, data: JSON.parse(c.data) }, error: null });
});

dash.post('/cards/save', (req, res) => {
  const id = Number(req.body.id) || 0;
  const slug = clean(req.body.slug, 40).toLowerCase();
  const data = readCard(req.body);
  const again = (error) => res.status(400).render('dashboard/card-edit', { title: 'Business card', card: { id, slug, data }, error });
  if (!data.name) return again('Name is required.');
  if (!SLUG.test(slug)) return again('Page address: 3–40 lowercase letters, numbers or -');
  const clash = db.prepare('SELECT id FROM cards WHERE slug = ? AND id != ?').get(slug, id);
  if (clash) return again('That page address is taken. Try another.');
  if (id) {
    const r = db.prepare('UPDATE cards SET slug = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(slug, JSON.stringify(data), Date.now(), id, req.user.id);
    if (!r.changes) return again('Card not found.');
  } else {
    const n = db.prepare('SELECT COUNT(*) n FROM cards WHERE user_id = ?').get(req.user.id).n;
    if (n >= req.plan.limits.cards) return again(`Your ${req.plan.name} plan allows ${req.plan.limits.cards} card(s). Upgrade to add more.`);
    db.prepare('INSERT INTO cards (user_id, slug, data, updated_at) VALUES (?,?,?,?)').run(req.user.id, slug, JSON.stringify(data), Date.now());
  }
  res.redirect('/dashboard/cards');
});

dash.post('/cards/:id/delete', (req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/dashboard/cards');
});

function loadCard(slug) {
  const c = db.prepare('SELECT * FROM cards WHERE slug = ?').get(slug);
  if (!c) return null;
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(c.user_id);
  return { ...c, data: JSON.parse(c.data), plan: effectivePlan(owner) };
}

pub.get('/c/:slug', async (req, res, next) => {
  const c = loadCard(req.params.slug);
  if (!c) return next();
  db.prepare('UPDATE cards SET views = views + 1 WHERE id = ?').run(c.id);
  const url = `${config.baseUrl}/c/${c.slug}`;
  const qr = await QRCode.toDataURL(url, { width: 360, margin: 1 });
  res.render('card', { title: c.data.name, c, d: c.data, url, qr, branding: !c.plan.limits.removeBranding });
});

pub.get('/c/:slug/contact.vcf', (req, res, next) => {
  const c = loadCard(req.params.slug);
  if (!c) return next();
  const d = c.data;
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(d.name)}`, `N:${esc(d.name)};;;;`];
  if (d.company) lines.push(`ORG:${esc(d.company)}`);
  if (d.title) lines.push(`TITLE:${esc(d.title)}`);
  if (d.phone) lines.push(`TEL;TYPE=CELL:${esc(d.phone)}`);
  if (d.email) lines.push(`EMAIL:${esc(d.email)}`);
  if (d.website) lines.push(`URL:${esc(d.website)}`);
  if (d.address) lines.push(`ADR:;;${esc(d.address)};;;;`);
  lines.push(`NOTE:${esc(config.baseUrl + '/c/' + c.slug)}`, 'END:VCARD');
  res.attachment((d.name || 'contact').replace(/[^a-z0-9]+/gi, '-') + '.vcf').type('text/vcard').send(lines.join('\r\n'));
});

/* =====================================================================
   BOOKING PAGES: clients pick a free slot; both sides get an email.
   ===================================================================== */
const getPage = (userId) => db.prepare('SELECT * FROM booking_pages WHERE user_id = ?').get(userId);
const bookingsThisMonth = (userId) => db.prepare("SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND created_at >= ? AND status = 'confirmed'").get(userId, monthStart()).n;

dash.get('/booking', (req, res) => {
  const page = getPage(req.user.id);
  const today = page ? nowIn(page.tz).date : new Date().toISOString().slice(0, 10);
  const upcoming = db.prepare("SELECT * FROM bookings WHERE user_id = ? AND date >= ? AND status = 'confirmed' ORDER BY date, time").all(req.user.id, today);
  res.render('dashboard/booking', {
    title: 'Booking page', page, upcoming, TIMEZONES, DAY_NAMES,
    used: bookingsThisMonth(req.user.id), msg: req.query.msg || null, error: req.query.error || null,
  });
});

dash.post('/booking', (req, res) => {
  const b = req.body;
  const slug = clean(b.slug, 40).toLowerCase();
  const fail = (e) => res.redirect('/dashboard/booking?error=' + encodeURIComponent(e));
  if (!SLUG.test(slug)) return fail('Page address: 3–40 lowercase letters, numbers or -');
  if (db.prepare('SELECT 1 FROM booking_pages WHERE slug = ? AND user_id != ?').get(slug, req.user.id)) return fail('That page address is taken.');
  const duration = [15, 20, 30, 45, 60, 90, 120].includes(Number(b.duration)) ? Number(b.duration) : 30;
  const days = [].concat(b.days || []).map(Number).filter((d) => d >= 0 && d <= 6);
  if (!days.length) return fail('Pick at least one working day.');
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(b.start_time) || !hhmm.test(b.end_time) || b.start_time >= b.end_time) return fail('Check your working hours.');
  const tz = TIMEZONES.includes(b.tz) ? b.tz : 'Asia/Kolkata';
  db.prepare(`INSERT INTO booking_pages (user_id, slug, title, intro, duration, days, start_time, end_time, tz, enabled)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET slug=excluded.slug, title=excluded.title, intro=excluded.intro,
    duration=excluded.duration, days=excluded.days, start_time=excluded.start_time, end_time=excluded.end_time, tz=excluded.tz, enabled=excluded.enabled`)
    .run(req.user.id, slug, clean(b.title, 100) || 'Book a meeting', clean(b.intro, 1000), duration, [...new Set(days)].sort().join(','),
      b.start_time, b.end_time, tz, b.enabled ? 1 : 0);
  res.redirect('/dashboard/booking?msg=' + encodeURIComponent('Booking page saved.'));
});

dash.post('/booking/:id/cancel', async (req, res) => {
  const bk = db.prepare("SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = 'confirmed'").get(req.params.id, req.user.id);
  if (bk) {
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(bk.id);
    const page = getPage(req.user.id);
    await sendMail({
      to: bk.email, replyTo: req.user.email,
      subject: `Cancelled: ${page ? page.title : 'your appointment'} on ${bk.date} at ${bk.time}`,
      text: `Hi ${bk.name},\n\nYour appointment with ${req.user.name} on ${bk.date} at ${bk.time} has been cancelled.\n` +
        (page ? `You can pick a new time here: ${config.baseUrl}/book/${page.slug}\n` : ''),
    });
  }
  res.redirect('/dashboard/booking?msg=' + encodeURIComponent('Booking cancelled and the client was emailed.'));
});

function publicBooking(slug) {
  const page = db.prepare('SELECT * FROM booking_pages WHERE slug = ? AND enabled = 1').get(slug);
  if (!page) return null;
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(page.user_id);
  return { page, owner, plan: effectivePlan(owner) };
}

function renderBook(res, ctx, extra = {}) {
  const taken = db.prepare("SELECT date, time FROM bookings WHERE user_id = ? AND status = 'confirmed' AND date >= ?").all(ctx.owner.id, nowIn(ctx.page.tz).date);
  const full = bookingsThisMonth(ctx.owner.id) >= ctx.plan.limits.bookingsMonth;
  res.status(extra.error ? 400 : 200).render('book', {
    title: ctx.page.title, page: ctx.page, owner: ctx.owner, slots: full ? [] : availableSlots(ctx.page, taken), full,
    branding: !ctx.plan.limits.removeBranding, done: null, error: null, form: {}, ...extra,
  });
}

pub.get('/book/:slug', (req, res, next) => {
  const ctx = publicBooking(req.params.slug);
  if (!ctx) return next();
  renderBook(res, ctx);
});

pub.post('/book/:slug', rateLimit(10, 3600000), async (req, res, next) => {
  const ctx = publicBooking(req.params.slug);
  if (!ctx) return next();
  const form = { name: clean(req.body.name, 100), email: clean(req.body.email), phone: clean(req.body.phone, 30), note: clean(req.body.note, 1000) };
  const [date, time] = String(req.body.slot || '').split(' ');
  if (!form.name || !isEmail(form.email)) return renderBook(res, ctx, { error: 'Please enter your name and a valid email.', form });
  if (bookingsThisMonth(ctx.owner.id) >= ctx.plan.limits.bookingsMonth) return renderBook(res, ctx, { error: 'Bookings are closed for this month.', form });
  const taken = db.prepare("SELECT date, time FROM bookings WHERE user_id = ? AND status = 'confirmed'").all(ctx.owner.id);
  const valid = availableSlots(ctx.page, taken).some((d) => d.date === date && d.times.includes(time));
  if (!valid) return renderBook(res, ctx, { error: 'That time is no longer available. Please pick another.', form });
  try {
    db.prepare('INSERT INTO bookings (user_id, date, time, name, email, phone, note, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(ctx.owner.id, date, time, form.name, form.email, form.phone, form.note, Date.now());
  } catch (_) {
    return renderBook(res, ctx, { error: 'Someone just booked that time. Please pick another.', form });
  }
  const when = `${date} at ${time} (${ctx.page.tz}), ${ctx.page.duration} minutes`;
  await sendMail({
    to: ctx.owner.email, replyTo: form.email,
    subject: `New booking: ${form.name} — ${date} ${time}`,
    text: `${form.name} booked "${ctx.page.title}"\nWhen: ${when}\nEmail: ${form.email}\nPhone: ${form.phone || '-'}\nNote: ${form.note || '-'}\n\n${config.baseUrl}/dashboard/booking\n`,
  });
  await sendMail({
    to: form.email, replyTo: ctx.owner.email,
    subject: `Confirmed: ${ctx.page.title} with ${ctx.owner.name}`,
    text: `Hi ${form.name},\n\nYour booking is confirmed.\nWith: ${ctx.owner.name}\nWhen: ${when}\n\nNeed to change it? Just reply to this email.\n`,
  });
  renderBook(res, ctx, { done: { date, time, when } });
});

module.exports = { dash, pub };

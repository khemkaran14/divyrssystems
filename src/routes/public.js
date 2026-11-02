const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const { sendMail } = require('../mailer');
const { rateLimit } = require('../auth');
const { parseHttpUrl } = require('../safeurl');
const { PLANS, effectivePlan } = require('../plans');

const router = express.Router();

router.get('/', (req, res) => res.render('home', { title: 'Online tools for professionals & companies' }));
router.get('/tools', (req, res) => res.render('tools/index', { title: 'Tools' }));
router.get('/pricing', (req, res) => res.render('pricing', { title: 'Pricing' }));
router.get('/about', (req, res) => res.render('about', { title: 'About' }));

for (const page of ['privacy', 'terms', 'refund', 'shipping']) {
  router.get('/' + page, (req, res) => res.render('legal/' + page, { title: {
    privacy: 'Privacy Policy', terms: 'Terms of Service', refund: 'Cancellation & Refund Policy', shipping: 'Delivery Policy',
  }[page] }));
}

router.get('/contact', (req, res) => res.render('contact', { title: 'Contact', sent: false, error: null }));
router.post('/contact', rateLimit(5, 3600000), async (req, res) => {
  const { name = '', email = '', company = '', message = '' } = req.body;
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email) || message.trim().length < 5) {
    return res.render('contact', { title: 'Contact', sent: false, error: 'Please fill in your name, a valid email and a message.' });
  }
  db.prepare('INSERT INTO messages (name, email, company, body, created_at) VALUES (?,?,?,?,?)')
    .run(name.slice(0, 200), email.slice(0, 200), company.slice(0, 200), message.slice(0, 5000), Date.now());
  await sendMail({
    to: config.business.email,
    replyTo: email,
    subject: `New enquiry from ${name}${company ? ' (' + company + ')' : ''}`,
    text: `${message}\n\n— ${name} <${email}>`,
  });
  res.render('contact', { title: 'Contact', sent: true, error: null });
});

// ---- Free tools (no login needed: they bring visitors in from Google) ----
router.get('/tools/invoice', (req, res) => {
  let saved = null;
  if (req.user && req.query.id) {
    const row = db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(req.query.id, req.user.id);
    if (row) saved = { id: row.id, ...JSON.parse(row.data) };
  }
  res.render('tools/invoice', { title: 'Free GST Invoice Generator', saved });
});

router.get('/tools/qr', (req, res) => res.render('tools/qr', { title: 'Free QR Code Generator', qr: null, form: {} }));
router.post('/tools/qr', rateLimit(60, 600000), async (req, res) => {
  const { text = '', dark = '#111827', light = '#ffffff', size = '512' } = req.body;
  const hex = /^#[0-9a-f]{6}$/i;
  const form = { text, dark: hex.test(dark) ? dark : '#111827', light: hex.test(light) ? light : '#ffffff', size };
  if (!text.trim() || text.length > 2000) {
    return res.render('tools/qr', { title: 'Free QR Code Generator', qr: null, form, error: 'Enter some text or a link (max 2000 characters).' });
  }
  const width = Math.min(Math.max(parseInt(size, 10) || 512, 128), 2048);
  const qr = await QRCode.toDataURL(text, { width, margin: 2, color: { dark: form.dark, light: form.light } });
  const svg = await QRCode.toString(text, { type: 'svg', margin: 2, color: { dark: form.dark, light: form.light } });
  res.render('tools/qr', { title: 'Free QR Code Generator', qr, svg, form, error: null });
});

router.get('/tools/uptime', (req, res) => res.render('tools/uptime', { title: 'Website Uptime Monitor' }));
router.get('/tools/links', (req, res) => res.render('tools/links', { title: 'Link Shortener with Click Tracking' }));

// ---- Short link redirect ----
router.get('/s/:code', (req, res, next) => {
  const link = db.prepare('SELECT * FROM links WHERE code = ?').get(req.params.code);
  if (!link || !parseHttpUrl(link.target)) return next();
  db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(link.id);
  res.redirect(302, link.target);
});

// ---- Public status page (Pro / Business) ----
router.get('/status/:slug', (req, res, next) => {
  const owner = db.prepare('SELECT * FROM users WHERE status_slug = ?').get(req.params.slug);
  if (!owner) return next();
  const plan = effectivePlan(owner);
  if (!plan.limits.statusPage) return next();
  const monitors = db.prepare('SELECT * FROM monitors WHERE user_id = ? ORDER BY name').all(owner.id);
  const history = {};
  for (const m of monitors) {
    history[m.id] = db.prepare('SELECT up FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 60').all(m.id).reverse();
  }
  res.render('status', { title: owner.name + ' status', owner, monitors, history, whiteLabel: plan.limits.whiteLabel, layout: false });
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /billing\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});
router.get('/sitemap.xml', (req, res) => {
  const pages = ['', '/tools', '/tools/invoice', '/tools/qr', '/tools/uptime', '/tools/links', '/pricing', '/about', '/contact', '/privacy', '/terms', '/refund'];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${config.baseUrl}${p}</loc></url>`).join('\n') + '\n</urlset>\n');
});

module.exports = router;

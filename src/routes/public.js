const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const { sendMail } = require('../mailer');
const { rateLimit } = require('../auth');
const { parseHttpUrl } = require('../safeurl');
const { PLANS, effectivePlan } = require('../plans');

const router = express.Router();

router.get('/', (req, res) => {
  const store = require('../regdata/store');
  res.render('home', {
    title: 'Regulatory data API & business tools for India',
    description: 'Divyrs Systems: the RegData API for RBI and SEBI regulatory changes and enforcement actions, plus simple business tools: GST invoices, booking pages, digital business cards, uptime & SSL monitoring.',
    stats: store.stats(), latest: store.listChanges({ limit: 5 }).rows, deleted: req.query.deleted === '1',
  });
});
router.get('/tools', (req, res) => res.render('tools/index', { title: 'Tools' }));
router.get('/pricing', (req, res) => res.render('pricing', { title: 'Pricing' }));
router.get('/about', (req, res) => res.render('about', { title: 'About' }));

for (const page of ['privacy', 'terms', 'refund', 'shipping']) {
  router.get('/' + page, (req, res) => res.render('legal/' + page, { title: {
    privacy: 'Privacy Policy', terms: 'Terms of Service', refund: 'Cancellation & Refund Policy', shipping: 'Delivery Policy',
  }[page] }));
}

const TOPICS = { regdata: 'RegData API', demo: 'Book a RegData demo', enterprise: 'Enterprise / reseller licence', tools: 'Business tools', billing: 'Billing & invoices', support: 'Technical support', other: 'Something else' };
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact', sent: false, error: null, TOPICS, topic: TOPICS[req.query.topic] ? req.query.topic : 'regdata' }));
router.post('/contact', rateLimit(5, 3600000), async (req, res) => {
  const { name = '', email = '', company = '', message = '', phone = '' } = req.body;
  const topic = TOPICS[req.body.topic] ? req.body.topic : 'other';
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email) || message.trim().length < 5) {
    return res.render('contact', { title: 'Contact', sent: false, error: 'Please fill in your name, a valid email and a message.', TOPICS, topic });
  }
  db.prepare('INSERT INTO messages (name, email, company, phone, topic, body, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(name.slice(0, 200), email.slice(0, 200), company.slice(0, 200), phone.slice(0, 30), topic, message.slice(0, 5000), Date.now());
  await sendMail({
    to: config.business.email,
    replyTo: email,
    subject: `[${TOPICS[topic]}] ${name}${company ? ' (' + company + ')' : ''}`,
    text: `${message}\n\n— ${name} <${email}>${phone ? ' · ' + phone : ''}`,
  });
  res.render('contact', { title: 'Contact', sent: true, error: null, TOPICS, topic });
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

router.get('/tools/uptime', (req, res) => res.render('tools/uptime', { title: 'Website Uptime & SSL Monitor' }));
router.get('/tools/gst-calculator', (req, res) => res.render('tools/gst-calculator', { title: 'GST Calculator — add or remove GST' }));
router.get('/tools/emi-calculator', (req, res) => res.render('tools/emi-calculator', { title: 'EMI Calculator — home, car & business loans' }));

// Landing pages for account-based tools (these are what Google sends people to).
const LANDINGS = {
  booking: {
    title: 'Free Online Appointment Booking Page',
    badge: 'Appointment booking', app: '/dashboard/booking', cta: 'Create my booking page',
    h1: 'Let clients book you without the WhatsApp back-and-forth',
    lead: 'Share one link. Clients see your free times, pick one, and you both get a confirmation email. Double bookings are impossible.',
    features: [
      ['Your hours, your days', 'Set working days, hours, meeting length and timezone. Only free slots are shown.'],
      ['Email confirmations', 'You and your client both get the details instantly. Cancel with one click and the client is told.'],
      ['Works on any phone', 'Put the link in your Instagram bio, Google Business profile, WhatsApp status or website.'],
    ],
    who: 'doctors, clinics, consultants, CAs, lawyers, tutors, salons, photographers, coaches.',
  },
  forms: {
    title: 'Form Backend for Websites — Contact Forms Without a Server',
    badge: 'Forms for websites', app: '/dashboard/forms', cta: 'Create a form endpoint',
    h1: 'Working contact forms for any website in 2 minutes',
    lead: 'Paste a simple HTML form into any website — static HTML, WordPress, Webflow, React. Every submission is emailed to you and saved in your dashboard.',
    features: [
      ['No backend needed', 'Point your form at your Divyrs link. Any fields you add are captured.'],
      ['Spam protection', 'Built-in honeypot and rate limiting keep bots out.'],
      ['Export to Excel', 'Download every lead as CSV. Use your own thank-you page.'],
    ],
    who: 'web designers, agencies, landing pages, event registrations, lead generation.',
  },
  'business-card': {
    title: 'Free Digital Business Card with QR Code',
    badge: 'Digital visiting card', app: '/dashboard/cards', cta: 'Make my free card',
    h1: 'A digital visiting card that never runs out',
    lead: 'One link with your photo, call and WhatsApp buttons, "Save contact", UPI payment, location and social links — plus a QR code to print on your counter or old cards.',
    features: [
      ['Save contact in one tap', 'Visitors add you to their phone contacts instantly (vCard).'],
      ['WhatsApp, UPI & Maps', 'Direct buttons to chat, pay you and get directions.'],
      ['Cards for your whole team', 'Business plan includes 25 cards for your staff, all managed from one account.'],
    ],
    who: 'sales teams, real-estate agents, shop owners, insurance advisors, freelancers.',
  },
};
for (const [slug, info] of Object.entries(LANDINGS)) {
  router.get('/tools/' + slug, (req, res) => res.render('tools/landing', { title: info.title, info }));
}
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

router.get('/security', (req, res) => res.render('security', { title: 'Security' }));
router.get('/.well-known/security.txt', (req, res) => {
  const expires = new Date(Date.now() + 365 * 86400000).toISOString();
  res.type('text/plain').send(`Contact: mailto:${config.business.email}\nExpires: ${expires}\nPreferred-Languages: en, hi\nCanonical: ${config.baseUrl}/.well-known/security.txt\nPolicy: ${config.baseUrl}/security\n`);
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /billing\nSitemap: ${config.baseUrl}/sitemap.xml\n`);
});
router.get('/sitemap.xml', (req, res) => {
  const pages = ['', '/regdata', '/regdata/changes', '/regdata/enforcement', '/regdata/docs', '/regdata/status', '/tools', '/tools/invoice', '/tools/qr',
    '/tools/uptime', '/tools/links', '/tools/booking', '/tools/forms', '/tools/business-card', '/tools/gst-calculator', '/tools/emi-calculator',
    '/pricing', '/about', '/contact', '/security', '/privacy', '/terms', '/refund', '/shipping'];
  // Every public regulatory change page, newest first (search engines cap sitemaps at 50,000 URLs).
  const changes = db.prepare("SELECT id, updated_at FROM reg_documents WHERE status = 'ready' AND review_status != 'rejected' ORDER BY published_at DESC LIMIT 45000").all();
  const esc = (u) => u.replace(/&/g, '&amp;');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${esc(config.baseUrl + p)}</loc></url>`).join('\n') + '\n' +
    changes.map((c) => `  <url><loc>${esc(config.baseUrl)}/regdata/changes/${c.id}</loc><lastmod>${new Date(c.updated_at).toISOString().slice(0, 10)}</lastmod></url>`).join('\n') +
    '\n</urlset>\n');
});

module.exports = router;

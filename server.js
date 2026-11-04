const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const { loadUser, sameOrigin } = require('./src/auth');
const { PLANS, CURRENCIES, formatPrice, anyPlan } = require('./src/plans');
const { REG_PLANS } = require('./src/regdata/plans');
const billing = require('./src/routes/billing');
const monitor = require('./src/monitor');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 'loopback'); // behind Nginx on the VPS
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

// Health check for uptime monitors (UptimeRobot, Better Stack, your own Divyrs monitor).
const ops = require('./src/ops');
app.get('/healthz', (req, res) => { const h = ops.health(); res.status(h.ok ? 200 : 503).json(h); });

// Privacy-friendly page counts: no cookies, no IPs, just page + day.
const db = require('./src/db');
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|node-fetch|headless/i;
const normalizePath = (p) => p
  .replace(/^\/regdata\/changes\/\d+$/, '/regdata/changes/:id')
  .replace(/^\/(c|book|status|s|f|reset|verify)\/[^/]+.*$/, '/$1/:x')
  .replace(/^\/dashboard\/.*$/, '/dashboard/*')
  .replace(/^\/admin.*$/, '/admin')
  .slice(0, 120);
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || BOT_RE.test(req.get('user-agent') || '')) return next();
  res.on('finish', () => {
    if (res.statusCode !== 200 || !String(res.get('content-type') || '').includes('text/html')) return;
    try {
      db.prepare('INSERT INTO page_views (day, path, views) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1')
        .run(new Date().toISOString().slice(0, 10), normalizePath(req.path));
    } catch (_) { /* never break a page for analytics */ }
  });
  next();
});

// Razorpay webhook must see the raw body.
app.post('/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), billing.webhook);

app.use(express.urlencoded({ extended: false, limit: '300kb' })); // business-card photos

app.use(cookieParser(config.sessionSecret));
app.use(sameOrigin);
app.use(loadUser);

// Shared template values.
app.use((req, res, next) => {
  let cur = req.query.cur || req.cookies.cur;
  if (!CURRENCIES.includes(cur)) {
    // Guess from browser language: Indian locales get INR.
    cur = /-IN\b|^hi\b/i.test(req.get('accept-language') || '') ? 'INR' : 'USD';
  }
  if (req.query.cur && CURRENCIES.includes(req.query.cur)) res.cookie('cur', cur, { maxAge: 31536000000, sameSite: 'lax' });
  Object.assign(res.locals, {
    cur, PLANS, REG_PLANS, anyPlan, formatPrice, business: config.business, baseUrl: config.baseUrl,
    // Safe to print inside <script> tags.
    json: (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
    path: req.path, title: 'Divyrs Systems', description: null,
  });
  next();
});

const regSite = require('./src/routes/regdata-site');
app.use('/', regSite.pub);
app.use('/dashboard/regdata', regSite.dash);
app.use('/admin/regdata', regSite.admin);
app.use('/api/regdata/v1', require('./src/routes/regdata-api'));
app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/account'));
app.use('/dashboard', require('./src/routes/dashboard'));
const services = require('./src/routes/services');
app.use('/dashboard', services.dash);
app.use('/', services.pub);
app.use('/billing', billing);
app.use('/api/v1', require('./src/routes/api'));
app.use('/admin', require('./src/routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'This page does not exist.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Please try again. If it keeps happening, contact us.' });
});

if (require.main === module) {
  app.listen(config.port, '127.0.0.1', () => console.log(`Divyrs running on http://127.0.0.1:${config.port}`));
  if (process.env.DISABLE_MONITOR !== '1') monitor.start();
  if (process.env.DISABLE_REGDATA !== '1') require('./src/regdata/scheduler').start();
  ops.installCrashAlerts();
}

module.exports = app;

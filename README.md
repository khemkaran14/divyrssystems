# Divyrs Systems

Online tools for professionals and companies, with free and paid plans:

- **GST Invoice Generator** — CGST/SGST/IGST, HSN codes, amount in words, PDF download
- **Uptime Monitor** — 1–5 minute checks, email alerts, public status pages
- **Link Shortener** — click counts, custom codes, REST API
- **QR Code Generator** — PNG and SVG

Payments through Razorpay in INR and USD. An admin page at `/admin` shows sign-ups, revenue and contact messages.

- Business plan: [MONETIZATION.md](MONETIZATION.md)
- Hosting on a VPS: [DEPLOY.md](DEPLOY.md)

## Run locally

```bash
npm install
cp .env.example .env   # optional for local use
npm run dev            # http://localhost:3100
npm test
```

## Stack

Node.js 20.12+ · Express · EJS templates · SQLite (`data/divyrs.db`) · no build step.

```
server.js            app setup
src/plans.js         prices and plan limits — edit here to change pricing
src/routes/          public pages, accounts, dashboard, billing, API, admin
src/monitor.js       background uptime checker
src/payments.js      Razorpay orders, signatures, plan activation
views/               page templates
public/              CSS, invoice tool script, favicon
deploy/              PM2, Nginx and backup files
```

## API (Pro and Business)

```bash
curl -X POST https://divyrs.com/api/v1/links \
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","code":"optional-code"}'
curl https://divyrs.com/api/v1/links    -H "Authorization: Bearer YOUR_KEY"
curl https://divyrs.com/api/v1/monitors -H "Authorization: Bearer YOUR_KEY"
```

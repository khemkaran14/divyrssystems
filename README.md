# Divyrs Systems

Online tools for professionals and companies, with free and paid plans:

- **Invoice / Quotation / Proforma / Receipt maker** — CGST/SGST/IGST, HSN codes, amount in words, PDF download
- **Appointment booking pages** — working hours, timezones, email confirmations, no double bookings (`/book/<name>`)
- **Digital business cards** — call/WhatsApp/UPI buttons, vCard "Save contact", QR code (`/c/<name>`)
- **Website forms** — form endpoint for any site, spam honeypot, email + CSV export (`/f/<key>`)
- **Uptime & SSL monitor** — 1–5 minute checks, downtime and certificate-expiry alerts, public status pages
- **Link shortener** — click counts, custom codes, REST API
- **QR code generator, GST calculator, EMI calculator** — free traffic pages

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
src/routes/          public pages, accounts, dashboard, services (forms/cards/booking), billing, API, admin
src/services/        booking slot logic
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

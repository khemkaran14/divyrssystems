# How divyrs.com makes money

## The idea in one line

Turn divyrs.com into a **small online-tools business**: free tools bring visitors in from Google, an account lets them save their work, and paid plans (₹499 / $9 and ₹1,999 / $29 a month) unlock the features professionals and companies need.

Why this works for a 10-year-old domain: an old domain already has some trust with Google. Free tool pages ("GST invoice generator", "QR code generator", "website uptime monitor") are things people search for every day. Each visitor is a chance to sign up, and some sign-ups pay every month.

## What is built

| Tool | Free (brings traffic) | Paid (makes money) |
|---|---|---|
| **GST Invoice Generator** | Unlimited invoices + PDF, no login | Remove "Made with Divyrs" footer, unlimited saved invoices |
| **Uptime Monitor** | 2 websites, every 5 min | 20–100 websites, every 1 min, email alerts, public status page, white-label |
| **Link Shortener** | 10 links with click counts | 1,000+ links, custom codes like `/s/diwali-sale`, API |
| **QR Code Generator** | Free forever | — (pure traffic magnet that leads into short links) |

Plans: Free, Pro ₹499/$9 per month, Business ₹1,999/$29 per month. Yearly = 10 months' price. Payments by Razorpay (UPI, cards, net banking in India; USD cards abroad). Plans are prepaid with no auto-renew, which keeps Razorpay setup simple and avoids failed-renewal headaches.

## Who pays, and why

1. **Web designers & agencies (best customers).** Every agency in India manages 10–50 client websites, often on Hostinger like you. They need to know when a client site goes down before the client calls. Business plan + white-label status page = ₹1,999/month that they can resell to their clients.
2. **Freelancers & consultants.** Want invoices without the "Made with" footer and saved history → Pro.
3. **Shops & small companies.** GST invoices, QR codes for counters/menus, trackable links for WhatsApp campaigns → Pro.

## Realistic targets

These are goals, not promises. Typical free-to-paid conversion for tools like this is 1–3% of sign-ups.

| Milestone | Paying customers | Monthly revenue |
|---|---|---|
| Month 3 | 10 Pro | ~₹5,000 |
| Month 6 | 30 Pro + 5 Business | ~₹25,000 |
| Month 12 | 80 Pro + 20 Business | ~₹80,000 |

Your costs are close to zero: it runs on the VPS you already pay for.

## 90-day launch plan

**Week 1 — go live**
- Deploy (see `DEPLOY.md`), fill in `.env`, sign up with your admin email.
- Apply for Razorpay (needs the legal pages, which are included).
- Add the site to Google Search Console and submit `https://divyrs.com/sitemap.xml`.

**Weeks 2–4 — first 10 customers by hand**
- Add your own other websites to the uptime monitor. Use it daily; fix what annoys you.
- Message 30 web designers/agencies you know (WhatsApp, LinkedIn, local Facebook groups): "Free uptime monitoring for your client sites, white-label status page on Business." Offer the first 10 a free month of Business via `/admin` in exchange for feedback.
- Put the invoice generator link in CA/accountant and small-business groups.

**Months 2–3 — Google traffic**
- Write one helpful page a week targeting what people search, e.g. "how to make a GST invoice", "UPI QR code generator", "how to know if my website is down", "free invoice format for freelancers". Each page links to the tool.
- Make small variations of tools as separate pages (each one is a new Google entry): UPI QR generator, Wi-Fi QR generator, invoice format for freelancers, proforma invoice, quotation maker.
- List on free directories: Product Hunt, AlternativeTo (as an alternative to UptimeRobot / Bitly / Zoho Invoice), IndieHackers.

**Ongoing**
- Check `/admin` weekly: sign-ups, paying users, revenue this month, contact messages.
- Every contact message from a company is a possible custom project. Custom software work is your highest-value income — the tools are the shop window.

## What to add next (in order of money)

1. **Team accounts** for Business (several logins on one plan) — companies ask for this first.
2. **WhatsApp / Telegram downtime alerts** — very popular in India, easy upsell.
3. **SSL certificate and domain expiry alerts** inside the uptime monitor — agencies love it.
4. **Custom domain for short links and status pages** (e.g. `status.clientsite.com`).
5. **Auto-renewing subscriptions** with Razorpay Subscriptions once you have 30+ customers.
6. **Hindi version** of the invoice and QR pages for more search traffic.

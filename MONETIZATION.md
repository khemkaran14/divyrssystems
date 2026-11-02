# How divyrs.com makes money

## The idea in one line

Turn divyrs.com into a **small online-tools business**: free tools bring visitors in from Google, an account lets them save their work, and paid plans (₹499 / $9 and ₹1,999 / $29 a month) unlock the features professionals and companies need.

Why this works for a 10-year-old domain: an old domain already has some trust with Google. Free tool pages ("GST invoice generator", "QR code generator", "website uptime monitor") are things people search for every day. Each visitor is a chance to sign up, and some sign-ups pay every month.

## What is built

| Tool | Free (brings traffic) | Paid (makes money) |
|---|---|---|
| **Invoice, Quotation, Proforma & Receipt maker** | Unlimited documents + PDF, no login | Remove "Made with Divyrs" footer, unlimited saved invoices |
| **Appointment booking page** | 20 bookings a month | Unlimited bookings, no Divyrs branding |
| **Digital business card** (WhatsApp, UPI, Save contact, QR) | 1 card | 3 cards (Pro), 25 cards for a whole sales team (Business), no branding |
| **Website forms** (form backend) | 1 form, 50 submissions a month | 20–100 forms, 2,000–unlimited submissions, CSV export |
| **Uptime & SSL Monitor** | 2 websites, every 5 min | 20–100 websites, every 1 min, downtime + SSL expiry alerts, status page, white-label |
| **Link Shortener** | 10 links with click counts | 1,000+ links, custom codes like `/s/diwali-sale`, API |
| **QR Code Generator, GST Calculator, EMI Calculator** | Free forever | — (traffic magnets: lots of Google searches in India) |

The free tiers are what people share: every free business card, booking page and status page carries a small "Make your own free…" link, so each user advertises Divyrs to their own customers. Paying removes it.

Plans: Free, Pro ₹499/$9 per month, Business ₹1,999/$29 per month. Yearly = 10 months' price. Payments by Razorpay (UPI, cards, net banking in India; USD cards abroad). Plans are prepaid with no auto-renew, which keeps Razorpay setup simple and avoids failed-renewal headaches.

## Who pays, and why

1. **Web designers & agencies (best customers).** Every agency in India manages 10–50 client websites, often on Hostinger like you. They need downtime and SSL-expiry alerts and working contact forms on static sites. Business plan + white-label status page = ₹1,999/month that they resell to their clients.
2. **Doctors, clinics, consultants, CAs, tutors, salons.** The booking page replaces "call to book" and WhatsApp back-and-forth. Once their clients use the link they don't leave → steady Pro customers.
3. **Companies with sales teams** (real estate, insurance, B2B). 25 digital business cards on one Business account, managed by the owner.
4. **Freelancers.** Quotations → invoices → receipts without the footer, plus a card and booking link → Pro.
5. **Shops & small companies.** GST invoices, UPI QR codes, trackable WhatsApp links → Pro.

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
- Put the invoice generator and GST calculator in CA/accountant and small-business groups.
- Visit 20 local clinics, salons and tutors. Set up their booking page and business card for them in 5 minutes, free for a month. Many will pay ₹499 after that.

**Months 2–3 — Google traffic**
- Write one helpful page a week targeting what people search, e.g. "how to make a GST invoice", "UPI QR code generator", "how to know if my website is down", "free invoice format for freelancers". Each page links to the tool.
- Make small variations of tools as separate pages (each one is a new Google entry): UPI QR generator, Wi-Fi QR generator, invoice format for freelancers, GST-inclusive price calculator, home-loan EMI calculator, "digital visiting card for real estate agents", "online appointment booking for doctors".
- List on free directories: Product Hunt, AlternativeTo (as an alternative to UptimeRobot / Bitly / Zoho Invoice), IndieHackers.

**Ongoing**
- Check `/admin` weekly: sign-ups, paying users, revenue this month, contact messages.
- Every contact message from a company is a possible custom project. Custom software work is your highest-value income — the tools are the shop window.

## What to add next (in order of money)

1. **Team accounts** for Business (several logins on one plan) — companies ask for this first.
2. **WhatsApp / Telegram alerts** for downtime and new bookings — very popular in India, easy upsell.
3. **Paid bookings**: clients pay the consultation fee by Razorpay while booking (take a small cut).
4. **Google Calendar sync** for booking pages.
5. **Domain expiry alerts** next to the SSL alerts.
6. **Custom domains** for cards, booking and status pages (e.g. `book.clinicname.com`).
7. **Auto-renewing subscriptions** with Razorpay Subscriptions once you have 30+ customers.
8. **Hindi versions** of the invoice, GST calculator and QR pages for more search traffic.

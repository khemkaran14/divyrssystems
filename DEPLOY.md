# Deploying to your Hostinger VPS

## Quick way (recommended): one command

SSH into the VPS as root and run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/khemkaran14/divyrssystems/claude/divyrs-monetization-strategy-54s2qt/deploy/install-vps.sh)
```

It installs the app in `/root/divyrssystems`, next to your other sites, and:

- picks a free port (from 3100 up) so it never clashes with your other apps
- uses the server's Node.js if it is version 22+, otherwise downloads a private Node 22 into `/root/divyrssystems/.node` (your other sites keep their Node)
- runs the app with PM2 as `divyrs`, alongside your other PM2 apps
- adds an Nginx config **only** for divyrs.com; if `nginx -t` fails it removes it again, so other sites are never affected
- turns on HTTPS once divyrs.com's DNS points at this server (otherwise it tells you which DNS records to set)
- sets up a daily database backup

Run the same command again any time to update to the latest code.

The manual steps below do the same thing by hand.

---

This runs next to your other websites. Nginx sends `divyrs.com` traffic to this app on port **3100** (change `PORT` in `.env` if 3100 is taken).

## 1. One-time server setup (skip what you already have)

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential sqlite3 nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 2. Get the code

```bash
sudo mkdir -p /var/www/divyrs && sudo chown $USER /var/www/divyrs
git clone https://github.com/khemkaran14/divyrssystems.git /var/www/divyrs
cd /var/www/divyrs
npm ci --omit=dev
cp .env.example .env
nano .env        # fill in the values (see below)
```

Minimum `.env` to go live:

| Setting | What to put |
|---|---|
| `BASE_URL` | `https://divyrs.com` |
| `SESSION_SECRET` | output of `openssl rand -hex 32` |
| `ADMIN_EMAIL` | the email you will sign up with — unlocks `/admin` |
| `SMTP_*` | a Hostinger mailbox (hPanel → Emails), e.g. `no-reply@divyrs.com` |
| `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `BUSINESS_ADDRESS` | shown on contact/legal pages; Razorpay checks these |
| `RAZORPAY_*` | from step 5; the site works without them (upgrade buttons say "contact us") |

## 3. Start it

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup      # run the command it prints, so the app restarts after a reboot
curl -I http://127.0.0.1:3100   # should say 200
```

## 4. Point the domain and add HTTPS

1. In Hostinger DNS for divyrs.com: `A` record `@` and `www` → your VPS IP.
2. Nginx:
   ```bash
   sudo cp deploy/nginx-divyrs.conf /etc/nginx/sites-available/divyrs.com
   sudo ln -s /etc/nginx/sites-available/divyrs.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d divyrs.com -d www.divyrs.com
   ```
3. Open https://divyrs.com, sign up with your `ADMIN_EMAIL`, and check `/admin`.

## 5. Turn on payments (Razorpay)

1. Sign up at razorpay.com as a business (proprietorship is fine: PAN + bank account; GST optional at the start).
2. Razorpay reviews your website. It needs these pages, which already exist: Contact, Terms, Privacy, Refund, Delivery (`/shipping`), and Pricing.
3. Settings → API Keys → generate **Live** keys → put them in `.env` as `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
4. Settings → Webhooks → add `https://divyrs.com/billing/webhook`, event `payment.captured`, set a secret → `RAZORPAY_WEBHOOK_SECRET`.
5. For USD payments from abroad: Settings → International payments → request activation.
6. `pm2 restart divyrs`. Test with Razorpay **Test** keys first if you like.

Customers who pay by bank transfer or UPI directly: activate them from `/admin` → "Set plan manually".

## 6. Backups

```bash
crontab -e
# add:
15 3 * * * /var/www/divyrs/deploy/backup.sh
```

## Updating later

```bash
cd /var/www/divyrs && git pull && npm ci --omit=dev && pm2 restart divyrs
```

## Useful commands

```bash
pm2 logs divyrs      # see errors and the "[mail disabled]" messages if SMTP isn't set
pm2 status
npm test             # run the tests
```


## RegData API (regulatory changes + enforcement actions)

It runs inside the same app; no extra server needed.

1. **Test the regulator feeds from your VPS** (this saves nothing):
   ```bash
   cd /root/divyrssystems && npm run regdata:check
   ```
   Each feed should show ✔ with recent RBI/SEBI items. If one shows ✘, send the output to Claude.
2. **Add your Claude API key** to `.env` (`ANTHROPIC_API_KEY=...`), then `pm2 restart divyrs`. Without it, RegData only reads titles.
3. **Open `/admin/regdata`** (signed in as `ADMIN_EMAIL`): click *Check feeds now*, then *Process 10 waiting*. After that it runs by itself every 30 minutes.
4. **Review** high-impact items in the admin review queue and mark them *Verified*.
5. Status any time: `npm run regdata:status`.

Feeds and settings: `src/regdata/sources.js` and the `REGDATA_*` lines in `.env.example`.


## Settings to fill in before going live

In `/root/divyrssystems/.env` (then `pm2 restart divyrs`):

| Setting | Why |
|---|---|
| `SMTP_PASS` (and other `SMTP_*`) | Welcome, password-reset, payment, alert and booking emails |
| `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `BUSINESS_ADDRESS` | Contact, legal and invoice pages |
| `GSTIN`, `BUSINESS_STATE` | Adds 18% GST to INR checkouts and prints GST tax invoices. Leave `GSTIN` empty if you are not GST-registered |
| `GRIEVANCE_OFFICER`, `GRIEVANCE_EMAIL` | Required in the privacy policy under the DPDP Act |
| `ANTHROPIC_API_KEY` | RegData document reading |
| `RAZORPAY_*` | Online payments |

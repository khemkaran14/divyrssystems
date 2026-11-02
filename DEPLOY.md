# Deploying to your Hostinger VPS

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

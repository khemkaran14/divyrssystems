#!/usr/bin/env bash
# Installs or updates Divyrs Systems on a VPS that already hosts other sites.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/khemkaran14/divyrssystems/claude/divyrs-monetization-strategy-54s2qt/deploy/install-vps.sh)
#
# Safe to run again: the second run just pulls the latest code and restarts.
# It never edits other sites' Nginx files or changes the system Node.js.
set -euo pipefail

DOMAIN="${DOMAIN:-divyrs.com}"
APP_DIR="${APP_DIR:-/root/divyrssystems}"
REPO="${REPO:-https://github.com/khemkaran14/divyrssystems.git}"
BRANCH="${BRANCH:-claude/divyrs-monetization-strategy-54s2qt}"
APP_NAME="divyrs"
NODE_MAJOR=22

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root."
command -v git  >/dev/null || { say "Installing git"; apt-get update -qq && apt-get install -y -qq git; }
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; }

# ---------------------------------------------------------------- code
say "Getting the code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"   # data/ and .env are git-ignored, so they are kept
  ok "Updated to latest $(git -C "$APP_DIR" log -1 --format=%h)"
elif [ -e "$APP_DIR" ]; then
  die "$APP_DIR exists but is not a git checkout. Move it away or set APP_DIR=/another/path"
else
  git clone -q -b "$BRANCH" "$REPO" "$APP_DIR"
  ok "Cloned"
fi
cd "$APP_DIR"

# ---------------------------------------------------------------- node
say "Checking Node.js"
NODE_BIN=""
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]; then
  NODE_BIN="$(command -v node)"
  ok "Using system Node $(node -v)"
else
  # Private Node just for this app, so other sites keep their Node version.
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) die "Unsupported CPU $(uname -m)";; esac
  if [ ! -x "$APP_DIR/.node/bin/node" ]; then
    VER="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o "\"version\":\"v${NODE_MAJOR}\.[0-9.]*\"" | head -1 | cut -d'"' -f4)"
    [ -n "$VER" ] || die "Could not find a Node $NODE_MAJOR download."
    say "Downloading private Node $VER (system Node is $(node -v 2>/dev/null || echo 'not installed'), left untouched)"
    mkdir -p "$APP_DIR/.node"
    curl -fsSL "https://nodejs.org/dist/$VER/node-$VER-linux-$ARCH.tar.xz" | tar -xJ -C "$APP_DIR/.node" --strip-components=1
  fi
  NODE_BIN="$APP_DIR/.node/bin/node"
  ok "Using private Node $("$NODE_BIN" -v) at $NODE_BIN"
fi
NODE_DIR="$(dirname "$NODE_BIN")"

say "Installing app packages"
if ! PATH="$NODE_DIR:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error; then
  warn "Retrying with build tools (needed only if no prebuilt SQLite binary matched)"
  apt-get update -qq && apt-get install -y -qq build-essential python3
  PATH="$NODE_DIR:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error
fi
ok "Packages installed"

# ---------------------------------------------------------------- .env
port_free() { ! ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

if [ ! -f .env ]; then
  say "First-time setup"
  PORT=3100
  while ! port_free "$PORT"; do PORT=$((PORT + 1)); done
  ADMIN_EMAIL=""
  read -r -p "Your email (gets the /admin page and SSL notices): " ADMIN_EMAIL </dev/tty || true
  cp .env.example .env
  sed -i "s|^PORT=.*|PORT=$PORT|" .env
  sed -i "s|^BASE_URL=.*|BASE_URL=https://$DOMAIN|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL|" .env
  chmod 600 .env
  ok "Created .env (port $PORT). Add Razorpay and email settings later with: nano $APP_DIR/.env"
fi
PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
ADMIN_EMAIL="$(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2)"
mkdir -p data backups

# ---------------------------------------------------------------- pm2
say "Starting the app with PM2"
if command -v pm2 >/dev/null; then
  PM2="$(command -v pm2)"
else
  PATH="$NODE_DIR:$PATH" npm install -g pm2 --no-audit --no-fund --loglevel=error
  PM2="$(PATH="$NODE_DIR:$PATH" command -v pm2)"
  NEW_PM2=1
fi
if "$PM2" describe "$APP_NAME" >/dev/null 2>&1; then
  "$PM2" restart "$APP_NAME" --update-env >/dev/null
else
  NODE_ENV=production "$PM2" start server.js --name "$APP_NAME" --cwd "$APP_DIR" \
    --interpreter "$NODE_BIN" --max-memory-restart 300M --time >/dev/null
fi
"$PM2" save >/dev/null
[ "${NEW_PM2:-0}" = 1 ] && "$PM2" startup systemd -u root --hp /root >/dev/null && ok "PM2 will start on boot"

for i in $(seq 1 15); do
  curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || { "$PM2" logs "$APP_NAME" --lines 30 --nostream; die "App did not start. Logs above."; }
ok "App is running on 127.0.0.1:$PORT"

# ---------------------------------------------------------------- nginx
say "Connecting $DOMAIN through Nginx"
if ! command -v nginx >/dev/null; then
  warn "Nginx is not installed. Something else serves your other sites:"
  ss -ltnp 2>/dev/null | grep -E ':(80|443) ' || true
  die "Point that web server at http://127.0.0.1:$PORT for $DOMAIN, or tell Claude what it is."
fi

if [ -d /etc/nginx/sites-available ]; then
  CONF=/etc/nginx/sites-available/$DOMAIN; LINK=/etc/nginx/sites-enabled/$DOMAIN
else
  CONF=/etc/nginx/conf.d/$DOMAIN.conf; LINK=""
fi

OTHER="$(grep -rlE "server_name[^;]*[[:space:]]$(echo "$DOMAIN" | sed 's/\./\\./g')([[:space:];]|$)" /etc/nginx 2>/dev/null | grep -vF "$CONF" | grep -vF "${LINK:-/nonexistent}" || true)"
if [ -n "$OTHER" ]; then
  warn "$DOMAIN is already configured in: $OTHER"
  die "Not touching that file. Remove or rename the old $DOMAIN config there, then run this script again."
fi

# Listen on IPv6 only if this server has it (otherwise nginx -t fails).
V6=""; [ -s /proc/net/if_inet6 ] && V6="    listen [::]:80;"

if [ ! -f "$CONF" ]; then
  cat > "$CONF" <<EOF
# Divyrs Systems (installed by deploy/install-vps.sh)
server {
    listen 80;
$V6
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  [ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
  if ! nginx -t 2>/tmp/divyrs-nginx-test.txt; then
    cat /tmp/divyrs-nginx-test.txt
    rm -f "$CONF" ${LINK:+"$LINK"}
    die "Nginx config test failed, so nothing was changed. Your other sites are unaffected."
  fi
  { systemctl reload nginx 2>/dev/null || nginx -s reload; }
  ok "Nginx now sends $DOMAIN to the app"
else
  # Keep the port in our own file in sync with .env.
  sed -i "s|proxy_pass http://127.0.0.1:[0-9]*;|proxy_pass http://127.0.0.1:$PORT;|" "$CONF"
  nginx -t 2>/dev/null && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
  ok "Nginx config already present"
fi

# ---------------------------------------------------------------- https
say "HTTPS certificate"
SERVER_IP="$(curl -fs4 --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}' || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
WWW_IP="$(getent ahostsv4 "www.$DOMAIN" | awk 'NR==1{print $1}' || true)"

if [ "$DNS_IP" != "$SERVER_IP" ]; then
  warn "$DOMAIN points to ${DNS_IP:-nothing}, but this server is $SERVER_IP."
  echo "   In Hostinger hPanel → Domains → $DOMAIN → DNS / Nameservers, set:"
  echo "     A   @    $SERVER_IP"
  echo "     A   www  $SERVER_IP   (or CNAME www → $DOMAIN)"
  echo "   Wait 10–60 minutes, then run this script again to add HTTPS."
elif [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  ok "Certificate already installed"
else
  command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; }
  DOMS=(-d "$DOMAIN"); [ "$WWW_IP" = "$SERVER_IP" ] && DOMS+=(-d "www.$DOMAIN")
  if [ -n "$ADMIN_EMAIL" ]; then MAIL=(-m "$ADMIN_EMAIL"); else MAIL=(--register-unsafely-without-email); fi
  certbot --nginx --non-interactive --agree-tos --no-eff-email --redirect "${MAIL[@]}" "${DOMS[@]}" && ok "HTTPS is on"
fi

# ---------------------------------------------------------------- backups
command -v crontab >/dev/null || { apt-get install -y -qq cron >/dev/null && { systemctl enable --now cron 2>/dev/null || true; }; }
if ! crontab -l 2>/dev/null | grep -qF "$APP_DIR/deploy/backup.sh"; then
  command -v sqlite3 >/dev/null || apt-get install -y -qq sqlite3 >/dev/null
  (crontab -l 2>/dev/null; echo "15 3 * * * $APP_DIR/deploy/backup.sh") | crontab -
  ok "Daily database backup at 03:15 into $APP_DIR/backups"
fi

say "Done"
echo "   Site:      https://$DOMAIN   (http:// until DNS + HTTPS are ready)"
echo "   Admin:     sign up at https://$DOMAIN/signup with ${ADMIN_EMAIL:-the ADMIN_EMAIL in .env}, then open /admin"
echo "   Settings:  nano $APP_DIR/.env   then   pm2 restart $APP_NAME"
echo "   Logs:      pm2 logs $APP_NAME"
echo "   Update:    run this same command again"

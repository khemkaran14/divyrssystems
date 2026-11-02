#!/usr/bin/env bash
# Daily database backup. Add to crontab:  15 3 * * * /var/www/divyrs/deploy/backup.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$APP_DIR/backups"
sqlite3 "$APP_DIR/data/divyrs.db" ".backup '$APP_DIR/backups/divyrs-$(date +%F).db'"
find "$APP_DIR/backups" -name 'divyrs-*.db' -mtime +14 -delete

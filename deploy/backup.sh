#!/usr/bin/env bash
# Daily database backup (install-vps.sh adds it to crontab automatically).
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$APP_DIR/backups"
sqlite3 "$APP_DIR/data/divyrs.db" ".backup '$APP_DIR/backups/divyrs-$(date +%F).db'"
find "$APP_DIR/backups" -name 'divyrs-*.db' -mtime +14 -delete

#!/usr/bin/env bash
# Daily database backup (install-vps.sh adds it to crontab automatically).
# Keeps 14 days on the server. If RCLONE_REMOTE is set in .env (e.g. "gdrive:divyrs-backups"),
# also copies each backup off the server and keeps 60 days there.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$APP_DIR/data/divyrs.db"
OUT="$APP_DIR/backups/divyrs-$(date +%F).db"
mkdir -p "$APP_DIR/backups"

sqlite3 "$DB" ".backup '$OUT'"
# Make sure the copy is a working database before trusting it.
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "Backup integrity check FAILED for $OUT" >&2
  exit 1
fi
gzip -f "$OUT"
find "$APP_DIR/backups" -name 'divyrs-*.db.gz' -mtime +14 -delete

REMOTE="$(grep -E '^RCLONE_REMOTE=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
if [ -n "$REMOTE" ] && command -v rclone >/dev/null; then
  rclone copy "$OUT.gz" "$REMOTE" --quiet
  rclone delete "$REMOTE" --min-age 60d --include 'divyrs-*.db.gz' --quiet || true
  echo "Backup copied to $REMOTE"
fi
echo "Backup OK: $OUT.gz"

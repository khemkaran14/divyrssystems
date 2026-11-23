#!/usr/bin/env bash
# Puts the web version (ultimate-style-guide-app) into resources/ as a read-only reference.
# Usage: tools/fetch-resources.sh [path-to-unzipped-or-cloned-web-app]
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=resources/ultimate-style-guide-app
if [ -d "$DEST/public/assets/js" ]; then echo "resources already present: $DEST"; exit 0; fi
mkdir -p resources
if [ "${1:-}" != "" ]; then mkdir -p "$DEST"; (cd "$1" && tar --exclude=.git -cf - .) | (cd "$DEST" && tar -xf -)
elif ls resources/ultimate-style-guide-app.zip >/dev/null 2>&1; then unzip -q resources/ultimate-style-guide-app.zip -d "$DEST"
else git clone --depth 1 https://github.com/khemkaran14/styleguideforwomen.git "$DEST"; rm -rf "$DEST/.git"; fi
# zips sometimes have one top-level folder
if [ ! -d "$DEST/public" ]; then inner=$(find "$DEST" -maxdepth 2 -type d -name public | head -1); [ -n "$inner" ] && mv "$(dirname "$inner")"/* "$DEST"/; fi
chmod -R a-w "$DEST"
echo "resources ready: $DEST"

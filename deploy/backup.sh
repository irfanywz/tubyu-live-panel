#!/usr/bin/env bash
# Backup database SQLite yang aman walau sedang dipakai (VACUUM INTO).
# Pakai cron, misalnya tiap hari jam 03:00:
#   0 3 * * * /opt/tubyu-live/deploy/backup.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/tubyu-live}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/app-$(date +%Y%m%d-%H%M%S).db"
node -e "const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('$APP_DIR/data/app.db');
db.exec(\"VACUUM INTO '$OUT'\");"
find "$BACKUP_DIR" -name 'app-*.db' -mtime +"$KEEP_DAYS" -delete
echo "Backup: $OUT"

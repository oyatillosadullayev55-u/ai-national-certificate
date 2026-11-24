#!/bin/sh
# PostgreSQL kunlik backup: siqilgan + shifrlangan (BACKUP_PASSPHRASE), RETENTION_DAYS kundan eskilari o'chiriladi.
# Offsite nusxa uchun /backups papkasini S3-compatible storage'ga sinxronlang (rclone / aws s3 sync).
set -eu
: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE kerak}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/backups/${PGDATABASE}_${STAMP}.dump.gpg"

pg_dump --format=custom --no-owner "$PGDATABASE" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT"

# Backup bo'sh emasligini tekshirish
[ "$(stat -c %s "$OUT")" -gt 1024 ] || { echo "backup juda kichik: $OUT" >&2; exit 1; }
find /backups -name '*.dump.gpg' -mtime +"$RETENTION_DAYS" -delete
date -u +%s > /backups/.last_success
echo "OK $OUT"

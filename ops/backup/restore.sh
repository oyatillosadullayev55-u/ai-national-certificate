#!/bin/sh
# Foydalanish: restore.sh /backups/anc_20260101T000000Z.dump.gpg [target_db]
# Tiklash sinovi: oyiga bir marta bo'sh bazaga tiklab, `SELECT count(*) FROM users` bilan tekshiring.
set -eu
FILE="$1"; TARGET="${2:-${PGDATABASE}_restore_test}"
: "${BACKUP_PASSPHRASE:?}"
createdb "$TARGET" 2>/dev/null || true
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d "$FILE" | pg_restore --no-owner --clean --if-exists -d "$TARGET"
psql -d "$TARGET" -c 'SELECT count(*) AS users FROM users;'

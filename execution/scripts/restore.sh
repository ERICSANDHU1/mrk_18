#!/usr/bin/env bash
# C5 — restore a backup produced by backup.sh into a TARGET database.
#
# Usage:  TARGET_DSN=postgresql://... ./scripts/restore.sh backups/mrk18_XXXX.dump
#
# DESTRUCTIVE on the target (--clean drops objects first). Restore into a FRESH
# database, verify (/readyz + the schema-health check), THEN cut over — never
# restore straight over a live production DB.
set -euo pipefail

FILE="${1:?path to a .dump file is required}"
DSN="${TARGET_DSN:?set TARGET_DSN to the restore target (a plain postgresql:// DSN)}"

if [[ ! -f "${FILE}" ]]; then
  echo "ERROR: no such dump file: ${FILE}" >&2
  exit 1
fi

echo "→ restoring ${FILE} into the target DB"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${DSN}" "${FILE}"
echo "✓ restore complete — now verify: hit /readyz and confirm schema health is ok"

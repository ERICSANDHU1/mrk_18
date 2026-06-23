#!/usr/bin/env bash
# C5 — timestamped logical backup of the MRK18 Postgres (Supabase).
#
# Usage:  DATABASE_URL_PG=postgresql://... ./scripts/backup.sh [out_dir]
#
# Use a DIRECT or SESSION-pooler (5432) connection string for pg_dump — the
# TRANSACTION pooler (6543) does not support pg_dump. Strip the
# `+asyncpg` driver suffix: plain `postgresql://`, not `postgresql+asyncpg://`.
set -euo pipefail

OUT_DIR="${1:-backups}"
DSN="${DATABASE_URL_PG:-${CHECKPOINTER_DSN:-}}"
if [[ -z "${DSN}" ]]; then
  echo "ERROR: set DATABASE_URL_PG (or CHECKPOINTER_DSN) to a plain postgresql:// DSN" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/mrk18_${STAMP}.dump"

echo "→ dumping to ${FILE}"
pg_dump --format=custom --no-owner --no-privileges --dbname="${DSN}" --file="${FILE}"
echo "✓ backup complete: $(du -h "${FILE}" | cut -f1) — ${FILE}"

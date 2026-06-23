# MRK18 — Backup & Restore Runbook (C5)

The DB is the source of truth (run state, content, audit chain, encrypted tokens).
Supabase keeps its own automated backups, but **own your own** logical dumps too —
they're portable, restorable anywhere, and prove the disaster path actually works.

## What's protected
- All application tables (founders, runs, content, approvals, signals, comments,
  knowledge, audit_log with its hash chain, connected_accounts with **encrypted**
  tokens — the `TOKEN_VAULT_KEY` stays in the environment, never in the dump).
- LangGraph checkpoint tables live in the same database, so they're included.

## Backup
```bash
# plain postgresql:// DSN (session pooler 5432 or direct — NOT 6543)
export DATABASE_URL_PG="postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:5432/postgres"
./scripts/backup.sh backups        # → backups/mrk18_<UTC timestamp>.dump
```
- Format is `custom` (compressed, selective restore).
- **Schedule:** daily via the platform scheduler (or the worker host's cron),
  retain 7 daily + 4 weekly. Store dumps off-Supabase (e.g. an object bucket).

## Restore (and the drill)
```bash
export TARGET_DSN="postgresql://...fresh-db..."   # a FRESH database, not prod
./scripts/restore.sh backups/mrk18_<stamp>.dump
```
Then **verify before cutover**:
1. `GET /readyz` → 200 (`db: true`).
2. Schema health: `python -c "import asyncio; from mrk18_execution.db.engine import build_engine; from mrk18_execution.db.schema_health import check_schema; print(asyncio.run(check_schema(build_engine('postgresql+asyncpg://...target...'))))"` → `{"ok": true}`.
3. `POST /maintenance/verify-audit-chain` (with `X-Maintenance-Key`) → `{"ok": true}` — the hash chain survived the round-trip.
4. Spot-check a known founder's run count.

## Test cadence
Run the **restore drill quarterly** into a throwaway DB and confirm steps 1–4.
An untested backup is a hope, not a backup.

## Notes
- `pg_dump`/`pg_restore` must match the server major version (Supabase is PG 15+).
- The dump excludes roles/ownership (`--no-owner --no-privileges`) so it restores
  cleanly into any target without Supabase's role setup.
- Secrets are NOT in the dump — set the same `.env` (vault key, signing key) on
  the restored deployment or encrypted tokens won't decrypt.

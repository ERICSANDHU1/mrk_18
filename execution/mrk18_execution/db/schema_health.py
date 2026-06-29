"""C5 — lightweight schema-version health check.

There is no Alembic here (migrations are Supabase SQL files), so instead of a
version number we assert that the hallmark columns the key migrations introduced
are present. All present → the DB is at/after the schema this code expects.
Missing → the DB is BEHIND its migrations; surfaced loudly at startup, never
silently. Read-only and dialect-agnostic (works on Postgres and the SQLite tests).
"""

from sqlalchemy import inspect

# (table, column) markers, each added by a migration. If every one is present,
# the running schema is current enough for this code.
EXPECTED_COLUMNS = [
    ("founders", "auth_user_id"),  # clerk_auth
    ("audit_log", "row_hash"),  # audit hash-chain
    ("content_items", "media"),  # generated images
    ("connected_accounts", "token_ciphertext"),  # token vault
    ("knowledge_chunks", "embedding"),  # company brain
    ("chat_sessions", "messages"),  # saved CMO chats (Recents)
    ("chat_sessions", "pinned"),  # Recents pin/archive menu
    ("applications", "marketing_issue"),  # Founding-50 waitlist
]


def _missing_sync(sync_conn) -> list[str]:
    insp = inspect(sync_conn)
    tables = set(insp.get_table_names())
    have = {t: {c["name"] for c in insp.get_columns(t)} for t in tables}
    return [
        f"{table}.{col}"
        for table, col in EXPECTED_COLUMNS
        if table not in have or col not in have[table]
    ]


async def check_schema(engine) -> dict:
    """Return {"ok": bool, "missing": [...]}. ok=False ⇒ the DB is behind its
    migrations (one or more expected columns are absent)."""
    async with engine.connect() as conn:
        missing = await conn.run_sync(_missing_sync)
    return {"ok": not missing, "missing": missing}

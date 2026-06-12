"""S3 / DPDP — data retention + the right to erasure.

DPDP Act 2023 obligations encoded here:
  * erase a founder's data within 7 days of request (right to erasure)
  * signals kept 12 months, audit logs 24 months (retention windows)

Erasure is a PRIVILEGED, logged operation — the only thing allowed to remove
rows the append-only triggers normally protect. It deletes everything personal
and leaves a single tamper-evident 'founder_erased' marker (no PII) so there is
proof the erasure happened.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..audit.recorder import record
from ..db.models import (
    ApprovalEventRow,
    AuditRow,
    ConnectedAccountRow,
    ContentItemRow,
    FounderProfileRow,
    FounderRow,
    OAuthStateRow,
    PublishResultRow,
    RunRow,
)
from ..schemas.enums import AuditEventType

log = logging.getLogger("mrk18.retention")

SIGNALS_RETENTION_DAYS = 365  # 12 months
AUDIT_RETENTION_DAYS = 730  # 24 months

# Tables protected by the append-only trigger, with their trigger names.
_APPEND_ONLY = {"audit_log": "audit_log_no_mutation", "approval_events": "approval_events_no_mutation"}

# Delete order: children before parents (FK-safe on Postgres).
# Audit rows are NOT deleted — they are REDACTED in place (Slice 2.4): the
# hash chain must survive erasure, or lawful erasure would be
# indistinguishable from tampering. PII is blanked; the links stay.
_ERASE_ORDER = [
    OAuthStateRow,
    ConnectedAccountRow,
    PublishResultRow,
    ApprovalEventRow,
    ContentItemRow,
    RunRow,
    FounderProfileRow,
    FounderRow,
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_pg(session: AsyncSession) -> bool:
    return session.bind.dialect.name == "postgresql"


async def _toggle_append_only_triggers(session: AsyncSession, enable: bool) -> None:
    if not _is_pg(session):
        return  # SQLite has no such triggers
    verb = "ENABLE" if enable else "DISABLE"
    for table, trigger in _APPEND_ONLY.items():
        await session.execute(text(f"ALTER TABLE {table} {verb} TRIGGER {trigger}"))


async def erase_founder(
    session_factory: async_sessionmaker, founder_id: UUID, media_store=None
) -> dict:
    """Right to erasure: remove ALL of a founder's data — DB rows, pipeline
    checkpoint state, and stored images — then record one minimal marker
    proving it happened. Returns per-store delete counts."""
    counts: dict[str, int] = {}
    thread_ids: list[str] = []

    async with session_factory() as session:
        async with session.begin():  # rollback restores trigger state on any error
            if await session.get(FounderRow, founder_id) is None:
                raise LookupError("founder not found")
            thread_ids = list(
                (
                    await session.execute(
                        select(RunRow.thread_id).where(RunRow.founder_id == founder_id)
                    )
                ).scalars()
            )
            await _toggle_append_only_triggers(session, enable=False)
            for model in _ERASE_ORDER:
                key_col = model.id if model is FounderRow else model.founder_id
                result = await session.execute(delete(model).where(key_col == founder_id))
                counts[model.__tablename__] = result.rowcount or 0
            # audit rows: REDACT in place — PII gone, hash chain intact
            redacted = await session.execute(
                update(AuditRow)
                .where(AuditRow.founder_id == founder_id)
                .values(outcome="redacted", detail={"redacted": True}, redacted=True)
            )
            counts["audit_log_redacted"] = redacted.rowcount or 0
            await _toggle_append_only_triggers(session, enable=True)  # before commit

    # LangGraph checkpoint state (holds profile + generated content) — PG only,
    # best-effort in its own transaction so a missing table never blocks erasure.
    counts["checkpoints"] = await _erase_checkpoints(session_factory, thread_ids)

    # stored images on the public bucket — best-effort, never fails the erasure.
    counts["storage_objects"] = await _erase_storage(media_store, founder_id)

    # the tamper-evident marker — separate transaction, no PII
    async with session_factory() as session:
        await record(
            session,
            event_type=AuditEventType.SECURITY_ALERT,
            agent_id="system:dpdp",
            founder_id=founder_id,
            outcome="founder_erased",
            detail={"deleted": counts, "erased_at": _utcnow().isoformat()},
        )
        await session.commit()

    log.info("erased founder %s: %s", founder_id, counts)
    return counts


_CHECKPOINT_TABLES = ("checkpoints", "checkpoint_writes", "checkpoint_blobs")


async def _erase_checkpoints(session_factory: async_sessionmaker, thread_ids: list[str]) -> int:
    if not thread_ids:
        return 0
    total = 0
    async with session_factory() as session:
        if not _is_pg(session):
            return 0  # tests use InMemorySaver — no such tables
        for table in _CHECKPOINT_TABLES:
            try:
                async with session.begin():
                    result = await session.execute(
                        text(f"DELETE FROM {table} WHERE thread_id = ANY(:ids)").bindparams(
                            ids=thread_ids
                        )
                    )
                    total += result.rowcount or 0
            except Exception as exc:  # noqa: BLE001 — table may be absent; log, continue
                log.warning("checkpoint erase skipped for %s: %r", table, exc)
    return total


async def _erase_storage(media_store, founder_id: UUID) -> int:
    """Delete the founder's images. media_store is injected by the caller (the
    privacy endpoint builds it from settings); None = skip, never auto-build,
    so unit tests make no network calls."""
    if media_store is None:
        return 0
    try:
        return await media_store.delete_prefix(str(founder_id))
    except Exception as exc:  # noqa: BLE001 — never let storage failure block erasure
        log.warning("storage erase failed for founder %s: %r", founder_id, exc)
        return 0


async def export_founder_data(session_factory: async_sessionmaker, founder_id: UUID) -> dict:
    """Right to access: everything we hold about a founder, EXCEPT secrets
    (tokens are returned as 'present, encrypted' — never the plaintext).

    Tenant-scoped: RLS is a second proof the export can only ever contain this
    founder's rows, even if a query below forgot its WHERE clause."""
    from .tenant import tenant_session

    async with tenant_session(session_factory, founder_id) as session:
        founder = await session.get(FounderRow, founder_id)
        if founder is None:
            raise LookupError("founder not found")
        profile = await session.get(FounderProfileRow, founder_id)
        runs = (
            (await session.execute(select(RunRow).where(RunRow.founder_id == founder_id)))
            .scalars()
            .all()
        )
        items = (
            (
                await session.execute(
                    select(ContentItemRow).where(ContentItemRow.founder_id == founder_id)
                )
            )
            .scalars()
            .all()
        )
        accounts = (
            (
                await session.execute(
                    select(ConnectedAccountRow).where(
                        ConnectedAccountRow.founder_id == founder_id
                    )
                )
            )
            .scalars()
            .all()
        )
    return {
        "founder": {"id": str(founder.id), "email": founder.email, "name": founder.display_name},
        "profile": (profile.profile if profile else None),
        "runs": [{"run_id": str(r.run_id), "status": r.status} for r in runs],
        "content_items": [
            {"item_id": str(i.item_id), "platform": i.platform, "status": i.status, "body": i.body}
            for i in items
        ],
        "connected_accounts": [
            {"platform": a.platform, "status": a.status, "token": "present, encrypted"}
            if a.token_ciphertext
            else {"platform": a.platform, "status": a.status, "token": None}
            for a in accounts
        ],
    }


async def withdraw_consent(session_factory: async_sessionmaker, founder_id: UUID) -> dict:
    """DPDP right to withdraw consent — processing STOPS, data stays (erasure
    is its own right). Concretely:
      * profile status → 'consent_withdrawn' (start_run's hard gate refuses it)
      * the draft's consent answer is cleared — re-completing intake demands a
        fresh affirmative consent; the stored profile stays as the historical
        record of what WAS consented to
      * items awaiting approval expire; runs left waiting at gates close
    Withdrawal must be as easy as giving consent — one call, no questions."""
    from .tenant import tenant_session

    async with tenant_session(session_factory, founder_id) as session:
        profile = await session.get(FounderProfileRow, founder_id)
        if profile is None:
            raise LookupError("founder not found")
        profile.status = "consent_withdrawn"
        profile.draft = {**(profile.draft or {}), "consent_given": False}

        stale_items = (
            (
                await session.execute(
                    select(ContentItemRow).where(
                        ContentItemRow.founder_id == founder_id,
                        ContentItemRow.status == "awaiting_approval",
                    )
                )
            )
            .scalars()
            .all()
        )
        for item in stale_items:
            item.status = "expired"
            item.updated_at = _utcnow()

        waiting_runs = (
            (
                await session.execute(
                    select(RunRow).where(
                        RunRow.founder_id == founder_id,
                        RunRow.status.in_(("awaiting_gate1", "awaiting_gate2")),
                    )
                )
            )
            .scalars()
            .all()
        )
        for run in waiting_runs:
            run.status = "done"
            run.gate2 = {"awaiting": False, "consent_withdrawn": True}
            run.finished_at = _utcnow()

        await record(
            session,
            event_type=AuditEventType.GATE_DECISION,
            agent_id="system:dpdp",
            founder_id=founder_id,
            outcome="consent_withdrawn",
            detail={
                "items_expired": len(stale_items),
                "runs_closed": len(waiting_runs),
            },
        )
        await session.commit()
    return {
        "status": "consent_withdrawn",
        "items_expired": len(stale_items),
        "runs_closed": len(waiting_runs),
    }


async def purge_audit_older_than(
    session_factory: async_sessionmaker, days: int = AUDIT_RETENTION_DAYS
) -> int:
    """Retention: drop audit rows past the 24-month window (privileged op)."""
    cutoff = _utcnow() - timedelta(days=days)
    async with session_factory() as session:
        async with session.begin():  # rollback restores triggers on any error
            await _toggle_append_only_triggers(session, enable=False)
            result = await session.execute(
                delete(AuditRow).where(AuditRow.created_at < cutoff)
            )
            await _toggle_append_only_triggers(session, enable=True)  # before commit
        return result.rowcount or 0


async def count_audit(session_factory: async_sessionmaker) -> int:
    async with session_factory() as session:
        return (await session.execute(select(func.count()).select_from(AuditRow))).scalar_one()

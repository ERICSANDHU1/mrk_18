"""Audit recorder — every action writes a row, starting from endpoint one.

The Pydantic AuditRecord is constructed first so its type-level invariants
(e.g. publish-requires-approval) run before anything touches the database.

Slice 2.4 adds two duties:

* Tamper-evident chaining — each row carries
  ``row_hash = sha256(prev_hash + canonical content)`` linked to the previous
  row in its SCOPE (one chain per founder, one global chain for system events
  with no founder). Per-scope because audit writes run under the RLS tenant
  role, which can only see its own founder's rows. On Postgres an advisory
  transaction lock serializes writers per scope so two concurrent writes
  can't both claim the same predecessor. ``verify_audit_chain`` walks every
  scope and reports the first broken link — "has anyone rewritten history?"
  becomes a one-call cryptographic question.

* The siren — a SECURITY_ALERT row isn't just stored: it emits a CRITICAL log
  line and calls every registered alert hook (webhook/email at go-live), so a
  rogue publish attempt is *heard*, not filed.
"""

import hashlib
import json
import logging
from collections.abc import Callable
from datetime import datetime, timezone
from inspect import isawaitable
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..db.models import AuditRow
from ..schemas.audit import AuditRecord
from ..schemas.enums import AuditEventType

log = logging.getLogger("mrk18.audit")

GENESIS = "genesis"

# ── the siren ────────────────────────────────────────────────────────────────

_alert_hooks: list[Callable] = []


def register_alert_hook(hook: Callable) -> None:
    """hook(record) — sync or async; called on every SECURITY_ALERT. Hook
    failures are logged and swallowed: alerting must never break the pipeline."""
    _alert_hooks.append(hook)


def clear_alert_hooks() -> None:
    _alert_hooks.clear()


async def _sound_alarm(rec: AuditRecord) -> None:
    log.critical(
        "SECURITY ALERT [%s] founder=%s run=%s: %s %s",
        rec.agent_id,
        rec.founder_id,
        rec.run_id,
        rec.outcome,
        rec.detail,
    )
    for hook in list(_alert_hooks):
        try:
            result = hook(rec)
            if isawaitable(result):
                await result
        except Exception:  # noqa: BLE001 — the siren must never kill the request
            log.exception("alert hook %r failed", hook)


# ── the chain ────────────────────────────────────────────────────────────────


def _canon_ts(dt: datetime) -> str:
    """UTC, naive, isoformat — identical for the tz-aware mint-time value and
    the naive value SQLite hands back on re-read."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat()


def _row_content(row_like) -> str:
    """Canonical JSON of everything a row asserts (works for AuditRow and
    AuditRecord-shaped objects alike)."""
    payload = {
        "record_id": str(row_like.record_id),
        "event_type": str(getattr(row_like.event_type, "value", row_like.event_type)),
        "agent_id": row_like.agent_id,
        "founder_id": str(row_like.founder_id) if row_like.founder_id else None,
        "run_id": str(row_like.run_id) if row_like.run_id else None,
        "approval_event_id": (
            str(row_like.approval_event_id) if row_like.approval_event_id else None
        ),
        "platform": str(getattr(row_like.platform, "value", row_like.platform))
        if row_like.platform
        else None,
        "outcome": row_like.outcome,
        "detail": row_like.detail,
        "created_at": _canon_ts(
            getattr(row_like, "created_at", None) or row_like.timestamp
        ),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _link_hash(prev_hash: str, content: str) -> str:
    return hashlib.sha256(f"{prev_hash}|{content}".encode()).hexdigest()


def _scope_filter(founder_id: UUID | None):
    return (
        AuditRow.founder_id == founder_id
        if founder_id is not None
        else AuditRow.founder_id.is_(None)
    )


async def _chain_tail(session: AsyncSession, founder_id: UUID | None) -> str:
    """row_hash of the scope's latest row. Postgres: advisory-lock the scope
    first so concurrent writers serialize; SQLite is single-writer anyway."""
    if session.bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:scope))").bindparams(
                scope=f"mrk18_audit:{founder_id or 'global'}"
            )
        )
    tail = (
        await session.execute(
            select(AuditRow.row_hash)
            .where(_scope_filter(founder_id))
            .order_by(AuditRow.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    # NULL tail = empty scope OR a legacy unchained row; both anchor at genesis
    return tail or GENESIS


async def record(
    session: AsyncSession,
    *,
    event_type: AuditEventType,
    agent_id: str,
    outcome: str,
    founder_id: UUID | None = None,
    run_id: UUID | None = None,
    approval_event_id: UUID | None = None,
    platform: str | None = None,
    detail: dict | None = None,
) -> AuditRecord:
    rec = AuditRecord(
        event_type=event_type,
        agent_id=agent_id,
        outcome=outcome,
        founder_id=founder_id,
        run_id=run_id,
        approval_event_id=approval_event_id,
        platform=platform,  # validated by the schema's Platform enum if set
        detail=detail or {},
    )
    prev_hash = await _chain_tail(session, rec.founder_id)
    row = AuditRow(
        record_id=rec.record_id,
        event_type=rec.event_type.value,
        agent_id=rec.agent_id,
        founder_id=rec.founder_id,
        run_id=rec.run_id,
        approval_event_id=rec.approval_event_id,
        platform=rec.platform.value if rec.platform else None,
        outcome=rec.outcome,
        detail=rec.detail,
        created_at=rec.timestamp,
    )
    row.prev_hash = prev_hash
    row.row_hash = _link_hash(prev_hash, _row_content(row))
    session.add(row)

    if rec.event_type == AuditEventType.SECURITY_ALERT:
        await _sound_alarm(rec)
    return rec


async def verify_audit_chain(session_factory: async_sessionmaker) -> dict:
    """Walk every scope's chain; report the first broken link per scope.

    Rules per scope (rows in id order):
      * NULL-hash rows are pre-chain legacy — counted, never verified.
      * The first hashed row after a gap is an ANCHOR (its predecessor may
        have been purged by retention) — linkage unchecked, content checked.
      * redacted rows: content was lawfully blanked, so only the stored
        linkage is checked, never recomputed.
    """
    scopes: dict[str, dict] = {}
    breaks: list[dict] = []
    legacy = 0
    async with session_factory() as session:
        rows = (
            (await session.execute(select(AuditRow).order_by(AuditRow.id)))
            .scalars()
            .all()
        )
    for row in rows:
        scope = str(row.founder_id) if row.founder_id else "global"
        state = scopes.setdefault(scope, {"tail": None, "checked": 0, "redacted": 0})
        if row.row_hash is None:
            legacy += 1
            state["tail"] = None  # chain restarts at the next hashed row
            continue
        if state["tail"] is not None and row.prev_hash != state["tail"]:
            breaks.append({"scope": scope, "row_id": row.id, "reason": "link mismatch"})
            state["tail"] = row.row_hash  # keep walking to find further damage
            continue
        if row.redacted:
            state["redacted"] += 1
        elif _link_hash(row.prev_hash, _row_content(row)) != row.row_hash:
            breaks.append({"scope": scope, "row_id": row.id, "reason": "content mismatch"})
            state["tail"] = row.row_hash
            continue
        state["checked"] += 1
        state["tail"] = row.row_hash
    return {
        "ok": not breaks,
        "scopes": len(scopes),
        "checked": sum(s["checked"] for s in scopes.values()),
        "redacted": sum(s["redacted"] for s in scopes.values()),
        "legacy_unchained": legacy,
        "breaks": breaks,
    }

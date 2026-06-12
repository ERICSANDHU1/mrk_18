"""Run lifecycle: start → execute until Gate 1 → resume → done/failed.

The graph owns thinking; this module owns truth: every transition lands in
the runs table and the audit log, so the database — not any in-memory object —
is always the source of what happened.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..audit.recorder import record
from ..db.models import ApprovalEventRow, ContentItemRow, FounderProfileRow, RunRow
from ..llm.socket import PRICES_USD_PER_M, USD_TO_INR
from ..schemas.approval import ApprovalEvent
from ..schemas.content import can_transition
from ..schemas.enums import ApprovalDecision, AuditEventType, ContentStatus
from ..security.tenant import tenant_session
from .analysis import latest_items

AGENT = "agent:orchestrator"
log = logging.getLogger("mrk18.lifecycle")

# DB statuses that an out-of-band actor (publisher, expiry job) owns; stale
# in-graph state must never revive or downgrade these (review finding B1).
TERMINAL_STATUSES = frozenset({"exported", "published", "expired", "failed"})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _scoped(session_factory: async_sessionmaker, founder_id: UUID | None):
    """tenant_session when the run's owner is known (RLS enforces); a plain
    session when it isn't (the run vanished — the writes will no-op anyway)."""
    return (
        tenant_session(session_factory, founder_id)
        if founder_id is not None
        else session_factory()
    )


async def fail_run(session_factory: async_sessionmaker, run_id: UUID, exc: BaseException) -> None:
    """Land a run as 'failed' from a fresh session — the last-resort safety net
    for failures OUTSIDE _drive's own try/except (review finding B3). Defensive:
    if even this fails, it logs rather than vanishing."""
    try:
        async with session_factory() as session:
            row = await session.get(RunRow, run_id)
            if row is None or row.status in ("done", "failed"):
                return
            row.status = "failed"
            row.error = f"{type(exc).__name__}: {exc}"[:2000]
            row.finished_at = _utcnow()
            await record(
                session,
                event_type=AuditEventType.ERROR,
                agent_id=AGENT,
                founder_id=row.founder_id,
                run_id=run_id,
                outcome="run_failed_outside_drive",
                detail={"error": row.error},
            )
            await session.commit()
    except Exception:  # noqa: BLE001 — the safety net itself must never raise
        log.exception("fail_run could not record failure for run %s", run_id)


def _totals(usage_entries: list[dict]) -> tuple[int, int, float]:
    tin = sum(u["tokens_in"] for u in usage_entries)
    tout = sum(u["tokens_out"] for u in usage_entries)
    inr = 0.0
    for u in usage_entries:
        p_in, p_out = PRICES_USD_PER_M.get(u["model"], (0.0, 0.0))
        inr += (u["tokens_in"] * p_in + u["tokens_out"] * p_out) / 1_000_000 * USD_TO_INR
    return tin, tout, round(inr, 4)


async def start_run(session_factory: async_sessionmaker, founder_id: UUID) -> RunRow:
    """Create the run row. Hard gate: only a ready_for_analysis founder may run."""
    async with tenant_session(session_factory, founder_id) as session:
        profile = (
            await session.execute(
                select(FounderProfileRow).where(FounderProfileRow.founder_id == founder_id)
            )
        ).scalar_one_or_none()
        if profile is None:
            raise LookupError("founder not found")
        if profile.status != "ready_for_analysis":
            raise ValueError("intake is not complete — analysis cannot start")

        run_id = uuid4()
        row = RunRow(
            run_id=run_id,
            founder_id=founder_id,
            thread_id=str(run_id),
            status="generating",
        )
        session.add(row)
        await record(
            session,
            event_type=AuditEventType.RUN_STARTED,
            agent_id=AGENT,
            founder_id=founder_id,
            run_id=run_id,
            outcome="analysis_run_started",
        )
        await session.commit()
        return row


async def _drive(graph, session_factory: async_sessionmaker, run_id: UUID, graph_input) -> None:
    """Invoke the graph and persist whatever state it lands in."""
    # owner for RLS scoping — the run already exists (start_run created it)
    async with session_factory() as probe:
        prow = await probe.get(RunRow, run_id)
        founder_id = prow.founder_id if prow else None

    config = {"configurable": {"thread_id": str(run_id)}}
    try:
        result = await graph.ainvoke(graph_input, config=config, durability="sync")
    except Exception as exc:  # noqa: BLE001 — a run failure must land in the DB, whatever it was
        async with _scoped(session_factory, founder_id) as session:
            row = await session.get(RunRow, run_id)
            if row is not None:
                row.status = "failed"
                row.error = f"{type(exc).__name__}: {exc}"[:2000]
                row.finished_at = _utcnow()
                await record(
                    session,
                    event_type=AuditEventType.ERROR,
                    agent_id=AGENT,
                    founder_id=row.founder_id,
                    run_id=run_id,
                    outcome="analysis_run_failed",
                    detail={"error": row.error},
                )
                await session.commit()
        return

    async with _scoped(session_factory, founder_id) as session:
        row = await session.get(RunRow, run_id)
        if row is None:
            return
        tin, tout, inr = _totals(result.get("usage", []))
        row.tokens_in, row.tokens_out, row.cost_inr = tin, tout, inr
        report = result.get("report")
        if report and result.get("founder_flags"):
            # the founder's standing disagreements ride on the final report,
            # even when the re-run budget is exhausted
            report = {**report, "founder_flags": result["founder_flags"]}
        row.report = report

        # Persist the LIVE view of every content item (upsert — items evolve
        # through awaiting → approved/rejected → regenerated versions).
        items = latest_items(result.get("content_items", []))
        images = 0
        for it in items.values():
            images += len(it.get("media", []))
            existing = await session.get(ContentItemRow, UUID(it["item_id"]))
            if existing is None:
                session.add(
                    ContentItemRow(
                        item_id=UUID(it["item_id"]),
                        run_id=run_id,
                        founder_id=row.founder_id,
                        platform=it["platform"],
                        format=it["format"],
                        body=it["body"],
                        thread=it.get("thread"),
                        link_url=it.get("link_url"),
                        first_comment=it.get("first_comment"),
                        image_prompt=it.get("image_prompt"),
                        media=it.get("media", []),
                        status=it.get("status", "draft"),
                        regeneration_note=it.get("regeneration_note"),
                        regeneration_count=it.get("regeneration_count", 0),
                    )
                )
            else:
                db_status = existing.status
                graph_status = it.get("status", db_status)
                # B1: never let stale in-graph state revive/downgrade an item
                # an out-of-band actor (publisher/expiry) already decided.
                if db_status in TERMINAL_STATUSES and graph_status != db_status:
                    continue
                existing.body = it["body"]
                existing.thread = it.get("thread")
                existing.first_comment = it.get("first_comment")
                existing.image_prompt = it.get("image_prompt")
                existing.link_url = it.get("link_url")  # L6: was omitted on update
                existing.media = it.get("media", [])
                existing.regeneration_note = it.get("regeneration_note")
                existing.regeneration_count = it.get("regeneration_count", 0)
                # only advance status via a legal transition (matches the guard
                # the publisher/ops paths already use).
                if graph_status != db_status and can_transition(
                    ContentStatus(db_status), ContentStatus(graph_status)
                ):
                    existing.status = graph_status
                existing.updated_at = _utcnow()
        if items:
            row.images_generated = images

        interrupts = result.get("__interrupt__")
        if interrupts:
            payload = interrupts[0].value
            gate = payload.get("gate", "gate1_report_review")
            if gate == "gate2_items_review":
                row.status = "awaiting_gate2"
                row.gate2 = {"awaiting": True, "payload": payload}
            else:
                row.status = "awaiting_gate1"
                row.gate1 = {"awaiting": True, "payload": payload}
            outcome = f"{gate}_reached"
            event = AuditEventType.AGENT_ACTION
        else:
            row.status = "done"
            if row.gate1 and row.gate1.get("awaiting"):
                row.gate1 = {"awaiting": False, "decision": result.get("gate1_decision")}
            if items:
                row.gate2 = {"awaiting": False}
            row.finished_at = _utcnow()
            outcome = "analysis_run_completed"
            event = AuditEventType.AGENT_ACTION
        await record(
            session,
            event_type=event,
            agent_id=AGENT,
            founder_id=row.founder_id,
            run_id=run_id,
            outcome=outcome,
            detail={"tokens_in": tin, "tokens_out": tout, "cost_inr": inr},
        )
        await session.commit()


async def execute_run(graph, session_factory: async_sessionmaker, run: RunRow) -> None:
    # B3: profile load happens BEFORE _drive's own try/except, so guard the
    # whole body — any failure here must land the run as 'failed', never vanish.
    try:
        graph_input = {
            "run_id": str(run.run_id),
            "founder_id": str(run.founder_id),
            "profile": await _load_profile(session_factory, run.founder_id),
            "founder_flags": [],
            "rerun_count": 0,
            "analyses": [],
            "usage": [],
            "report": None,
            "gate1_decision": None,
        }
        await _drive(graph, session_factory, run.run_id, graph_input)
    except Exception as exc:  # noqa: BLE001
        log.exception("execute_run failed for run %s", run.run_id)
        await fail_run(session_factory, run.run_id, exc)


async def _lock_run(session, run_id: UUID) -> RunRow | None:
    """Read the run row FOR UPDATE so concurrent gate resumes serialize (B2).
    Real lock on Postgres; SQLAlchemy emits no lock clause on SQLite, so tests
    (which never race) are unaffected."""
    return (
        await session.execute(
            select(RunRow).where(RunRow.run_id == run_id).with_for_update()
        )
    ).scalar_one_or_none()


async def resume_gate1(
    graph, session_factory: async_sessionmaker, run_id: UUID, decision: dict
) -> None:
    try:
        async with session_factory() as probe:  # owner for RLS scoping
            prow = await probe.get(RunRow, run_id)
            if prow is None:
                raise LookupError("run not found")
            founder_id = prow.founder_id
        async with tenant_session(session_factory, founder_id) as session:
            row = await _lock_run(session, run_id)
            if row is None:
                raise LookupError("run not found")
            if row.status != "awaiting_gate1":
                # a concurrent submit already advanced this gate — not an error
                log.info("gate1 resume skipped for run %s (status %s)", run_id, row.status)
                return
            row.status = "generating"
            await record(
                session,
                event_type=AuditEventType.GATE_DECISION,
                agent_id="founder",
                founder_id=row.founder_id,
                run_id=run_id,
                outcome=f"gate1_{decision.get('action', 'unknown')}",
                detail=decision,
            )
            await session.commit()
        await _drive(graph, session_factory, run_id, Command(resume=decision))
    except LookupError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("resume_gate1 failed for run %s", run_id)
        await fail_run(session_factory, run_id, exc)


async def resume_gate2(
    graph,
    session_factory: async_sessionmaker,
    run_id: UUID,
    decisions: list[dict],
    signing_key: str | None = None,
) -> None:
    """Founder decisions at Gate 2: mint events, then resume the graph."""
    resume_map = await mint_gate2_decisions(
        session_factory, run_id, decisions, signing_key=signing_key
    )
    await _drive(graph, session_factory, run_id, Command(resume=resume_map))


async def mint_gate2_decisions(
    session_factory: async_sessionmaker,
    run_id: UUID,
    decisions: list[dict],
    signing_key: str | None = None,
) -> dict[str, dict]:
    """Validate the founder's Gate 2 decisions and mint one immutable
    ApprovalEvent per decision — BEFORE the graph resumes. The publisher will
    trust only these events, never the graph state. Raises ValueError with a
    human-readable reason if anything is off (nothing is minted then)."""
    # M3: a single batch may not decide the same item twice.
    seen: set[str] = set()
    for d in decisions:
        iid = str(d["item_id"])
        if iid in seen:
            raise ValueError(f"item {iid} decided more than once in one batch")
        seen.add(iid)

    async with session_factory() as probe:  # owner for RLS scoping
        prow = await probe.get(RunRow, run_id)
        if prow is None:
            raise LookupError("run not found")
        founder_id = prow.founder_id

    async with tenant_session(session_factory, founder_id) as session:
        row = await _lock_run(session, run_id)  # B2: serialize concurrent gate2 submits
        if row is None:
            raise LookupError("run not found")
        if row.status != "awaiting_gate2":
            raise ValueError(f"run is not waiting at gate 2 (status: {row.status})")

        resume_map: dict[str, dict] = {}
        for d in decisions:
            item = await session.get(ContentItemRow, UUID(str(d["item_id"])))
            if item is None or item.run_id != run_id:
                raise ValueError(f"item {d['item_id']} does not belong to this run")
            if item.status != "awaiting_approval":
                raise ValueError(f"item {d['item_id']} is not awaiting approval ({item.status})")

            event = ApprovalEvent(  # schema validates decision enum, note length
                run_id=run_id,
                item_id=item.item_id,
                founder_id=row.founder_id,
                decision=ApprovalDecision(
                    "approved" if d["action"] == "approve" else "rejected"
                ),
                note=d.get("note"),
            )
            if signing_key:
                # Slice 2.3 — the MAC freezes the EXACT content being decided;
                # the publisher refuses anything that doesn't verify against it.
                from ..security.approvalsig import item_content_hash, sign_approval

                event = event.model_copy(
                    update={
                        "signature": sign_approval(
                            signing_key,
                            event_id=event.event_id,
                            item_hash=item_content_hash(item),
                            founder_id=event.founder_id,
                            decision=event.decision.value,
                            decided_at=event.decided_at,
                        )
                    }
                )
            session.add(
                ApprovalEventRow(
                    event_id=event.event_id,
                    run_id=event.run_id,
                    item_id=event.item_id,
                    founder_id=event.founder_id,
                    decision=event.decision.value,
                    note=event.note,
                    signature=event.signature,
                    decided_at=event.decided_at,
                )
            )
            await record(
                session,
                event_type=AuditEventType.GATE_DECISION,
                agent_id="founder",
                founder_id=row.founder_id,
                run_id=run_id,
                approval_event_id=event.event_id,
                outcome=f"gate2_item_{event.decision.value}",
                detail={"item_id": str(item.item_id), "note": event.note or ""},
            )
            resume_map[str(item.item_id)] = {"action": d["action"], "note": d.get("note")}

        row.status = "generating"
        await session.commit()
    return resume_map


async def resume_gate2_drive(
    graph, session_factory: async_sessionmaker, run_id: UUID, resume_map: dict
) -> None:
    """Drive-only half: used by the API after mint_gate2_decisions succeeded."""
    try:
        await _drive(graph, session_factory, run_id, Command(resume=resume_map))
    except Exception as exc:  # noqa: BLE001 — B3: never let a background drive vanish
        log.exception("resume_gate2_drive failed for run %s", run_id)
        await fail_run(session_factory, run_id, exc)


async def expire_stale_approvals(
    session_factory: async_sessionmaker, max_age_hours: int = 48
) -> int:
    """Silence = rejection. Items awaiting approval past the window expire —
    terminal, no regeneration. (Production: ARQ cron calls this; pilot: manual
    or per-request.) Runs left with nothing awaiting are closed out."""
    from datetime import timedelta

    cutoff = _utcnow() - timedelta(hours=max_age_hours)
    expired = 0
    async with session_factory() as session:
        stale = (
            (
                await session.execute(
                    select(ContentItemRow).where(
                        ContentItemRow.status == "awaiting_approval",
                        ContentItemRow.updated_at < cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        touched_runs: set[UUID] = set()
        for item in stale:
            item.status = "expired"
            item.updated_at = _utcnow()
            touched_runs.add(item.run_id)
            expired += 1
            await record(
                session,
                event_type=AuditEventType.GATE_DECISION,
                agent_id="system:expiry",
                founder_id=item.founder_id,
                run_id=item.run_id,
                outcome="gate2_item_expired_silence",
                detail={"item_id": str(item.item_id), "max_age_hours": max_age_hours},
            )
        for run_id in touched_runs:
            remaining = (
                (
                    await session.execute(
                        select(ContentItemRow).where(
                            ContentItemRow.run_id == run_id,
                            ContentItemRow.status == "awaiting_approval",
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not remaining:
                run = await session.get(RunRow, run_id)
                if run is not None and run.status == "awaiting_gate2":
                    run.status = "done"
                    run.gate2 = {"awaiting": False, "expired": True}
                    run.finished_at = _utcnow()
        await session.commit()
    return expired


async def _load_profile(session_factory: async_sessionmaker, founder_id: UUID) -> dict:
    async with tenant_session(session_factory, founder_id) as session:
        profile = (
            await session.execute(
                select(FounderProfileRow).where(FounderProfileRow.founder_id == founder_id)
            )
        ).scalar_one()
        return profile.profile or {}

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
from ..config import get_settings
from ..llm.socket import cost_inr_for
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
    inr = sum(cost_inr_for(u["model"], u["tokens_in"], u["tokens_out"]) for u in usage_entries)
    return tin, tout, round(inr, 4)


class CostCapExceeded(Exception):
    """Raised when a founder's daily ₹ budget is already spent (A5)."""


def _run_cap_inr(override: float | None) -> float:
    return override if override is not None else get_settings().run_cost_cap_inr


def _daily_cap_inr(override: float | None) -> float:
    return override if override is not None else get_settings().daily_cost_cap_inr


async def _today_spend_inr(session, founder_id: UUID) -> float:
    """Metered ₹ across the founder's runs since 00:00 UTC today."""
    from sqlalchemy import func

    start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    total = (
        await session.execute(
            select(func.coalesce(func.sum(RunRow.cost_inr), 0)).where(
                RunRow.founder_id == founder_id, RunRow.started_at >= start
            )
        )
    ).scalar_one()
    return float(total or 0.0)


async def start_run(
    session_factory: async_sessionmaker,
    founder_id: UUID,
    *,
    daily_cost_cap_inr: float | None = None,
) -> RunRow:
    """Create the run row. Hard gates: only a ready_for_analysis founder may run,
    and not once today's metered spend has hit the daily ₹ cap (A5)."""
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

        cap = _daily_cap_inr(daily_cost_cap_inr)
        if cap and cap > 0:
            spent = await _today_spend_inr(session, founder_id)
            if spent >= cap:
                raise CostCapExceeded(
                    f"daily cost cap ₹{cap:.0f} reached (₹{spent:.2f} spent today) — "
                    "runs resume tomorrow or raise the cap"
                )

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


async def _drive(
    graph,
    session_factory: async_sessionmaker,
    run_id: UUID,
    graph_input,
    *,
    run_cost_cap_inr: float | None = None,
) -> None:
    """Invoke the graph and persist whatever state it lands in. A5: if the run's
    metered ₹ cost crosses the per-run cap, it lands as 'failed' (circuit-breaker)
    instead of advancing — a runaway regeneration loop can't burn the budget."""
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

        # A5 — per-run circuit-breaker: over the ₹ ceiling → stop here as failed.
        cap = _run_cap_inr(run_cost_cap_inr)
        if cap and cap > 0 and inr > cap:
            row.status = "failed"
            row.error = f"run cost ceiling ₹{cap:.0f} exceeded (metered ₹{inr:.2f})"
            row.finished_at = _utcnow()
            await record(
                session,
                event_type=AuditEventType.ERROR,
                agent_id=AGENT,
                founder_id=row.founder_id,
                run_id=run_id,
                outcome="run_cost_ceiling_exceeded",
                detail={"cost_inr": inr, "cap_inr": cap},
            )
            await session.commit()
            return

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


async def build_graph_input(
    session_factory: async_sessionmaker, run: RunRow, embedding_engine=None
) -> dict:
    """Everything a fresh run starts from: the validated profile, plus the two
    closed-loop blocks — Eagle-View's lessons (3.2: run N's numbers steer run
    N+1) and the Company Brain's retrieved knowledge (3.3: the founder's own
    documents ground the agents)."""
    profile = await _load_profile(session_factory, run.founder_id)
    return {
        "run_id": str(run.run_id),
        "founder_id": str(run.founder_id),
        "profile": profile,
        "founder_flags": [],
        "rerun_count": 0,
        "analyses": [],
        "usage": [],
        "report": None,
        "gate1_decision": None,
        "performance_memo": await _load_performance_memo(
            session_factory, run.founder_id, run.run_id
        ),
        "company_knowledge": await _load_company_knowledge(
            session_factory, run.founder_id, profile, embedding_engine
        ),
        # RAG Tier 1/2: the SHARED experience base (real campaign cases) every
        # founder draws from. Same engine, not tenant-scoped.
        "experience": await _load_experience(session_factory, profile, embedding_engine),
    }


async def _load_experience(
    session_factory: async_sessionmaker, profile: dict, embedding_engine
) -> str | None:
    """Retrieve the most relevant shared case studies (Experience Brain) for this
    run. SHARED, not tenant-scoped. No engine / empty corpus / any failure → None
    (the run proceeds without precedent, never blocked)."""
    if embedding_engine is None:
        return None
    from ..rag.experience import experience_as_prompt, retrieve_experience

    query = " ".join(
        str(profile.get(key, ""))
        for key in ("product_description", "icp", "primary_goal", "company_name")
    ).strip()
    if not query:
        return None
    try:
        async with session_factory() as session:  # shared corpus → plain session, no tenant scope
            cases = await retrieve_experience(session, query=query, engine=embedding_engine)
    except Exception as exc:  # noqa: BLE001 — degrade, never block the run
        log.warning("experience retrieval degraded: %r", exc)
        return None
    return experience_as_prompt(cases) if cases else None


async def _load_company_knowledge(
    session_factory: async_sessionmaker,
    founder_id: UUID,
    profile: dict,
    embedding_engine,
) -> str | None:
    """Retrieve the founder's most relevant knowledge for this run. No engine
    or no corpus → None (the run proceeds ungrounded, never blocked).
    Retrieval failures degrade the same way — a flaky embedding API must
    never kill an analysis run."""
    if embedding_engine is None:
        return None
    from ..rag.store import knowledge_as_prompt, retrieve

    query = " ".join(
        str(profile.get(key, ""))
        for key in ("company_name", "product_description", "icp", "primary_goal")
    ).strip()
    if not query:
        return None
    try:
        async with tenant_session(session_factory, founder_id) as session:
            chunks = await retrieve(
                session, founder_id=founder_id, query=query, engine=embedding_engine
            )
    except Exception as exc:  # noqa: BLE001 — degrade, never block the run
        log.warning("knowledge retrieval degraded for founder %s: %r", founder_id, exc)
        return None
    return knowledge_as_prompt(chunks) if chunks else None


async def _load_performance_memo(
    session_factory: async_sessionmaker, founder_id: UUID, run_id: UUID
) -> str | None:
    """Build + render the founder's lessons; the injection itself is audited
    so 'this run was steered by measured data' is provable, not vibes."""
    from ..monitor.insights import build_performance_memo, memo_as_prompt

    async with tenant_session(session_factory, founder_id) as session:
        memo = await build_performance_memo(session, founder_id)
        if memo is None:
            return None
        await record(
            session,
            event_type=AuditEventType.AGENT_ACTION,
            agent_id="agent:eagle_view",
            founder_id=founder_id,
            run_id=run_id,
            outcome="performance_memo_injected",
            detail={
                "posts_measured": memo["posts_measured"],
                "guidance": memo["guidance"],
            },
        )
        await session.commit()
        return memo_as_prompt(memo)


async def execute_run(
    graph,
    session_factory: async_sessionmaker,
    run: RunRow,
    embedding_engine=None,
    *,
    run_cost_cap_inr: float | None = None,
) -> None:
    # B3: input assembly happens BEFORE _drive's own try/except, so guard the
    # whole body — any failure here must land the run as 'failed', never vanish.
    try:
        graph_input = await build_graph_input(session_factory, run, embedding_engine)
        await _drive(
            graph,
            session_factory,
            run.run_id,
            graph_input,
            run_cost_cap_inr=run_cost_cap_inr,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("execute_run failed for run %s", run.run_id)
        await fail_run(session_factory, run.run_id, exc)


# ── C3 — auto-resume runs orphaned by a restart ──────────────────────────────
# The API kicks runs off as fire-and-forget tasks; a process restart loses them
# mid-flight and the run is stuck in a working state. LangGraph's checkpointer
# still holds the state, so the worker re-drives from the last checkpoint.

_RESUMABLE = ("generating", "generating_content", "publishing")


async def resume_interrupted_run(
    graph,
    session_factory: async_sessionmaker,
    run_id: UUID,
    embedding_engine=None,
    *,
    run_cost_cap_inr: float | None = None,
) -> None:
    """Re-drive one run from its checkpoint (invoke with None = continue). Only
    for non-gate states — gate states wait on the founder, not the worker."""
    await _drive(graph, session_factory, run_id, None, run_cost_cap_inr=run_cost_cap_inr)


async def resume_stuck_runs(
    graph,
    session_factory: async_sessionmaker,
    *,
    stuck_after_minutes: int = 15,
    embedding_engine=None,
) -> dict:
    """Find runs left mid-flight (a working, non-gate state whose row hasn't
    advanced in `stuck_after_minutes`) and re-drive each. The threshold avoids
    racing a merely-slow run; a heartbeat/claim column is the production-grade
    upgrade. Returns {candidates, resumed, failed}."""
    from datetime import timedelta

    cutoff = _utcnow() - timedelta(minutes=stuck_after_minutes)
    async with session_factory() as session:
        run_ids = list(
            (
                await session.execute(
                    select(RunRow.run_id).where(
                        RunRow.status.in_(_RESUMABLE),
                        RunRow.updated_at < cutoff,
                    )
                )
            ).scalars()
        )
    resumed = failed = 0
    for rid in run_ids:
        try:
            await resume_interrupted_run(graph, session_factory, rid, embedding_engine)
            resumed += 1
        except Exception as exc:  # noqa: BLE001 — one stuck run never blocks the sweep
            log.warning("auto-resume failed for run %s: %r", rid, exc)
            failed += 1
    return {"candidates": len(run_ids), "resumed": resumed, "failed": failed}


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

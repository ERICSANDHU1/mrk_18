"""Analysis-run endpoints: start a run, watch it, decide at Gate 1.

Runs take minutes (free-tier LLM) so POST endpoints return 202 immediately
and execution continues in the background; GET /runs/{id} is the window. The
database is run-state truth — a dropped client changes nothing.
"""

import asyncio
import hmac
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import repositories as repo
from ..db.models import ContentItemRow, FounderRow, PublishResultRow, RunRow
from ..graph import lifecycle
from ..security.reviewtoken import DEFAULT_TTL_S, mint_review_token, verify_review_token
from .deps import (
    current_founder,
    founder_scope,
    get_session,
    get_verified_claims,
    record_denial,
    require_founder,
    require_run,
    run_scope,
)

router = APIRouter(tags=["runs"])
log = logging.getLogger("mrk18.api")


class GateDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["approve", "flag"]
    flags: list[str] = Field(default_factory=list, max_length=10)


class ItemDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: UUID
    action: Literal["approve", "reject"]  # deliberately NO bulk member
    note: str | None = Field(default=None, max_length=2000)


class Gate2Decisions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decisions: list[ItemDecision] = Field(min_length=1, max_length=50)


class RunView(BaseModel):
    run_id: UUID
    founder_id: UUID
    status: str
    tokens_in: int
    tokens_out: int
    cost_inr: float
    report: dict | None
    gate1: dict | None
    error: str | None


def _view(row: RunRow) -> RunView:
    return RunView(
        run_id=row.run_id,
        founder_id=row.founder_id,
        status=row.status,
        tokens_in=row.tokens_in,
        tokens_out=row.tokens_out,
        cost_inr=float(row.cost_inr),
        report=row.report,
        gate1=row.gate1,
        error=row.error,
    )


def _graph_or_503(request: Request):
    graph = getattr(request.app.state, "graph", None)
    if graph is None:
        raise HTTPException(
            status_code=503,
            detail="analysis pipeline not configured (CHECKPOINTER_DSN / GROQ_API_KEY missing)",
        )
    return graph


def _on_task_done(task: asyncio.Task) -> None:
    # B3: retrieve the result so an exception is never silently swallowed.
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return
    if exc is not None:
        log.error("background pipeline task failed", exc_info=exc)


def _spawn(request: Request, coro) -> None:
    """Run pipeline work in the background; keep a reference so it isn't GC'd."""
    tasks: set[asyncio.Task] = request.app.state.background_tasks
    task = asyncio.create_task(coro)
    tasks.add(task)
    task.add_done_callback(tasks.discard)
    task.add_done_callback(_on_task_done)


async def _authorize_gate(
    request: Request, session: AsyncSession, run: RunRow, review_token: str | None
) -> None:
    """Gate decisions accept EITHER the owner's bearer JWT OR a valid review
    link for exactly this run (the review page is opened by navigation and
    cannot send an Authorization header). Runs BEFORE any state is revealed."""
    key = getattr(request.app.state, "review_token_key", None)
    if review_token and key and verify_review_token(key, run.run_id, review_token):
        return
    claims = await get_verified_claims(request)  # 401 without a provable identity
    founder = await repo.get_founder_by_auth_user(session, claims.get("sub", ""))
    if founder is None or founder.id != run.founder_id:
        if founder is not None:
            await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only decide your own runs")


@router.post("/founders/{founder_id}/runs", status_code=202, response_model=RunView)
async def start_analysis_run(
    founder_id: UUID,
    request: Request,
    _founder: FounderRow = Depends(require_founder),
) -> RunView:
    graph = _graph_or_503(request)
    factory = request.app.state.session_factory
    try:
        run = await lifecycle.start_run(factory, founder_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="founder not found")
    except lifecycle.CostCapExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    _spawn(
        request,
        lifecycle.execute_run(
            graph,
            factory,
            run,
            embedding_engine=getattr(request.app.state, "embedding_engine", None),
        ),
    )
    return _view(run)


@router.get("/runs/{run_id}", response_model=RunView)
async def get_run(row: RunRow = Depends(require_run)) -> RunView:
    return _view(row)


# B4 — lightweight polling contract -------------------------------------------
_PHASE_LABEL = {
    "generating": "Researching your market, audience & strategy",
    "awaiting_gate1": "Waiting for your Gate 1 review",
    "generating_content": "Writing platform-native content",
    "awaiting_gate2": "Waiting for your content approval",
    "publishing": "Publishing your approved content",
    "done": "Complete",
    "failed": "This run hit a snag",
}
_RUN_TERMINAL = {"done", "failed"}
_AWAITING = {"awaiting_gate1": "gate1", "awaiting_gate2": "gate2"}


class RunProgress(BaseModel):
    run_id: UUID
    status: str
    phase: str
    terminal: bool
    awaiting: str | None  # "gate1" | "gate2" | None — what the founder must act on
    cost_inr: float
    updated_at: datetime
    error: str | None


@router.get("/runs/{run_id}/progress", response_model=RunProgress)
async def run_progress(row: RunRow = Depends(require_run)) -> RunProgress:
    """B4 — a cheap polling target: status + a human phase label, the terminal
    flag, and what (if anything) the founder must act on. No report blob, so the
    dashboard can poll it every few seconds without shipping the whole report."""
    return RunProgress(
        run_id=row.run_id,
        status=row.status,
        phase=_PHASE_LABEL.get(row.status, row.status),
        terminal=row.status in _RUN_TERMINAL,
        awaiting=_AWAITING.get(row.status),
        cost_inr=float(row.cost_inr),
        updated_at=row.updated_at,
        error=row.error,
    )


@router.post("/runs/{run_id}/cancel", response_model=RunView)
async def cancel_run(
    run: RunRow = Depends(run_scope),  # owner check + RLS
    session: AsyncSession = Depends(get_session),
) -> RunView:
    """Stop a run the founder no longer wants — or one stuck waiting on the brain.
    Marks it terminal ('failed' + a clear note) so the UI stops polling and a new
    run can be started. Idempotent: an already-finished run is returned unchanged.

    Note: a background pipeline task may still be mid-flight; it writes the same
    terminal state when it eventually errors out, so this stays consistent."""
    if run.status not in _RUN_TERMINAL:
        run.status = "failed"
        run.error = "Cancelled by you"
        run.finished_at = datetime.now(timezone.utc)
        await session.commit()
    return _view(run)


class RunSummary(BaseModel):
    run_id: UUID
    status: str
    cost_inr: float
    tokens_in: int
    tokens_out: int
    started_at: datetime
    finished_at: datetime | None


@router.get("/founders/{founder_id}/runs", response_model=list[RunSummary])
async def list_founder_runs(
    founder_id: UUID,
    _founder: FounderRow = Depends(founder_scope),  # owner check + RLS
    session: AsyncSession = Depends(get_session),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[RunSummary]:
    """B2 — a founder's run history, newest first (paginated)."""
    rows = (
        (
            await session.execute(
                select(RunRow)
                .where(RunRow.founder_id == founder_id)
                .order_by(RunRow.started_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return [
        RunSummary(
            run_id=r.run_id,
            status=r.status,
            cost_inr=float(r.cost_inr),
            tokens_in=r.tokens_in,
            tokens_out=r.tokens_out,
            started_at=r.started_at,
            finished_at=r.finished_at,
        )
        for r in rows
    ]


@router.get("/founders/{founder_id}/content", response_model=list[dict])
async def list_founder_content(
    founder_id: UUID,
    _founder: FounderRow = Depends(founder_scope),  # owner check + RLS
    session: AsyncSession = Depends(get_session),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """A founder's whole content library — every generated item across all runs,
    newest first. Powers the Chief / Comrk content + scripts widgets (the per-run
    /runs/{id}/items endpoint above only covers one run)."""
    rows = (
        (
            await session.execute(
                select(ContentItemRow)
                .where(ContentItemRow.founder_id == founder_id)
                .order_by(ContentItemRow.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "item_id": str(r.item_id),
            "run_id": str(r.run_id),
            "platform": r.platform,
            "format": r.format,
            "body": r.body,
            "thread": r.thread,
            "first_comment": r.first_comment,
            "image_prompt": r.image_prompt,
            "media": r.media,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/runs/{run_id}/review-link", response_model=dict)
async def get_review_link(
    request: Request, row: RunRow = Depends(require_run)
) -> dict:
    """Mint a signed, expiring link to this run's review page — only the owner can."""
    key = getattr(request.app.state, "review_token_key", None)
    if key is None:
        raise HTTPException(
            status_code=503, detail="review links not configured (APPROVAL_SIGNING_KEY)"
        )
    token = mint_review_token(key, row.run_id)
    return {
        "url": f"/review/{row.run_id}?t={token}",
        "expires_in_hours": DEFAULT_TTL_S // 3600,
    }


@router.get("/runs/{run_id}/items", response_model=list[dict])
async def list_run_items(
    run_id: UUID,
    _run: RunRow = Depends(run_scope),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = (
        (
            await session.execute(
                select(ContentItemRow)
                .where(ContentItemRow.run_id == run_id)
                .order_by(ContentItemRow.platform)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "item_id": str(r.item_id),
            "platform": r.platform,
            "format": r.format,
            "body": r.body,
            "thread": r.thread,
            "first_comment": r.first_comment,
            "image_prompt": r.image_prompt,
            "media": r.media,
            "status": r.status,
        }
        for r in rows
    ]


@router.post("/runs/{run_id}/gate1", status_code=202, response_model=dict)
async def decide_gate1(
    run_id: UUID,
    body: GateDecision,
    request: Request,
    t: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict:
    factory = request.app.state.session_factory
    row = await session.get(RunRow, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="run not found")
    await _authorize_gate(request, session, row, t)  # before status/graph can leak
    graph = _graph_or_503(request)
    if body.action == "flag" and not body.flags:
        raise HTTPException(status_code=422, detail="flag decision requires at least one flag")
    if row.status != "awaiting_gate1":
        raise HTTPException(
            status_code=409, detail=f"run is not waiting at gate 1 (status: {row.status})"
        )
    _spawn(request, lifecycle.resume_gate1(graph, factory, run_id, body.model_dump()))
    return {"run_id": str(run_id), "status": "resuming", "decision": body.action}


class RefineBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section: Literal["market_intel", "audience", "strategy", "usp", "verdict"]
    prompt: str = Field(min_length=1, max_length=1000)


@router.post("/runs/{run_id}/refine", status_code=202, response_model=dict)
async def refine_run(
    run_id: UUID,
    body: RefineBody,
    request: Request,
    run: RunRow = Depends(run_scope),  # owner check + RLS
) -> dict:
    """Per-slide Edit at Gate 1: re-run exactly ONE agent with the founder's tweak and
    patch just that section of the report — no full re-run. Returns 202; the open review
    re-renders on its next poll. Only while awaiting Gate 1 — once content is generating
    the report is frozen (409)."""
    if run.status != "awaiting_gate1":
        raise HTTPException(
            status_code=409,
            detail=f"editing is only available while reviewing at Gate 1 (status: {run.status})",
        )
    graph = _graph_or_503(request)
    socket = getattr(request.app.state, "llm_socket", None)
    if socket is None:
        raise HTTPException(status_code=503, detail="analysis pipeline not configured")
    factory = request.app.state.session_factory
    _spawn(
        request,
        lifecycle.refine_run_section(graph, socket, factory, run_id, body.section, body.prompt),
    )
    return {"run_id": str(run_id), "status": "refining", "section": body.section}


@router.post("/runs/{run_id}/retry", status_code=202, response_model=dict)
async def retry_run(
    run_id: UUID,
    request: Request,
    run: RunRow = Depends(run_scope),  # owner check + RLS
) -> dict:
    """Resume a run that FAILED after Gate-1 approval (content generation/save) without
    re-running the analysis — the content is already in the checkpoint. 409 if it failed
    before producing a report (nothing to resume — start fresh)."""
    if run.status != "failed":
        raise HTTPException(
            status_code=409, detail=f"run is not in a failed state (status: {run.status})"
        )
    if not run.report:
        raise HTTPException(
            status_code=409,
            detail="this run failed before the analysis finished — please start a fresh run",
        )
    graph = _graph_or_503(request)
    factory = request.app.state.session_factory
    _spawn(request, lifecycle.retry_failed_run(graph, factory, run_id))
    return {"run_id": str(run_id), "status": "retrying"}


@router.post("/runs/{run_id}/gate2", status_code=202, response_model=dict)
async def decide_gate2(
    run_id: UUID,
    body: Gate2Decisions,
    request: Request,
    t: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict:
    factory = request.app.state.session_factory
    row = await session.get(RunRow, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="run not found")
    await _authorize_gate(request, session, row, t)  # before status/graph can leak
    graph = _graph_or_503(request)
    if row.status != "awaiting_gate2":
        raise HTTPException(
            status_code=409, detail=f"run is not waiting at gate 2 (status: {row.status})"
        )
    decisions = [d.model_dump(mode="json") for d in body.decisions]
    try:
        # validate + mint ApprovalEvents synchronously (the caller deserves a
        # real answer); the graph resumes in the background. With a signing key
        # configured the events are HMAC-signed over the exact item content.
        resume_map = await lifecycle.mint_gate2_decisions(
            factory,
            run_id,
            decisions,
            signing_key=getattr(request.app.state, "approval_signing_key", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    _spawn(request, lifecycle.resume_gate2_drive(graph, factory, run_id, resume_map))
    return {
        "run_id": str(run_id),
        "status": "resuming",
        "decided_items": len(decisions),
    }


class PublishBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["export", "stub", "live"] = "export"


class OpsCompleteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_url: str = Field(min_length=8, max_length=500)


@router.post("/runs/{run_id}/publish", response_model=list[dict])
async def publish_run_endpoint(
    run_id: UUID,
    request: Request,
    body: PublishBody,
    _run: RunRow = Depends(require_run),
) -> list[dict]:
    from ..publishers.service import publish_run

    factory = request.app.state.session_factory
    try:
        return await publish_run(
            factory,
            run_id,
            mode=body.mode,
            signing_key=getattr(request.app.state, "approval_signing_key", None),
            strict=getattr(request.app.state, "is_prod", False),
            vault=getattr(request.app.state, "vault", None),
            transport=getattr(request.app.state, "oauth_transport", None),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="run not found")
    except ValueError as exc:  # B4: run not finished
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/runs/{run_id}/publish-results", response_model=list[dict])
async def list_publish_results(
    run_id: UUID,
    _run: RunRow = Depends(run_scope),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = (
        (
            await session.execute(
                select(PublishResultRow)
                .where(PublishResultRow.run_id == run_id)
                .order_by(PublishResultRow.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "result_id": str(r.result_id),
            "item_id": str(r.item_id),
            "platform": r.platform,
            "adapter": r.adapter,
            "status": r.status,
            "public_url": r.public_url,
            "cost_estimate_usd": float(r.cost_estimate_usd) if r.cost_estimate_usd else None,
            "error": r.error,
        }
        for r in rows
    ]


@router.post("/publish-results/{result_id}/complete", response_model=dict)
async def complete_ops_result(
    result_id: UUID,
    body: OpsCompleteBody,
    request: Request,
    founder: FounderRow = Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from ..publishers.service import complete_ops_task

    row = await session.get(PublishResultRow, result_id)
    if row is None:
        raise HTTPException(status_code=404, detail="publish result not found")
    if row.founder_id != founder.id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only complete your own publishes")

    factory = request.app.state.session_factory
    try:
        return await complete_ops_task(factory, result_id, body.public_url)
    except LookupError:
        raise HTTPException(status_code=404, detail="publish result not found")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


def _require_maintenance_key(request: Request, provided: str) -> None:
    """Ops-only gate: shared key, never founder tokens."""
    expected = getattr(request.app.state, "maintenance_key", None)
    if not expected:
        raise HTTPException(status_code=503, detail="maintenance key not configured")
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="invalid maintenance key")


@router.post("/maintenance/expire-stale-approvals", response_model=dict)
async def expire_stale(
    request: Request,
    max_age_hours: int = 48,
    x_maintenance_key: str = Header(default=""),
) -> dict:
    """Silence = rejection: expire items awaiting approval past the window.
    Production runs this on a schedule; the endpoint exists for ops/pilot.
    Ops-only — mass-expiring pending approvals would be a denial-of-approval
    attack in founder hands."""
    _require_maintenance_key(request, x_maintenance_key)
    factory = request.app.state.session_factory
    expired = await lifecycle.expire_stale_approvals(factory, max_age_hours=max_age_hours)
    return {"expired_items": expired}


@router.post("/maintenance/verify-audit-chain", response_model=dict)
async def verify_audit_chain_endpoint(
    request: Request,
    x_maintenance_key: str = Header(default=""),
) -> dict:
    """Slice 2.4 — 'has anyone rewritten history?' as one cryptographic call.
    Walks every scope's hash chain and reports the first broken link."""
    _require_maintenance_key(request, x_maintenance_key)
    from ..audit.recorder import verify_audit_chain

    return await verify_audit_chain(request.app.state.session_factory)

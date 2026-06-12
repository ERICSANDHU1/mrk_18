"""Analysis-run endpoints: start a run, watch it, decide at Gate 1.

Runs take minutes (free-tier LLM) so POST endpoints return 202 immediately
and execution continues in the background; GET /runs/{id} is the window. The
database is run-state truth — a dropped client changes nothing.
"""

import asyncio
import hmac
import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import repositories as repo
from ..db.models import ContentItemRow, FounderRow, PublishResultRow, RunRow
from ..graph import lifecycle
from ..security.reviewtoken import DEFAULT_TTL_S, mint_review_token, verify_review_token
from .deps import (
    current_founder,
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

    mode: Literal["export", "stub"] = "export"


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

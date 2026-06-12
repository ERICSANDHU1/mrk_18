"""Slice 3.1 — Eagle-View endpoints.

Manual signal entry (the pilot's real path — founders paste the numbers their
platform shows), the founder-facing performance views, and the ops pull
trigger for automated sources. Owner-JWT + tenant scope on everything
founder-facing; the cron trigger sits behind the maintenance key like every
other ops endpoint.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit.recorder import record
from ..db.models import FounderRow, PublishResultRow, RunRow
from ..monitor.eagleview import AGENT, performance_view, pull_due_signals, record_signal
from ..monitor.insights import build_performance_memo, memo_as_prompt
from ..schemas.enums import AuditEventType, WindowPoint
from ..security.tenant import apply_tenant_scope
from .deps import current_founder, founder_scope, get_session, record_denial, run_scope
from .runs import _require_maintenance_key

router = APIRouter(tags=["signals"])


class SignalEntry(BaseModel):
    """What the founder pastes from their platform's own analytics screen."""

    model_config = ConfigDict(extra="forbid")

    window_point: WindowPoint
    reach: int = Field(ge=0)
    engagement_rate: float = Field(ge=0.0)
    follower_delta_48h: int | None = None
    link_ctr: float | None = Field(default=None, ge=0.0)
    comment_sentiment: float | None = Field(default=None, ge=-1.0, le=1.0)
    saves: int | None = Field(default=None, ge=0)


@router.post("/publish-results/{result_id}/signals", response_model=dict)
async def enter_signals(
    result_id: UUID,
    body: SignalEntry,
    request: Request,
    founder: FounderRow = Depends(current_founder),
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.get(PublishResultRow, result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="publish result not found")
    if result.founder_id != founder.id:
        await record_denial(session, request, founder.id)
        raise HTTPException(status_code=403, detail="you can only report your own posts")
    await apply_tenant_scope(session, founder.id)

    row = await record_signal(
        session,
        founder_id=founder.id,
        item_id=result.item_id,
        platform=result.platform,
        window_point=body.window_point,
        metrics=body.model_dump(exclude={"window_point"}),
        source="manual",
    )
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        run_id=result.run_id,
        outcome="signal_recorded",
        detail={
            "item_id": str(result.item_id),
            "platform": result.platform,
            "window": body.window_point.value,
            "source": "manual",
        },
    )
    await session.commit()
    return {
        "signal_id": str(row.signal_id),
        "item_id": str(result.item_id),
        "window_point": body.window_point.value,
        "status": "recorded",
    }


@router.get("/runs/{run_id}/performance", response_model=dict)
async def run_performance(
    run: RunRow = Depends(run_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await performance_view(session, founder_id=run.founder_id, run_id=run.run_id)


@router.get("/founders/{founder_id}/performance", response_model=dict)
async def founder_performance(
    founder_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await performance_view(session, founder_id=founder.id)


@router.get("/founders/{founder_id}/insights", response_model=dict)
async def founder_insights(
    founder_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Slice 3.2 — what the system has LEARNED from this founder's measured
    posts: the same memo the next run's agents receive. Transparency rule:
    the founder can always see exactly what steers their strategy."""
    memo = await build_performance_memo(session, founder.id)
    if memo is None:
        return {
            "founder_id": str(founder.id),
            "insights": None,
            "message": "no measured posts yet — enter signals and lessons will appear",
        }
    return {
        "founder_id": str(founder.id),
        "insights": memo,
        "prompt_block": memo_as_prompt(memo),
    }


@router.post("/maintenance/pull-signals", response_model=dict)
async def pull_signals(
    request: Request,
    x_maintenance_key: str = Header(default=""),
) -> dict:
    """Cron-ready: run every automated source over its due windows. Platforms
    without a source stay manual — skipped and counted, never faked."""
    _require_maintenance_key(request, x_maintenance_key)
    sources = getattr(request.app.state, "signal_sources", None) or {}
    return await pull_due_signals(request.app.state.session_factory, sources)

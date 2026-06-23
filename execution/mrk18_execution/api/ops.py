"""C4 — operational endpoints: readiness + Prometheus metrics.

Liveness (/health) stays in app.py and is deliberately cheap (no DB) so the
container healthcheck never flaps on a slow query. Readiness (/readyz) proves
the DB answers. /metrics is behind the maintenance key — business counts are
not public — and Prometheus sends that key as a scrape header.
"""

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import func, select, text

from ..db.models import FounderRow, RunRow
from .runs import _require_maintenance_key

router = APIRouter(tags=["ops"])


@router.get("/readyz")
async def readyz(request: Request):
    """Readiness: the DB answers. The analysis graph may be degraded (runs 503)
    without the service being unready — DB reachability is the hard gate."""
    factory = request.app.state.session_factory
    db_ok = True
    try:
        async with factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — any failure means not-ready
        db_ok = False
    graph_ready = getattr(request.app.state, "graph", None) is not None
    body = {"ready": db_ok, "db": db_ok, "graph": graph_ready}
    return JSONResponse(body, status_code=200 if db_ok else 503)


@router.get("/metrics")
async def metrics(request: Request, x_maintenance_key: str = Header(default="")):
    """Prometheus exposition. Behind the maintenance key — Prometheus sends it as
    a scrape header — so per-tenant business counts never leak publicly."""
    _require_maintenance_key(request, x_maintenance_key)
    factory = request.app.state.session_factory
    lines = [
        "# HELP mrk18_up 1 if the API process is serving requests",
        "# TYPE mrk18_up gauge",
        "mrk18_up 1",
    ]
    async with factory() as session:
        founders = (
            await session.execute(select(func.count()).select_from(FounderRow))
        ).scalar_one()
        lines += [
            "# HELP mrk18_founders_total provisioned founders",
            "# TYPE mrk18_founders_total gauge",
            f"mrk18_founders_total {founders}",
        ]
        rows = (
            await session.execute(
                select(RunRow.status, func.count()).group_by(RunRow.status)
            )
        ).all()
        lines += [
            "# HELP mrk18_runs_total analysis runs by status",
            "# TYPE mrk18_runs_total gauge",
        ]
        for status_value, count in rows:
            lines.append(f'mrk18_runs_total{{status="{status_value}"}} {count}')
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

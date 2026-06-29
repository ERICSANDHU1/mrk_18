"""Analytics Interpreter endpoints — the founder's ad numbers in, a CMO
diagnosis out, stored for the dashboard (Leaks / Channels / Funnel).

Source-agnostic: today the metrics arrive as a JSON paste or a CSV export; when
a live Meta/Google connector lands, it calls the SAME diagnose path with the
same shape — these endpoints, the storage, and the dashboard never change.
Owner-JWT + tenant scope on everything.
"""

import csv
import io
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.analytics import diagnose_metrics
from ..audit.recorder import record
from ..db.models import AnalyticsDiagnosisRow, FounderRow
from ..schemas.enums import AuditEventType
from .deps import founder_scope, get_session

router = APIRouter(tags=["analytics"])

AGENT = "agent:analytics"
_NAME_KEYS = {"campaign", "campaign name", "name", "ad set", "ad set name", "adset"}
_SPEND_KEYS = ("spend", "amount spent", "amount spent (inr)", "cost")


def _socket_or_503(request: Request):
    socket = getattr(request.app.state, "llm_socket", None)
    if socket is None:
        raise HTTPException(status_code=503, detail="analytics engine not configured (LLM socket)")
    return socket


def _num(v):
    """Best-effort numeric coercion — strips ₹, %, commas; keeps non-numbers as-is."""
    if v is None:
        return None
    s = str(v).replace(",", "").replace("₹", "").replace("%", "").strip()
    try:
        return float(s)
    except ValueError:
        return str(v).strip() or None


def parse_ad_csv(text: str) -> dict:
    """Parse a simple campaign CSV (a name column + numeric columns like spend,
    roas, cac, ctr, conversions) into the metrics dict the adapter expects."""
    text = (text or "").strip()
    if not text:
        raise ValueError("empty CSV")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    campaigns: list[dict] = []
    total_spend = 0.0
    for row in reader:
        norm = {(k or "").strip().lower(): v for k, v in row.items()}
        name = next((norm[k] for k in _NAME_KEYS if norm.get(k)), None)
        entry: dict = {"name": name or "(unnamed)"}
        for k, v in norm.items():
            if k in _NAME_KEYS:
                continue
            entry[k] = _num(v)
        spend = next((entry.get(k) for k in _SPEND_KEYS if isinstance(entry.get(k), (int, float))), None)
        if isinstance(spend, (int, float)):
            total_spend += spend
        campaigns.append(entry)
    if not campaigns:
        raise ValueError("CSV had a header but no data rows")
    return {"total_spend": round(total_spend, 2), "campaigns": campaigns}


class DiagnoseBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metrics: dict | None = None  # structured metrics JSON
    csv: str | None = Field(default=None, max_length=400_000)  # OR a campaign CSV export
    source: str = Field(default="manual", max_length=32)  # manual | csv | meta | google | ...
    period: str | None = Field(default=None, max_length=80)

    @field_validator("metrics")
    @classmethod
    def _cap_metrics(cls, v: dict | None) -> dict | None:
        # The structured path bypasses the csv max_length cap; bound its serialized
        # size so it can't blow up memory or amplify the LLM prompt (pre-launch audit).
        if v is not None and len(json.dumps(v, default=str)) > 200_000:
            raise ValueError("metrics JSON too large (max 200k serialized chars)")
        return v


@router.post("/founders/{founder_id}/analytics/diagnose", response_model=dict)
async def diagnose(
    founder_id: UUID,
    body: DiagnoseBody,
    request: Request,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    socket = _socket_or_503(request)

    if body.metrics and body.csv:
        raise HTTPException(status_code=422, detail="send either `metrics` or `csv`, not both")
    if body.csv:
        try:
            metrics = parse_ad_csv(body.csv)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"could not parse CSV: {exc}")
        source = body.source if body.source != "manual" else "csv"
    elif body.metrics:
        metrics = body.metrics
        source = body.source
    else:
        raise HTTPException(status_code=422, detail="provide `metrics` (JSON) or `csv`")
    if not metrics or not metrics.get("campaigns"):
        raise HTTPException(status_code=422, detail="no campaign data found in the metrics")

    try:
        diag, _usage = await diagnose_metrics(socket, metrics)
    except Exception as exc:  # noqa: BLE001 — surface engine failures as 502, never 500
        raise HTTPException(status_code=502, detail=f"analytics engine error: {exc}")

    row = AnalyticsDiagnosisRow(
        founder_id=founder.id,
        source=source,
        period=body.period,
        metrics=metrics,
        diagnosis=diag.model_dump(mode="json"),
    )
    session.add(row)
    await record(
        session,
        event_type=AuditEventType.AGENT_ACTION,
        agent_id=AGENT,
        founder_id=founder.id,
        outcome="analytics_diagnosed",
        detail={"source": source, "campaigns": len(metrics.get("campaigns", []))},
    )
    await session.commit()
    return {
        "diagnosis_id": str(row.diagnosis_id),
        "source": source,
        "diagnosis": diag.model_dump(mode="json"),
    }


@router.post("/founders/{founder_id}/analytics/sync-meta", response_model=dict)
async def sync_meta(
    founder_id: UUID,
    request: Request,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """PULL the founder's latest Meta ad data (manual refresh + the scheduler call
    this). Stores it as a pending snapshot — runs NO analysis. The founder reviews
    the numbers and approves via /run-analysis before the CMO diagnoses them."""
    vault = getattr(request.app.state, "vault", None)
    if vault is None:
        raise HTTPException(status_code=503, detail="token vault not configured (TOKEN_VAULT_KEY)")
    from ..integrations import meta_ads

    transport = getattr(request.app.state, "meta_transport", None)
    try:
        pulled = await meta_ads.pull_founder(session, vault, founder.id, transport=transport)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc))  # Meta not connected
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))  # no ad account linked
    except meta_ads.MetaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"pulled": pulled}


@router.post("/founders/{founder_id}/analytics/run-analysis", response_model=dict)
async def run_analysis(
    founder_id: UUID,
    request: Request,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The approval gate: run the CMO diagnosis on the latest PENDING ad-data pull.
    Nothing analyses automatically — the founder triggers this explicitly."""
    socket = _socket_or_503(request)
    from ..integrations import meta_ads

    try:
        result = await meta_ads.analyze_pending(session, socket, founder.id)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc))  # nothing pending
    except Exception as exc:  # noqa: BLE001 — engine failures → 502, never 500
        raise HTTPException(status_code=502, detail=f"analytics engine error: {exc}")
    return result


@router.get("/founders/{founder_id}/analytics/latest", response_model=dict)
async def latest(
    founder_id: UUID,
    founder: FounderRow = Depends(founder_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The dashboard reads this — the most recent diagnosis, or nulls if none yet."""
    row = (
        await session.execute(
            select(AnalyticsDiagnosisRow)
            .where(AnalyticsDiagnosisRow.founder_id == founder.id)
            .order_by(AnalyticsDiagnosisRow.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    if row is None:
        return {"diagnosis": None, "metrics": None}
    return {
        "diagnosis_id": str(row.diagnosis_id),
        "source": row.source,
        "period": row.period,
        "metrics": row.metrics,
        "diagnosis": row.diagnosis,
        "created_at": str(row.created_at),
    }

"""Slice 3.1 — Eagle-View Monitor: the signal spine of the closed loop.

Published posts get measured at five windows (1h/6h/24h/72h/7d). This module
owns: writing signals (upsert — the latest correction wins), computing which
pulls are DUE, running automated sources against them, the half-life estimate,
and the founder-facing performance view. Everything downstream of "the system
learns" eats from here.

Sandbox: Eagle-View acts as `agent:eagle_view`, whose manifest grants signal
read/write and nothing else — it can never publish, never call the LLM.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..audit.recorder import record
from ..db.models import ContentItemRow, PublishResultRow, SignalRow
from ..schemas.enums import AuditEventType, WindowPoint
from ..schemas.signals import SignalRecord
from ..security.manifests import require_permission
from .sources import WINDOW_HOURS, SignalSource

log = logging.getLogger("mrk18.eagleview")

AGENT = "agent:eagle_view"

# statuses that mean "this post is out in the world and can be measured"
MEASURABLE_STATUSES = ("published", "exported")

WINDOW_ORDER = [WindowPoint.H1, WindowPoint.H6, WindowPoint.H24, WindowPoint.H72, WindowPoint.D7]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def record_signal(
    session: AsyncSession,
    *,
    founder_id: UUID,
    item_id: UUID,
    platform: str,
    window_point: WindowPoint,
    metrics: dict,
    source: str,
) -> SignalRow:
    """Validate through the frozen SignalRecord contract, then upsert the
    (item, platform, window) row — re-entry means correction, latest wins."""
    require_permission(AGENT, "signals:write")
    rec = SignalRecord(  # contract enforces ranges (sentiment -1..1, ge=0 …)
        founder_id=founder_id,
        item_id=item_id,
        platform=platform,
        window_point=window_point,
        pulled_at=_utcnow(),
        **metrics,
    )
    existing = (
        await session.execute(
            select(SignalRow).where(
                SignalRow.item_id == item_id,
                SignalRow.platform == platform,
                SignalRow.window_point == window_point.value,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = SignalRow(
            signal_id=rec.signal_id,
            founder_id=founder_id,
            item_id=item_id,
            platform=platform,
            window_point=window_point.value,
        )
        session.add(existing)
    existing.source = source
    existing.pulled_at = rec.pulled_at
    existing.reach = rec.reach
    existing.engagement_rate = rec.engagement_rate
    existing.follower_delta_48h = rec.follower_delta_48h
    existing.link_ctr = rec.link_ctr
    existing.comment_sentiment = rec.comment_sentiment
    existing.saves = rec.saves
    existing.half_life_hours = rec.half_life_hours
    return existing


async def due_pulls(
    session: AsyncSession, *, now: datetime | None = None, limit: int = 200
) -> list[dict]:
    """Which (post, window) pairs are due for an automated pull: the window's
    deadline has passed and no signal row exists for it yet."""
    require_permission(AGENT, "signals:read")
    now = now or _utcnow()
    results = (
        (
            await session.execute(
                select(PublishResultRow)
                .where(
                    PublishResultRow.status.in_(MEASURABLE_STATUSES),
                    PublishResultRow.published_at.is_not(None),
                )
                .order_by(PublishResultRow.published_at)
            )
        )
        .scalars()
        .all()
    )
    have = {
        (row.item_id, row.platform, row.window_point)
        for row in (await session.execute(select(SignalRow))).scalars().all()
    }
    due: list[dict] = []
    for result in results:
        published = result.published_at
        if published.tzinfo is None:  # SQLite returns naive UTC
            published = published.replace(tzinfo=timezone.utc)
        age_hours = (now - published).total_seconds() / 3600.0
        for window, hours in WINDOW_HOURS.items():
            if age_hours >= hours and (
                result.item_id, result.platform, window.value
            ) not in have:
                due.append(
                    {
                        "founder_id": result.founder_id,
                        "item_id": result.item_id,
                        "platform": result.platform,
                        "platform_post_id": result.platform_post_id,
                        "window_point": window,
                    }
                )
                if len(due) >= limit:
                    return due
    return due


async def pull_due_signals(
    session_factory: async_sessionmaker,
    sources: dict[str, SignalSource],
    *,
    now: datetime | None = None,
) -> dict:
    """Run every configured automated source over its due pulls. Platforms
    with no source (LinkedIn personal: no analytics API) simply stay manual —
    skipped, counted, never faked."""
    pulled = skipped = 0
    async with session_factory() as session:
        work = await due_pulls(session, now=now)
        for task in work:
            source = sources.get(task["platform"])
            if source is None:
                skipped += 1
                continue
            metrics = await source.fetch(
                platform=task["platform"],
                platform_post_id=task["platform_post_id"],
                item_id=task["item_id"],
                window_point=task["window_point"],
            )
            if metrics is None:
                skipped += 1
                continue
            await record_signal(
                session,
                founder_id=task["founder_id"],
                item_id=task["item_id"],
                platform=task["platform"],
                window_point=task["window_point"],
                metrics=metrics,
                source=source.name,
            )
            pulled += 1
        if pulled:
            await record(
                session,
                event_type=AuditEventType.AGENT_ACTION,
                agent_id=AGENT,
                outcome="signals_pulled",
                detail={"pulled": pulled, "skipped": skipped},
            )
        await session.commit()
    return {"due": len(work), "pulled": pulled, "skipped_no_source": skipped}


def estimate_half_life_hours(windows: dict[str, dict]) -> float | None:
    """Hours until a post earned half of its (latest-known) total engagement.

    Cumulative engagement at each window ≈ reach × engagement_rate; linear
    interpolation between window points. Needs ≥2 windows to say anything."""
    points: list[tuple[float, float]] = [(0.0, 0.0)]
    for window in WINDOW_ORDER:
        data = windows.get(window.value)
        if data is None:
            continue
        cumulative = float(data["reach"]) * float(data["engagement_rate"])
        points.append((WINDOW_HOURS[window], cumulative))
    if len(points) < 3:  # origin + at least two real windows
        return None
    total = points[-1][1]
    if total <= 0:
        return None
    half = total / 2.0
    for (t0, e0), (t1, e1) in zip(points, points[1:]):
        if e1 >= half:
            if e1 == e0:
                return round(t1, 2)
            return round(t0 + (half - e0) / (e1 - e0) * (t1 - t0), 2)
    return None


def _item_view(item: ContentItemRow, rows: list[SignalRow]) -> dict:
    windows = {
        row.window_point: {
            "reach": row.reach,
            "engagement_rate": float(row.engagement_rate),
            "saves": row.saves,
            "link_ctr": float(row.link_ctr) if row.link_ctr is not None else None,
            "comment_sentiment": float(row.comment_sentiment)
            if row.comment_sentiment is not None
            else None,
            "source": row.source,
            "pulled_at": str(row.pulled_at),
        }
        for row in rows
    }
    latest = next(
        (windows[w.value] for w in reversed(WINDOW_ORDER) if w.value in windows), None
    )
    return {
        "item_id": str(item.item_id),
        "platform": item.platform,
        "format": item.format,
        "body_preview": item.body[:120],
        "windows": windows,
        "latest_reach": latest["reach"] if latest else None,
        "latest_engagement_rate": latest["engagement_rate"] if latest else None,
        "half_life_hours": estimate_half_life_hours(windows),
    }


async def performance_view(
    session: AsyncSession, *, founder_id: UUID, run_id: UUID | None = None
) -> dict:
    """The founder's answer to 'how are my posts doing?' — per-item windows,
    half-life, and best→worst ranking by latest engagement."""
    require_permission(AGENT, "signals:read")
    item_query = select(ContentItemRow).where(ContentItemRow.founder_id == founder_id)
    if run_id is not None:
        item_query = item_query.where(ContentItemRow.run_id == run_id)
    items = (await session.execute(item_query)).scalars().all()
    signal_rows = (
        (
            await session.execute(
                select(SignalRow).where(
                    SignalRow.founder_id == founder_id,
                    SignalRow.item_id.in_([i.item_id for i in items])
                    if items
                    else SignalRow.item_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    by_item: dict[UUID, list[SignalRow]] = {}
    for row in signal_rows:
        by_item.setdefault(row.item_id, []).append(row)

    views = [
        _item_view(item, by_item.get(item.item_id, []))
        for item in items
        if item.item_id in by_item  # unmeasured items don't pollute the ranking
    ]
    views.sort(key=lambda v: v["latest_engagement_rate"] or 0.0, reverse=True)
    half_lives = [v["half_life_hours"] for v in views if v["half_life_hours"]]
    return {
        "founder_id": str(founder_id),
        "run_id": str(run_id) if run_id else None,
        "items_measured": len(views),
        "items_total": len(items),
        "median_half_life_hours": sorted(half_lives)[len(half_lives) // 2]
        if half_lives
        else None,
        "ranking": views,  # best first — and the worst is honestly last
    }

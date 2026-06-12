"""Slice 3.2 — the self-learning loop: signals become lessons.

`build_performance_memo` turns Eagle-View's raw numbers into a compact,
founder-specific lesson sheet: which platform actually earns, the best and
worst performing posts (with their hooks), how fast posts die. DELIBERATELY
deterministic — plain arithmetic, no LLM — so lessons cost nothing, never
hallucinate, and every line is reproducible from the signals table.

The orchestrator injects the rendered memo into the next run's prompts
(analysis agents, synthesis, content generation). That closes the loop the
blueprint promised: run N's measured results steer run N+1's strategy —
while the founder's gates stay exactly where they were. The system reports
and learns; it never silently auto-tunes past the human.
"""

from statistics import median
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ContentItemRow, SignalRow
from ..security.manifests import require_permission
from .eagleview import AGENT, WINDOW_ORDER, estimate_half_life_hours


def _pct(rate: float) -> str:
    return f"{rate * 100:.1f}%"


async def build_performance_memo(session: AsyncSession, founder_id: UUID) -> dict | None:
    """Aggregate every measured post for this founder. None = nothing measured
    yet (a brand-new founder gets no fake lessons)."""
    require_permission(AGENT, "signals:read")
    rows = (
        (
            await session.execute(
                select(SignalRow, ContentItemRow)
                .join(ContentItemRow, ContentItemRow.item_id == SignalRow.item_id)
                .where(SignalRow.founder_id == founder_id)
            )
        )
        .all()
    )
    if not rows:
        return None

    # latest window per item + the windows dict the half-life needs
    items: dict[UUID, dict] = {}
    for signal, item in rows:
        entry = items.setdefault(
            item.item_id,
            {
                "platform": item.platform,
                "format": item.format,
                "hook": item.body.split("\n", 1)[0][:140],
                "windows": {},
            },
        )
        entry["windows"][signal.window_point] = {
            "reach": signal.reach,
            "engagement_rate": float(signal.engagement_rate),
        }
    for entry in items.values():
        latest = next(
            (
                entry["windows"][w.value]
                for w in reversed(WINDOW_ORDER)
                if w.value in entry["windows"]
            ),
        )
        entry["latest_reach"] = latest["reach"]
        entry["latest_engagement_rate"] = latest["engagement_rate"]
        entry["half_life_hours"] = estimate_half_life_hours(entry["windows"])

    # per-platform averages
    platform_summary: dict[str, dict] = {}
    for entry in items.values():
        bucket = platform_summary.setdefault(
            entry["platform"], {"posts_measured": 0, "_er": 0.0, "_reach": 0}
        )
        bucket["posts_measured"] += 1
        bucket["_er"] += entry["latest_engagement_rate"]
        bucket["_reach"] += entry["latest_reach"]
    for platform, bucket in platform_summary.items():
        n = bucket.pop("posts_measured")
        bucket["posts_measured"] = n
        bucket["avg_engagement_rate"] = round(bucket.pop("_er") / n, 6)
        bucket["avg_reach"] = round(bucket.pop("_reach") / n)

    ranked = sorted(
        items.values(), key=lambda e: e["latest_engagement_rate"], reverse=True
    )
    best, worst = ranked[0], ranked[-1]
    half_lives = [e["half_life_hours"] for e in ranked if e["half_life_hours"]]

    guidance: list[str] = []
    if len(platform_summary) >= 2:
        by_er = sorted(
            platform_summary.items(), key=lambda kv: kv[1]["avg_engagement_rate"], reverse=True
        )
        (top_name, top), (low_name, low) = by_er[0], by_er[-1]
        guidance.append(
            f"{top_name} is out-earning {low_name} for this founder "
            f"({_pct(top['avg_engagement_rate'])} vs {_pct(low['avg_engagement_rate'])} "
            "engagement) — weight the mix accordingly."
        )
    if half_lives:
        guidance.append(
            f"posts earn half their total engagement within ~{median(half_lives):.0f}h "
            "— front-load the hook, never bury the point."
        )
    guidance.append(
        f"best measured hook ({_pct(best['latest_engagement_rate'])} on {best['platform']}): "
        f"\"{best['hook']}\""
    )
    if worst is not best:
        guidance.append(
            f"weakest ({_pct(worst['latest_engagement_rate'])} on {worst['platform']}): "
            f"\"{worst['hook']}\" — understand why before repeating its shape."
        )

    return {
        "posts_measured": len(items),
        "platform_summary": platform_summary,
        "best": {k: best[k] for k in ("platform", "hook", "latest_engagement_rate")},
        "worst": {k: worst[k] for k in ("platform", "hook", "latest_engagement_rate")},
        "median_half_life_hours": round(median(half_lives), 1) if half_lives else None,
        "guidance": guidance,
    }


def memo_as_prompt(memo: dict) -> str:
    """Render the memo as the prompt block agents receive. Lessons steer; they
    never override the founder's flags or platform rules."""
    platform_lines = "\n".join(
        f"- {name}: {stats['posts_measured']} post(s) measured, "
        f"avg engagement {_pct(stats['avg_engagement_rate'])}, avg reach {stats['avg_reach']}"
        for name, stats in memo["platform_summary"].items()
    )
    guidance_lines = "\n".join(f"- {line}" for line in memo["guidance"])
    return (
        "MEASURED PERFORMANCE OF THIS FOUNDER'S PREVIOUS POSTS "
        "(real numbers from Eagle-View, not guesses):\n"
        f"{platform_lines}\n"
        f"LESSONS:\n{guidance_lines}\n"
        "Let these measurements steer your angles, hooks and platform weighting. "
        "They refine the strategy — they never override the founder's explicit "
        "flags or platform rules."
    )

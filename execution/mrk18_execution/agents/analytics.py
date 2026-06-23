"""The Analytics Interpreter agent — the trained `analytics` adapter, finally wired.

Takes a founder's real ad/marketing metrics (a plain dict — campaign spend,
ROAS, CAC, CTR, conversions by channel/time) and returns a structured CMO
DIAGNOSIS: what's working, where money is leaking, what to scale, what to cut,
and the single most important next move.

Deliberately source-agnostic: the metrics dict can come from a manual paste, a
CSV export, or (later) a live Meta/Google connector — this agent never cares how
the numbers arrived. That is what lets us prove the adapter BEFORE building the
slow OAuth/connector plumbing.
"""

import json

from pydantic import BaseModel, Field

from ..llm.socket import AgentRole, LLMSocket, Usage


class AdDiagnosis(BaseModel):
    """The CMO's read on the numbers — one structured object the dashboard renders
    (Leaks <- leaking, Channels/Scale-Cut, the headline next move)."""

    headline: str = Field(min_length=1, description="One-line bottom line on the account's health")
    working: list[str] = Field(
        default_factory=list,
        description="What is performing — each names the specific campaign/channel + its number",
    )
    leaking: list[str] = Field(
        default_factory=list,
        description="Where money/performance is bleeding — name it + cite the actual number",
    )
    scale: list[str] = Field(default_factory=list, description="What to put MORE budget/effort into")
    cut: list[str] = Field(default_factory=list, description="What to stop, pause, or reduce")
    next_move: str = Field(min_length=1, description="The single most important action this week")


ANALYTICS_SYS = (
    "You are MRK18's Analytics Interpreter — a senior performance CMO reading a "
    "founder's REAL ad/marketing numbers. Diagnose what the data actually says: "
    "what's working, where money is leaking, what to scale, what to cut, and the "
    "single most important next move.\n"
    "HARD RULES: reason ONLY from the numbers provided — every point must name the "
    "specific campaign/channel and cite its actual figure from the data. NEVER "
    "invent a metric, campaign, or number that is not in the data. Any figure you "
    "DERIVE (a loss-per-order, a margin, a break-even point) MUST be framed as an "
    "estimate with its assumption stated (e.g. 'at typical D2C margins, a 1.2 ROAS "
    "is likely at or below break-even') — NEVER state a computed loss or margin as "
    "hard fact unless that exact number is in the data. If the data is thin, say "
    "what's missing rather than guessing. India-first (INR, Indian channels and "
    "buyer reality). Lead with the single biggest lever and rank everything by "
    "impact. Be decisive and concrete — a bitter-truth CMO read a CFO would "
    "respect, not vague best-practice tips."
)


async def diagnose_metrics(socket: LLMSocket, metrics: dict) -> tuple[AdDiagnosis, Usage]:
    """Run the founder's metrics through the analytics adapter -> AdDiagnosis."""
    user = (
        "Ad / marketing performance data (JSON). Diagnose it:\n"
        + json.dumps(metrics, ensure_ascii=False, indent=2)
    )
    return await socket.complete(AgentRole.ANALYTICS, ANALYTICS_SYS, user, AdDiagnosis)

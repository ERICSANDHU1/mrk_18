"""B3 — machine-readable status enums + the content state machine.

A single public source of truth for every run/item lifecycle the UI renders, so
the frontend never hardcodes status strings or guesses legal transitions.
"""

from fastapi import APIRouter

from ..schemas.content import ALLOWED_TRANSITIONS
from ..schemas.enums import ApprovalDecision, ContentStatus, PublishStatus, RunStatus

router = APIRouter(tags=["meta"])

# The run lifecycle is graph-driven (no static transition table); these two are
# the only terminal states.
RUN_TERMINAL = {RunStatus.DONE.value, RunStatus.FAILED.value}


@router.get("/meta/statuses")
async def statuses() -> dict:
    """All statuses the UI renders + the content state machine. Public: static
    metadata, never founder data."""
    content_transitions = {
        status.value: sorted(nxt.value for nxt in nexts)
        for status, nexts in ALLOWED_TRANSITIONS.items()
    }
    return {
        "run_status": {
            "values": [s.value for s in RunStatus],
            "terminal": sorted(RUN_TERMINAL),
        },
        "content_status": {
            "values": [s.value for s in ContentStatus],
            "transitions": content_transitions,
            "terminal": sorted(s for s, nxt in content_transitions.items() if not nxt),
        },
        "publish_status": {"values": [s.value for s in PublishStatus]},
        "approval_decision": {"values": [s.value for s in ApprovalDecision]},
    }

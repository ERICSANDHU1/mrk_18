"""Shared state for the analysis graph (Stage 2/3 of the pipeline)."""

import operator
from typing import Annotated, TypedDict


class AnalysisState(TypedDict, total=False):
    run_id: str
    founder_id: str
    profile: dict
    founder_flags: list[str]  # disagreements raised at Gate 1 (drive one re-run)
    rerun_count: int
    # parallel agents append; synthesizer reads the LAST entry per agent
    analyses: Annotated[list[dict], operator.add]
    usage: Annotated[list[dict], operator.add]
    report: dict | None
    gate1_decision: dict | None
    # generation stage (Slice 1.4): one entry per generated post; APPEND-ONLY —
    # later versions of an item_id supersede earlier ones (see latest_items())
    content_items: Annotated[list[dict], operator.add]
    # gate 2 (Slice 1.5): rejected-with-note items queued for one regeneration
    regen_queue: list[dict]
    gate2_decisions: dict | None

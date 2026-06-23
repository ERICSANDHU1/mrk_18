"""Shared state for the analysis graph (Stage 2/3 of the pipeline)."""

import operator
from typing import Annotated, TypedDict


class AnalysisState(TypedDict, total=False):
    run_id: str
    founder_id: str
    profile: dict
    founder_flags: list[str]  # disagreements raised at Gate 1 (drive one re-run)
    # Slice 3.2 — Eagle-View's lessons from previous measured posts (rendered
    # prompt block); None/absent for a founder with nothing measured yet
    performance_memo: str | None
    # Slice 3.3 — Company Brain retrieval: the founder's own knowledge,
    # rendered for prompts; None when no corpus / no embedding engine
    company_knowledge: str | None
    # Web-search grounding: real, current context on the brand + named
    # competitors, fetched by the router; None when no researcher / search failed
    web_research: str | None
    # RAG Tier 1/2: shared experience base (real campaign cases) retrieved for
    # this run; None when no engine / empty corpus / retrieval failed
    experience: str | None
    # The founder's OWN website content (their product page), fetched by the
    # router — grounds the analysis + the image prompts in the REAL product
    brand_page: str | None
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

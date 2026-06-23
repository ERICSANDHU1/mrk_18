"""The analysis StateGraph: Router → 3 agents (parallel) → Synthesize →
⛔ Gate 1 (interrupt) → approved END, or one capped re-run on founder flags.

Design rules from the research (SYSTEM_ARCHITECTURE §5):
  * gates are single side-effect-free nodes AFTER the fan-in (one interrupt
    per thread — the simple, fully supported case; LLM work never sits in a
    gate node because interrupted nodes replay from their start on resume)
  * fan-out via plain edges, fan-in via the `analyses` list reducer
"""

import logging
from dataclasses import asdict
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt
from pydantic import BaseModel, Field

from ..agents.analysis import run_analysis_agent, run_synthesis
from ..agents.content import IMAGE_FORMATS, PLATFORM_FORMAT, generate_item
from ..agents.photo_funnel import render_media
from ..llm.socket import AgentRole, LLMSocket
from ..schemas.content import MAX_REGENERATIONS
from ..schemas.enums import ContentStatus, Platform
from ..schemas.report import MarketingIntelligenceReport, ReportSection
from .state import AnalysisState

log = logging.getLogger("mrk18.graph")


def latest_items(entries: list[dict]) -> dict[str, dict]:
    """The content_items state list is append-only; later versions of the same
    item_id supersede earlier ones. This returns the live view."""
    latest: dict[str, dict] = {}
    for entry in entries or []:
        latest[entry["item_id"]] = entry
    return latest

MAX_RERUNS = 1

ANALYSIS_AGENTS = (AgentRole.MARKET_INTEL, AgentRole.AUDIENCE, AgentRole.STRATEGY)


class _CompetitorNames(BaseModel):
    """Structured output for the competitor-discovery extraction step."""

    names: list[str] = Field(default_factory=list)


def _latest_sections(state: AnalysisState) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    for entry in state.get("analyses", []):
        latest[entry["agent"]] = entry["section"]  # later entries overwrite
    return latest


def build_analysis_graph(
    socket: LLMSocket, checkpointer, image_engine=None, media_store=None, researcher=None
):
    def make_agent_node(role: AgentRole):
        async def agent_node(state: AnalysisState) -> dict:
            section, usage = await run_analysis_agent(
                socket,
                role,
                state["profile"],
                state.get("founder_flags", []),
                performance_memo=state.get("performance_memo"),
                company_knowledge=state.get("company_knowledge"),
                web_research=state.get("web_research"),
                experience=state.get("experience"),
            )
            return {
                "analyses": [{"agent": role.value, "section": section.model_dump(mode="json")}],
                "usage": [asdict(usage)],
            }

        return agent_node

    async def _extract_competitor_names(context: str) -> list[str]:
        """LLM-extract clean competitor names from discovery search results
        (cheap TRIAGE seat). Closure so it captures `socket`."""
        system = (
            "From the web search results, extract ONLY the real competitor or "
            "alternative company/product names for this brand — names only, no "
            "descriptions, max 4, most relevant first. Indian and global are fine."
        )
        obj, _usage = await socket.complete(
            AgentRole.TRIAGE, system, context, _CompetitorNames
        )
        return obj.names

    async def router(state: AnalysisState) -> dict:
        # Prompt-route placeholder (Sheet 4, row R: "prompt-route now, cheap
        # classifier later"). One pipeline today → nothing to choose between;
        # the seam exists so the trained router slots in without rewiring.
        if not state.get("profile"):
            raise ValueError("router: no validated profile in state")
        # Web-search grounding: DISCOVER the brand's competitors (founder no longer
        # provides them), then deep-search the brand + each one, BEFORE the analysis
        # agents fan out. Persists into state so a re-run reuses it. Degrades to no
        # context on any error — a run never breaks because search was unavailable.
        if researcher is not None:
            try:
                from ..research.web import (
                    discover_competitors,
                    fetch_brand_page,
                    gather_market_research,
                )

                profile = state["profile"]
                competitors = [
                    c
                    for c in (profile.get("top_competitors") or [])
                    if isinstance(c, str) and c.strip()
                ]
                if not competitors:
                    competitors = await discover_competitors(
                        researcher, profile, extract_fn=_extract_competitor_names
                    )
                # Level 1: read the founder's OWN website — grounds the analysis AND
                # the image prompts in the real product (its look, features, words).
                brand_page = await fetch_brand_page(researcher, profile)
                research = await gather_market_research(
                    researcher, profile, competitors=competitors, brand_page=brand_page
                )
                out: dict = {}
                if research:
                    out["web_research"] = research
                if brand_page:
                    out["brand_page"] = brand_page
                if out:
                    return out
            except Exception as exc:  # noqa: BLE001 — search must never break a run
                log.warning("web research skipped: %s", exc)
        return {}

    async def synthesize(state: AnalysisState) -> dict:
        sections = _latest_sections(state)
        synthesis, usage = await run_synthesis(
            socket,
            state["profile"],
            sections,
            state.get("founder_flags", []),
            performance_memo=state.get("performance_memo"),
            company_knowledge=state.get("company_knowledge"),
            web_research=state.get("web_research"),
            experience=state.get("experience"),
        )
        report = MarketingIntelligenceReport(
            run_id=UUID(state["run_id"]),
            market_intel=ReportSection.model_validate(sections["market_intel"]),
            audience_positioning=ReportSection.model_validate(sections["audience"]),
            content_strategy=ReportSection.model_validate(sections["strategy"]),
            synthesis=synthesis.synthesis,
            founder_flags=state.get("founder_flags", []),
        )
        return {"report": report.model_dump(mode="json"), "usage": [asdict(usage)]}

    async def gate1(state: AnalysisState) -> dict:
        # Side-effect-free: the ONLY thing this node does is pause.
        decision = interrupt(
            {
                "gate": "gate1_report_review",
                "run_id": state["run_id"],
                "report": state["report"],
                "instructions": "Reply {'action': 'approve'} or {'action': 'flag', 'flags': [...]}",
            }
        )
        update: dict = {"gate1_decision": decision}
        if decision.get("action") == "flag":
            update["founder_flags"] = [str(f) for f in decision.get("flags", [])]
            update["rerun_count"] = state.get("rerun_count", 0) + 1
        return update

    def after_gate1(state: AnalysisState) -> list[str] | str:
        decision = state.get("gate1_decision") or {}
        if decision.get("action") == "flag":
            if state.get("rerun_count", 0) <= MAX_RERUNS:
                return [r.value for r in ANALYSIS_AGENTS]  # one revision pass
            return END  # re-run budget exhausted: stop, flags stay recorded
        return "plan_content"  # approved → generation stage (Slice 1.4)

    async def plan_content(state: AnalysisState) -> dict:
        return {}  # fan-out happens in the conditional edge below

    def fan_out_items(state: AnalysisState) -> list[Send] | str:
        platforms = [
            p for p in state.get("profile", {}).get("target_platforms", [])
            if p in {pl.value for pl in Platform}
        ]
        if not platforms:
            return END
        return [
            Send(
                "generate_item",
                {
                    "run_id": state["run_id"],
                    "founder_id": state["founder_id"],
                    "profile": state["profile"],
                    "report": state["report"],
                    "platform": platform,
                    "performance_memo": state.get("performance_memo"),
                    "company_knowledge": state.get("company_knowledge"),
                    "brand_page": state.get("brand_page"),
                },
            )
            for platform in platforms
        ]

    async def generate_item_node(plan: dict) -> dict:
        platform = Platform(plan["platform"])
        item, usages = await generate_item(
            socket,
            plan["run_id"],
            plan["profile"],
            plan["report"],
            platform,
            performance_memo=plan.get("performance_memo"),
            company_knowledge=plan.get("company_knowledge"),
            brand_page=plan.get("brand_page"),
        )
        if (
            image_engine is not None
            and media_store is not None
            and PLATFORM_FORMAT[platform] in IMAGE_FORMATS
        ):
            try:
                spec = await render_media(image_engine, media_store, item, plan["founder_id"])
                item.media = [spec]  # validate_assignment re-runs platform media rules
            except Exception as exc:  # noqa: BLE001 — image failure must NEVER kill the run:
                # the post ships without its image; the founder can regenerate later.
                # L3: log it so a systemic storage/auth outage is visible, not
                # silently indistinguishable from a flaky free image API.
                log.warning("image degrade for item %s: %r", item.item_id, exc)
                item.media = []
        item.status = ContentStatus.AWAITING_APPROVAL  # draft -> awaiting (allowed)
        return {
            "content_items": [item.model_dump(mode="json")],
            "usage": [asdict(u) for u in usages],
        }

    async def gate2(state: AnalysisState) -> dict:
        # Side-effect-free up to the interrupt (replay rule). Decisions arrive
        # as {item_id: {"action": "approve"|"reject", "note": str|None}}.
        # Items the founder stays silent on remain awaiting (expiry job = the
        # silence-is-rejection rule; it lives outside the graph).
        items = latest_items(state.get("content_items", []))
        awaiting = {
            iid: it
            for iid, it in items.items()
            if it["status"] == ContentStatus.AWAITING_APPROVAL.value
        }
        if not awaiting:
            return {"regen_queue": []}
        decisions: dict = interrupt(
            {
                "gate": "gate2_items_review",
                "run_id": state["run_id"],
                "items": list(awaiting.values()),
                "instructions": (
                    "Reply {item_id: {'action': 'approve'|'reject', 'note': '...'}} "
                    "per item. No bulk approve exists. Silence keeps an item "
                    "awaiting until it expires (= rejection)."
                ),
            }
        )
        updated: list[dict] = []
        regen_queue: list[dict] = []
        for iid, decision in (decisions or {}).items():
            item = awaiting.get(str(iid))
            if item is None:
                continue  # unknown/already-decided ids are ignored, never fatal
            action = decision.get("action")
            if action == "approve":
                updated.append({**item, "status": ContentStatus.APPROVED.value})
            elif action == "reject":
                note = (decision.get("note") or "").strip() or None
                rejected = {
                    **item,
                    "status": ContentStatus.REJECTED.value,
                    "regeneration_note": note,
                }
                updated.append(rejected)
                if note and item.get("regeneration_count", 0) < MAX_REGENERATIONS:
                    regen_queue.append(rejected)
        return {"content_items": updated, "regen_queue": regen_queue}

    def after_gate2(state: AnalysisState) -> list[Send] | str:
        queue = state.get("regen_queue") or []
        if queue:
            return [
                Send(
                    "regenerate_item",
                    {
                        "run_id": state["run_id"],
                        "founder_id": state["founder_id"],
                        "profile": state["profile"],
                        "report": state["report"],
                        "item": item,
                        "performance_memo": state.get("performance_memo"),
                        "company_knowledge": state.get("company_knowledge"),
                        "brand_page": state.get("brand_page"),
                    },
                )
                for item in queue
            ]
        items = latest_items(state.get("content_items", []))
        if any(
            it["status"] == ContentStatus.AWAITING_APPROVAL.value for it in items.values()
        ):
            return "gate2"  # founder decided some items, others still await
        return END

    async def regenerate_item_node(plan: dict) -> dict:
        prior = plan["item"]
        platform = Platform(prior["platform"])
        item, usages = await generate_item(
            socket,
            plan["run_id"],
            plan["profile"],
            plan["report"],
            platform,
            item_id=prior["item_id"],
            prior_body=prior["body"],
            rejection_note=prior.get("regeneration_note"),
            regeneration_count=prior.get("regeneration_count", 0) + 1,
            performance_memo=plan.get("performance_memo"),
            company_knowledge=plan.get("company_knowledge"),
            brand_page=plan.get("brand_page"),
        )
        if (
            image_engine is not None
            and media_store is not None
            and PLATFORM_FORMAT[platform] in IMAGE_FORMATS
        ):
            try:
                spec = await render_media(image_engine, media_store, item, plan["founder_id"])
                item.media = [spec]
            except Exception:  # noqa: BLE001 — same degrade rule as first generation
                item.media = []
        item.status = ContentStatus.AWAITING_APPROVAL  # back to the gate
        return {
            "content_items": [item.model_dump(mode="json")],
            "usage": [asdict(u) for u in usages],
        }

    builder = StateGraph(AnalysisState)
    builder.add_node("router", router)
    for role in ANALYSIS_AGENTS:
        builder.add_node(role.value, make_agent_node(role))
    builder.add_node("synthesize", synthesize)
    builder.add_node("gate1", gate1)
    builder.add_node("plan_content", plan_content)
    builder.add_node("generate_item", generate_item_node)
    builder.add_node("gate2", gate2)
    builder.add_node("regenerate_item", regenerate_item_node)

    builder.add_edge(START, "router")
    for role in ANALYSIS_AGENTS:
        builder.add_edge("router", role.value)  # fan-out (parallel superstep)
        builder.add_edge(role.value, "synthesize")  # fan-in (waits for all 3)
    builder.add_edge("synthesize", "gate1")
    builder.add_conditional_edges(
        "gate1", after_gate1, [r.value for r in ANALYSIS_AGENTS] + ["plan_content", END]
    )
    builder.add_conditional_edges("plan_content", fan_out_items, ["generate_item", END])
    builder.add_edge("generate_item", "gate2")  # fan-in: gate2 waits for all items
    builder.add_conditional_edges("gate2", after_gate2, ["regenerate_item", "gate2", END])
    builder.add_edge("regenerate_item", "gate2")  # revised items return to the gate

    return builder.compile(checkpointer=checkpointer)

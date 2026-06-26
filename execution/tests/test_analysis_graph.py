"""Slice 1.3 — the analysis graph, run against a FAKE brain (no network).

What's fake: the LLM (returns valid schema objects instantly).
What's real: the LangGraph graph, the interrupt/resume machinery, the
checkpointer, the run lifecycle, the runs table, the audit trail.
"""

from collections import Counter
from uuid import UUID

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.agents.analysis import SynthesisOut
from mrk18_execution.agents.content import DraftCopy
from mrk18_execution.db.models import AuditRow, FounderProfileRow, FounderRow, RunRow
from mrk18_execution.graph import lifecycle
from mrk18_execution.graph.analysis import build_analysis_graph
from mrk18_execution.llm.socket import Usage
from mrk18_execution.schemas.report import ReportSection


class FakeSocket:
    """Stands in for the model socket: instant, valid, countable."""

    def __init__(self):
        self.calls = Counter()

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        self.calls[role.value] += 1
        usage = Usage(role.value, "openai/gpt-oss-120b", 1000, 300)
        if schema is ReportSection:
            section = ReportSection.model_validate(
                {
                    "summary": f"{role.value} summary (call #{self.calls[role.value]})",
                    "claims": [
                        {
                            "text": "Founder targets Indian tech parks.",
                            "source": "intake:icp",
                            "confidence": "high",
                        },
                        {
                            "text": "Category competition is intense.",
                            "source": "model-knowledge",
                            "confidence": "low",
                        },
                    ],
                }
            )
            return section, usage
        if schema is SynthesisOut:
            return (
                SynthesisOut(
                    synthesis="Your single most important move: own the facility-manager "
                    "niche on LinkedIn before spending a rupee on ads. " * 2
                ),
                usage,
            )
        if schema is DraftCopy:
            thread = None
            if "x_thread" in system or "x_thread" in user:
                thread = ["Hook: chai decides your office culture. #chai", "Proof: 200-seat parks repeat-order in week 2."]
            return (
                DraftCopy(
                    body=thread[0] if thread else "Real talk: your office chai is a culture decision, not a snack decision. #chai #office",
                    thread=thread,
                    first_comment=None,
                    image_prompt="warm flat illustration of a robotic chai stall in an Indian office, bold red accents",
                    alt_text="robotic chai stall",
                ),
                usage,
            )
        raise AssertionError(f"unexpected schema requested: {schema}")

    async def chat(self, role, system, messages, *, max_tokens=220, temperature=0.6):
        # Prose pass — analysis agents speak in their trained voice, the verdict IS prose.
        self.calls[role.value] += 1
        usage = Usage(role.value, "openai/gpt-oss-120b", 800, 400)
        text = (
            "Bitter truth: your positioning is muddy and you're paying for it. Target "
            "facility managers in Tier-1 tech parks and lead with a 14-day pilot, not a "
            "discount. Do this first: ship three founder-POV posts this week."
        )
        return text, usage


@pytest.fixture
async def ctx(engine):
    """A ready founder + graph with fake brain + session factory."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="graph@test.in", display_name="Graph Test")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={
                    "company_name": "Chai Robotics",
                    "icp": "tech parks",
                    "tone": "bold, desi",
                    "target_platforms": ["linkedin", "x", "instagram"],
                },
            )
        )
        await session.commit()
        founder_id = founder.id
    socket = FakeSocket()
    graph = build_analysis_graph(socket, InMemorySaver())
    return factory, graph, socket, founder_id


async def test_run_blocked_for_incomplete_founder(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        founder = FounderRow(email="draft@test.in")
        session.add(founder)
        await session.flush()
        session.add(FounderProfileRow(founder_id=founder.id, status="draft", draft={}))
        await session.commit()
        fid = founder.id
    with pytest.raises(ValueError, match="not complete"):
        await lifecycle.start_run(factory, fid)


async def test_unknown_founder(ctx):
    factory, *_ = ctx
    with pytest.raises(LookupError):
        await lifecycle.start_run(factory, UUID("00000000-0000-0000-0000-000000000000"))


async def approve_all_gate2(factory, graph, run_id):
    """Helper: approve every awaiting item at Gate 2 (one decision each —
    there is no bulk member; this loop IS the founder clicking N times)."""
    async with factory() as session:
        row = await session.get(RunRow, run_id)
    if row.status != "awaiting_gate2":
        return
    items = row.gate2["payload"]["items"]
    decisions = [{"item_id": it["item_id"], "action": "approve", "note": None} for it in items]
    await lifecycle.resume_gate2(graph, factory, run_id, decisions)


async def test_full_run_pauses_at_gate_then_approve_completes(ctx):
    factory, graph, socket, founder_id = ctx

    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)

    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "awaiting_gate1"
    assert row.gate1["awaiting"] is True
    assert row.gate1["payload"]["report"]["synthesis"]  # report visible at the gate
    assert row.tokens_in > 0 and row.cost_inr > 0  # the meter ran
    # all four analysis agents ran exactly once, plus one synthesis
    assert socket.calls["market_intel"] == 1
    assert socket.calls["audience"] == 1
    assert socket.calls["strategy"] == 1
    assert socket.calls["usp"] == 1  # 4th parallel seat
    assert socket.calls["synthesis"] == 1

    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})

    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "awaiting_gate2"  # generation done → items at the gate
    assert socket.calls["content"] == 3  # one generator per target platform
    assert len(row.gate2["payload"]["items"]) == 3

    await approve_all_gate2(factory, graph, run.run_id)

    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "done"
    assert row.report["market_intel"]["claims"]
    assert row.report["usp_positioning"]["claims"]  # USP section present in the report
    assert row.finished_at is not None


async def test_flag_triggers_one_capped_rerun(ctx):
    factory, graph, socket, founder_id = ctx

    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)

    # founder disagrees → agents re-run once with the flags
    await lifecycle.resume_gate1(
        graph, factory, run.run_id, {"action": "flag", "flags": ["CAC claim looks wrong"]}
    )
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "awaiting_gate1"  # revised report, gate again
    assert socket.calls["market_intel"] == 2  # re-ran

    # founder flags AGAIN → rerun budget exhausted → run finishes, flags recorded
    await lifecycle.resume_gate1(
        graph, factory, run.run_id, {"action": "flag", "flags": ["still disagree"]}
    )
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "done"
    assert socket.calls["market_intel"] == 2  # capped: no third pass
    assert row.report["founder_flags"] == ["still disagree"]


async def test_resume_gate1_on_non_waiting_run_is_a_safe_noop(ctx):
    """A gate1 resume on a run that isn't waiting (e.g. the loser of a
    concurrent double-click) must NOT raise and must NOT do any work — the
    API endpoint owns user-facing 409s; the background resume just stands down."""
    factory, graph, socket, founder_id = ctx
    run = await lifecycle.start_run(factory, founder_id)  # status == 'generating'
    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "generating"  # untouched
    assert socket.calls["market_intel"] == 0  # no agents ran


async def test_audit_trail_of_a_run(ctx):
    factory, graph, socket, founder_id = ctx
    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(graph, factory, run)
    await lifecycle.resume_gate1(graph, factory, run.run_id, {"action": "approve"})
    await approve_all_gate2(factory, graph, run.run_id)

    async with factory() as session:
        outcomes = (
            (await session.execute(select(AuditRow.outcome).where(AuditRow.run_id == run.run_id)))
            .scalars()
            .all()
        )
    assert "analysis_run_started" in outcomes
    assert "gate1_report_review_reached" in outcomes
    assert "gate1_approve" in outcomes
    assert "gate2_items_review_reached" in outcomes
    assert outcomes.count("gate2_item_approved") == 3  # one event per item, no bulk
    assert "analysis_run_completed" in outcomes


async def test_failed_run_lands_in_db(ctx):
    factory, _, _, founder_id = ctx

    class ExplodingSocket:
        async def complete(self, *a, **k):
            raise RuntimeError("provider on fire")

        async def chat(self, *a, **k):
            raise RuntimeError("provider on fire")

    bad_graph = build_analysis_graph(ExplodingSocket(), InMemorySaver())
    run = await lifecycle.start_run(factory, founder_id)
    await lifecycle.execute_run(bad_graph, factory, run)

    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "failed"
    assert "provider on fire" in row.error

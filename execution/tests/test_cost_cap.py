"""A5 — cost governance: honest pricing for any model, a per-run circuit-breaker,
and a per-founder daily ₹ cap."""

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from mrk18_execution.db.models import FounderProfileRow, FounderRow, RunRow
from mrk18_execution.graph import lifecycle
from mrk18_execution.graph.lifecycle import CostCapExceeded
from mrk18_execution.llm.socket import Usage, cost_inr_for


# ── pricing: no silent ₹0 ────────────────────────────────────────────────────
def test_known_model_priced():
    # gpt-oss-120b @ 0.15 USD/M in, 88 INR/USD → 1M in = 0.15 * 88
    assert cost_inr_for("openai/gpt-oss-120b", 1_000_000, 0) == round(0.15 * 88.0, 4)


def test_unknown_model_is_not_free():
    # the ₹0 landmine is closed — an unlisted model meters a real cost
    assert cost_inr_for("some-brand-new-model", 1_000_000, 1_000_000) > 0


def test_usage_cost_uses_default_for_unknown():
    assert Usage("content", "mystery-model", 1000, 1000).cost_inr > 0


# ── fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture
async def factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


async def _ready_founder(factory, *, today_cost=0.0):
    async with factory() as session:
        founder = FounderRow(email=f"{uuid4().hex[:8]}@cap.test")
        session.add(founder)
        await session.flush()
        session.add(
            FounderProfileRow(
                founder_id=founder.id,
                status="ready_for_analysis",
                draft={},
                profile={
                    "company_name": "Cap Co",
                    "icp": "smbs",
                    "tone": "bold",
                    "target_platforms": ["linkedin"],
                },
            )
        )
        if today_cost:
            session.add(
                RunRow(
                    run_id=uuid4(),
                    founder_id=founder.id,
                    thread_id=str(uuid4()),
                    status="done",
                    cost_inr=today_cost,
                )
            )
        await session.commit()
        return founder.id


# ── daily cap ────────────────────────────────────────────────────────────────
async def test_daily_cap_blocks_new_run(factory):
    fid = await _ready_founder(factory, today_cost=120.0)
    with pytest.raises(CostCapExceeded):
        await lifecycle.start_run(factory, fid, daily_cost_cap_inr=100.0)


async def test_daily_cap_allows_under_budget(factory):
    fid = await _ready_founder(factory, today_cost=40.0)
    run = await lifecycle.start_run(factory, fid, daily_cost_cap_inr=100.0)
    assert run.status == "generating"


async def test_daily_cap_disabled_with_zero(factory):
    fid = await _ready_founder(factory, today_cost=9999.0)
    run = await lifecycle.start_run(factory, fid, daily_cost_cap_inr=0)
    assert run.status == "generating"


# ── per-run circuit-breaker ──────────────────────────────────────────────────
class _ExpensiveGraph:
    """A fake graph whose one invocation reports a huge token bill and no gate."""

    async def ainvoke(self, graph_input, config, durability):
        return {
            "usage": [
                {
                    "model": "openai/gpt-oss-120b",
                    "tokens_in": 10_000_000,
                    "tokens_out": 10_000_000,
                }
            ],
            "report": {"synthesis": "x"},
            "content_items": [],
            "__interrupt__": None,
        }


async def test_run_cost_breaker_marks_failed(factory):
    fid = await _ready_founder(factory)
    run = await lifecycle.start_run(factory, fid, daily_cost_cap_inr=0)
    await lifecycle.execute_run(_ExpensiveGraph(), factory, run, run_cost_cap_inr=1.0)
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "failed"
    assert "cost ceiling" in row.error


async def test_run_under_cap_is_not_broken(factory):
    fid = await _ready_founder(factory)
    run = await lifecycle.start_run(factory, fid, daily_cost_cap_inr=0)
    # a generous cap → the breaker stays out of the way (run completes as done)
    await lifecycle.execute_run(_ExpensiveGraph(), factory, run, run_cost_cap_inr=100_000.0)
    async with factory() as session:
        row = await session.get(RunRow, run.run_id)
    assert row.status == "done"

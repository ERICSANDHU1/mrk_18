"""The Analytics Interpreter agent: the trained `analytics` adapter, wired.
Routes metrics to the ANALYTICS role, returns a structured diagnosis, sandboxed."""

import pytest
from pydantic import ValidationError

from mrk18_execution.agents.analytics import AdDiagnosis, diagnose_metrics
from mrk18_execution.llm.socket import (
    BRAIN_ADAPTERS,
    AgentRole,
    brain_registry,
    default_registry,
)
from mrk18_execution.security.manifests import (
    AGENT_MANIFESTS,
    PermissionViolation,
    require_permission,
)

SAMPLE_METRICS = {
    "total_spend_inr": 250000,
    "campaigns": [
        {"name": "Meta Prospecting", "spend": 150000, "roas": 1.2, "cac": 1100, "ctr": 0.008},
        {"name": "Meta Retargeting", "spend": 60000, "roas": 4.1, "cac": 380, "ctr": 0.022},
    ],
}

DIAG = {
    "headline": "Retargeting carries the account; prospecting is bleeding.",
    "working": ["Meta Retargeting at 4.1 ROAS"],
    "leaking": ["Meta Prospecting: 60% of spend at 1.2 ROAS, CAC 1100"],
    "scale": ["Shift budget to retargeting"],
    "cut": ["Pause prospecting"],
    "next_move": "Cut prospecting 40%, move it to retargeting.",
}


class StubSocket:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        self.calls.append((role, user))
        return schema(**self.payload), None


async def test_diagnose_routes_to_analytics_role_and_returns_diagnosis():
    sock = StubSocket(DIAG)
    diag, _usage = await diagnose_metrics(sock, SAMPLE_METRICS)
    assert isinstance(diag, AdDiagnosis)
    assert diag.next_move
    assert any("Retargeting" in w for w in diag.working)
    role, user = sock.calls[0]
    assert role == AgentRole.ANALYTICS  # routed to the trained adapter's role
    assert "250000" in user  # the real metrics reached the prompt


def test_analytics_role_maps_to_the_trained_adapter():
    assert BRAIN_ADAPTERS[AgentRole.ANALYTICS] == "analytics"
    assert brain_registry("https://b/v1", "k")[AgentRole.ANALYTICS].model == "analytics"
    assert AgentRole.ANALYTICS in default_registry("k")  # Groq fallback covers it too


def test_analytics_is_sandboxed_llm_only():
    require_permission("agent:analytics", "llm:complete")  # allowed
    with pytest.raises(PermissionViolation):
        require_permission("agent:analytics", "publish:x")  # never touches the world
    assert AGENT_MANIFESTS["agent:analytics"] == frozenset({"llm:complete"})


def test_schema_requires_headline_and_next_move():
    with pytest.raises(ValidationError):
        AdDiagnosis(headline="", next_move="x")

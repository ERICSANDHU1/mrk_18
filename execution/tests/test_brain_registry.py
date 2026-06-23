"""Phase 4 seam — the trained Brain registry maps every role to its adapter.

This is the one-config-step switch: when brain_base_url is set, the LLM socket
repoints every role to the vLLM multi-LoRA endpoint with no agent-code changes.
"""

from mrk18_execution.llm.socket import AgentRole, brain_registry


def test_brain_registry_covers_every_role():
    reg = brain_registry("https://brain.example/v1", "k", "qwen3-32b")
    assert set(reg) == set(AgentRole)


def test_role_to_adapter_mapping():
    reg = brain_registry("https://brain.example/v1", "k", "qwen3-32b")
    assert reg[AgentRole.SYNTHESIS].model == "personality"
    assert reg[AgentRole.COMMENT].model == "personality"
    assert reg[AgentRole.CONTENT].model == "ad_copy"
    assert reg[AgentRole.STRATEGY].model == "funnel"
    assert reg[AgentRole.MARKET_INTEL].model == "brand_analysis"
    assert reg[AgentRole.AUDIENCE].model == "brand_analysis"
    # TRIAGE has no dedicated adapter -> the base model
    assert reg[AgentRole.TRIAGE].model == "qwen3-32b"


def test_all_seats_point_at_the_brain_endpoint():
    reg = brain_registry("https://brain.example/v1", "secret", "qwen3-32b")
    for seat in reg.values():
        assert seat.base_url == "https://brain.example/v1"
        assert seat.api_key == "secret"


def test_per_role_generation_params_preserved():
    reg = brain_registry("https://brain.example/v1", "k")
    assert reg[AgentRole.SYNTHESIS].max_tokens == 2200
    assert reg[AgentRole.CONTENT].temperature == 0.6
    assert reg[AgentRole.COMMENT].max_tokens == 400

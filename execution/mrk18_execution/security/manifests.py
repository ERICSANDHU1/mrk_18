"""Slice 2.3 — permission manifests per agent. Deny by default.

Each agent gets a declared, reviewable list of capabilities — what it may do,
not what it happens to be able to reach. Enforcement lives at the choke points
every action funnels through (the LLM socket, the photo funnel, the publisher
dispatch), so a confused agent, a prompt-injected instruction, or a rogue code
path asking for a capability outside its manifest is refused and alarmed,
never trusted.

An agent that is not in the registry has NO permissions. Adding a new agent
means adding its manifest here — a one-line, code-reviewed security decision.
"""

AGENT_MANIFESTS: dict[str, frozenset[str]] = {
    # analysis & generation agents: text in, text out — nothing else
    "agent:market_intel": frozenset({"llm:complete"}),
    "agent:audience": frozenset({"llm:complete"}),
    "agent:strategy": frozenset({"llm:complete"}),
    "agent:usp": frozenset({"llm:complete"}),
    "agent:structure": frozenset({"llm:complete"}),
    "agent:synthesis": frozenset({"llm:complete"}),
    "agent:content": frozenset({"llm:complete"}),
    "agent:script": frozenset({"llm:complete"}),  # reel/short-video scriptwriter
    "agent:triage": frozenset({"llm:complete"}),
    # Analytics Interpreter: reads metrics -> diagnosis. Text in, text out — no
    # publish, no token access, never touches the outside world.
    "agent:analytics": frozenset({"llm:complete"}),
    # the execution half of images: render + store, may NOT call the LLM
    "agent:photo_funnel": frozenset({"images:generate", "storage:write"}),
    # the only agent allowed to touch the outside world — and even then only
    # through the approval guard + step token chain
    "agent:publisher": frozenset(
        {"publish:export", "publish:linkedin", "publish:x", "publish:instagram"}
    ),
    # Eagle-View reads the world and writes metrics — it may NEVER publish,
    # never call the LLM, never touch tokens
    "agent:eagle_view": frozenset({"signals:read", "signals:write"}),
    # the Company Brain: knowledge in, knowledge out — cannot publish,
    # cannot call the chat LLM (embeddings ride their own engine)
    "agent:company_brain": frozenset({"knowledge:read", "knowledge:write"}),
    # the Comment Agent: reads comments, scores sentiment (a signal write),
    # drafts replies via the LLM — but CANNOT publish. A drafted reply only
    # goes out when the founder approves it (no publish:* capability here).
    "agent:comment": frozenset(
        {"llm:complete", "comments:read", "comments:write", "signals:write"}
    ),
}


class PermissionViolation(Exception):
    """An agent asked for a capability outside its manifest."""


def require_permission(agent_id: str, capability: str) -> None:
    """Raise PermissionViolation unless `agent_id` is granted `capability`.
    Unknown agents have no manifest and therefore no permissions."""
    granted = AGENT_MANIFESTS.get(agent_id)
    if granted is None:
        raise PermissionViolation(
            f"{agent_id}: no permission manifest exists — all actions denied"
        )
    if capability not in granted:
        raise PermissionViolation(
            f"{agent_id}: capability '{capability}' is not in its manifest "
            f"(granted: {sorted(granted)})"
        )

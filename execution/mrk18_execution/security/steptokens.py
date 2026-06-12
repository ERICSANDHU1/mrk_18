"""Slice 2.3 — ephemeral per-step capability tokens.

Agents hold no standing power. For each side-effectful step the orchestration
layer mints a short-lived HMAC token bound to (agent, exact scope) and the
executing boundary verifies it before acting. The publish chain is the
sharpest case: publish_run mints a token ONLY after the signed-approval guard
passes, scoped to that one item + that one ApprovalEvent — so calling an
adapter directly (around the guard) is refused: no fresh token, no publish.

Same shape as review links (exp.hmac, constant-time compare), same key
(APPROVAL_SIGNING_KEY). TTL is minutes — a leaked token dies almost
immediately and was only ever good for one item anyway.
"""

import hashlib
import hmac
import time

DEFAULT_TTL_S = 10 * 60  # a step takes seconds; minutes is generous

PUBLISHER_AGENT = "agent:publisher"


def _sign(key: str, agent_id: str, scope: str, exp: int) -> str:
    msg = f"step:{agent_id}:{scope}:{exp}".encode()
    return hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()


def mint_step_token(key: str, *, agent_id: str, scope: str, ttl_s: int = DEFAULT_TTL_S) -> str:
    exp = int(time.time()) + ttl_s
    return f"{exp}.{_sign(key, agent_id, scope, exp)}"


def verify_step_token(key: str, token: str, *, agent_id: str, scope: str) -> bool:
    exp_part, _, sig = (token or "").partition(".")
    if not exp_part.isdigit() or not sig:
        return False
    exp = int(exp_part)
    if time.time() > exp:
        return False
    return hmac.compare_digest(sig, _sign(key, agent_id, scope, exp))


def publish_scope(request) -> str:
    """The scope a publish step token is bound to: exactly one item under
    exactly one approval event."""
    return f"publish:{request.item_id}:{request.approval_event_id}"


def require_publish_token(signing_key: str | None, request, step_token: str | None) -> None:
    """Adapter-side gate. No key configured → not enforced (pilot/dev).
    Key configured → a missing/expired/mis-scoped token is a refusal."""
    if not signing_key:
        return
    from .manifests import PermissionViolation

    if not step_token or not verify_step_token(
        signing_key, step_token, agent_id=PUBLISHER_AGENT, scope=publish_scope(request)
    ):
        raise PermissionViolation(
            f"publish blocked for item {request.item_id}: missing or invalid step token "
            "— adapters act only on steps the guarded pipeline minted"
        )

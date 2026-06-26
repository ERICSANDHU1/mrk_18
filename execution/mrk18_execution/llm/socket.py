"""The model socket — every agent asks for a model BY ROLE, never by name.

Today every role maps to Groq's free tier. At Phase 4 the registry repoints
roles to the trained Brain's vLLM endpoint (same OpenAI-compatible API), one
role at a time, with rented providers demoted to fallback. Zero agent-code
changes — that is the entire point of this file.

Structured output strategy (provider-agnostic): json_object mode + the JSON
schema embedded in the system prompt + Pydantic validation with bounded
retries that feed the validation error back to the model.
"""

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import TypeVar

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError
from pydantic import BaseModel, ValidationError
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

T = TypeVar("T", bound=BaseModel)


def _is_transient(exc: BaseException) -> bool:
    """Retry only genuinely transient failures. APIStatusError is the base of
    every non-2xx in the OpenAI SDK, so a bad key (401), retired model (404),
    or malformed request (400) must NOT be retried — only 5xx and 429/connection
    errors are (review finding M2)."""
    if isinstance(exc, (RateLimitError, APIConnectionError)):
        return True
    if isinstance(exc, APIStatusError):
        return getattr(exc, "status_code", 0) >= 500
    return False

# Would-be cost per 1M tokens (USD in, USD out) — free tier bills ₹0, but the
# meter runs from day one so the unit economics are never a surprise later.
PRICES_USD_PER_M = {
    "openai/gpt-oss-120b": (0.15, 0.60),
    "llama-3.1-8b-instant": (0.05, 0.08),
    # Together (the Phase-4 stand-in / paid fallback)
    "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": (0.20, 0.60),
    # the trained Brain on self-hosted vLLM is compute-amortised — set its
    # effective per-token rate here at go-live.
}
# A5 — an UNKNOWN model must never silently meter ₹0 (that hid real spend and
# made the cost caps toothless). Price it conservatively instead, so dashboards
# and the per-run/daily caps stay honest the moment a new model appears.
DEFAULT_PRICE_USD_PER_M = (0.50, 1.50)
USD_TO_INR = 88.0


def price_for(model: str) -> tuple[float, float]:
    return PRICES_USD_PER_M.get(model, DEFAULT_PRICE_USD_PER_M)


def cost_inr_for(model: str, tokens_in: int, tokens_out: int) -> float:
    """Metered (would-be) INR cost of one model call — the single source of
    truth for cost, used by Usage and by the run-cost roll-up in graph/lifecycle."""
    p_in, p_out = price_for(model)
    usd = (tokens_in * p_in + tokens_out * p_out) / 1_000_000
    return round(usd * USD_TO_INR, 4)


class AgentRole(str, Enum):
    MARKET_INTEL = "market_intel"
    AUDIENCE = "audience"
    STRATEGY = "strategy"
    USP = "usp"  # USP & differentiation — the 4th parallel analysis seat
    STRUCTURE = "structure"  # base model: turns an adapter's PROSE analysis into JSON claims
    SYNTHESIS = "synthesis"
    CONTENT = "content"  # adapter #7's future seat (ad copywriter)
    TRIAGE = "triage"
    COMMENT = "comment"  # Slice 3.4 — drafts replies to comments AS the founder
    ANALYTICS = "analytics"  # reads connected ad/marketing metrics -> diagnosis


@dataclass
class ModelSeat:
    base_url: str
    api_key: str
    model: str
    max_tokens: int = 1600
    temperature: float = 0.3
    extra: dict = field(default_factory=dict)


@dataclass
class Usage:
    role: str
    model: str
    tokens_in: int
    tokens_out: int

    @property
    def cost_inr(self) -> float:
        return cost_inr_for(self.model, self.tokens_in, self.tokens_out)


def default_registry(groq_api_key: str) -> dict[AgentRole, ModelSeat]:
    """The pilot registry: everything on Groq free tier."""
    big = dict(
        base_url=GROQ_BASE_URL,
        api_key=groq_api_key,
        model="openai/gpt-oss-120b",
        extra={"reasoning_effort": "low"},  # save free-tier tokens
    )
    return {
        AgentRole.MARKET_INTEL: ModelSeat(**big),
        AgentRole.AUDIENCE: ModelSeat(**big),
        AgentRole.STRATEGY: ModelSeat(**big),
        AgentRole.USP: ModelSeat(**big),
        AgentRole.STRUCTURE: ModelSeat(**big),
        AgentRole.SYNTHESIS: ModelSeat(**big, max_tokens=2200),
        AgentRole.CONTENT: ModelSeat(**big, max_tokens=1800, temperature=0.6),
        AgentRole.COMMENT: ModelSeat(**big, max_tokens=400, temperature=0.5),
        AgentRole.ANALYTICS: ModelSeat(**big, max_tokens=1600),
        AgentRole.TRIAGE: ModelSeat(
            base_url=GROQ_BASE_URL, api_key=groq_api_key, model="llama-3.1-8b-instant"
        ),
    }


# Phase 4 — role -> served adapter name on the Brain's vLLM multi-LoRA endpoint.
# The 5-adapter spec (Production Readiness Plan): Personality, Brand Analysis,
# Funnel, Ad Copy, Analytics Interpreter. TRIAGE has no dedicated adapter -> the
# base model. CONFIRM the exact served `--lora-modules` names at integration.
BRAIN_ADAPTERS: dict[AgentRole, str] = {
    AgentRole.MARKET_INTEL: "brand_analysis",
    AgentRole.AUDIENCE: "brand_analysis",
    AgentRole.STRATEGY: "funnel",
    AgentRole.SYNTHESIS: "personality",
    AgentRole.CONTENT: "ad_copy",
    AgentRole.COMMENT: "personality",
    AgentRole.ANALYTICS: "analytics",  # reads ad/marketing metrics -> CMO diagnosis
    AgentRole.USP: "usp",  # Phase 1: the prose->structure bridge serves usp in its trained
    # PROSE voice (a chat pass), so the adapter fires on the distribution it saw; the base
    # STRUCTURE seat then turns that prose into JSON claims.
    # AgentRole.TRIAGE    -> base model (cheap classification, no adapter)
    # AgentRole.STRUCTURE -> base model (clean JSON; must NOT carry a prose LoRA)
}


def brain_registry(
    base_url: str, api_key: str, base_model: str = "qwen3-32b"
) -> dict[AgentRole, ModelSeat]:
    """Phase 4: every role served by the trained Brain on one OpenAI-compatible
    vLLM multi-LoRA endpoint. `model` is the served adapter name (TRIAGE uses the
    base). Flip one role at a time by editing BRAIN_ADAPTERS; the rest fall back
    to the base model. Same agent code, same socket — only the registry changes."""
    per_role = {
        AgentRole.SYNTHESIS: dict(max_tokens=2200),
        AgentRole.CONTENT: dict(max_tokens=1800, temperature=0.6),
        AgentRole.COMMENT: dict(max_tokens=400, temperature=0.5),
    }
    return {
        role: ModelSeat(
            base_url=base_url,
            api_key=api_key,
            model=BRAIN_ADAPTERS.get(role, base_model),
            **per_role.get(role, {}),
        )
        for role in AgentRole
    }


class LLMSocket:
    """One interface; swappable seats; schema-enforced replies."""

    def __init__(self, registry: dict[AgentRole, ModelSeat]):
        self._registry = registry
        self._clients: dict[str, AsyncOpenAI] = {}

    def _client(self, seat: ModelSeat) -> AsyncOpenAI:
        key = f"{seat.base_url}|{seat.api_key[:8]}"
        if key not in self._clients:
            self._clients[key] = AsyncOpenAI(base_url=seat.base_url, api_key=seat.api_key)
        return self._clients[key]

    @retry(
        retry=retry_if_exception(_is_transient),
        wait=wait_exponential_jitter(initial=3, max=45),
        stop=stop_after_attempt(6),
        reraise=True,
    )
    async def _call(self, seat: ModelSeat, messages: list[dict]) -> tuple[str, int, int]:
        resp = await self._client(seat).chat.completions.create(
            model=seat.model,
            messages=messages,
            max_tokens=seat.max_tokens,
            temperature=seat.temperature,
            response_format={"type": "json_object"},
            extra_body=seat.extra or None,
        )
        usage = resp.usage
        return (
            resp.choices[0].message.content or "",
            usage.prompt_tokens if usage else 0,
            usage.completion_tokens if usage else 0,
        )

    async def complete(
        self,
        role: AgentRole,
        system: str,
        user: str,
        schema: type[T],
        max_validation_retries: int = 2,
    ) -> tuple[T, Usage]:
        # Slice 2.3 — sandbox: only agents whose manifest grants llm:complete
        # may consume model calls (deny-by-default for any future agent).
        from ..security.manifests import require_permission

        require_permission(f"agent:{role.value}", "llm:complete")
        seat = self._registry[role]
        schema_json = json.dumps(schema.model_json_schema(), separators=(",", ":"))
        sys_msg = (
            f"{system}\n\nRespond with ONLY a JSON object matching this JSON Schema "
            f"exactly (no prose, no markdown):\n{schema_json}"
        )
        messages: list[dict] = [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user},
        ]

        total_in = total_out = 0
        last_error: Exception | None = None
        for _ in range(max_validation_retries + 1):
            text, t_in, t_out = await self._call(seat, messages)
            total_in += t_in
            total_out += t_out
            try:
                obj = schema.model_validate_json(text)
                return obj, Usage(role.value, seat.model, total_in, total_out)
            except ValidationError as exc:
                last_error = exc
                messages.append({"role": "assistant", "content": text})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "Your JSON failed validation. Fix EXACTLY these problems and "
                            f"resend the full corrected JSON object only:\n{exc}"
                        ),
                    }
                )
        raise RuntimeError(
            f"{role.value}: model output failed schema validation after retries: {last_error}"
        )

    @retry(
        retry=retry_if_exception(_is_transient),
        wait=wait_exponential_jitter(initial=2, max=20),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    async def _chat_call(
        self, seat: ModelSeat, messages: list[dict], max_tokens: int, temperature: float
    ) -> tuple[str, int, int]:
        resp = await self._client(seat).chat.completions.create(
            model=seat.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            extra_body=seat.extra or None,
        )
        usage = resp.usage
        return (
            resp.choices[0].message.content or "",
            usage.prompt_tokens if usage else 0,
            usage.completion_tokens if usage else 0,
        )

    async def chat(
        self,
        role: AgentRole,
        system: str,
        messages: list[dict],
        *,
        max_tokens: int = 220,
        temperature: float = 0.6,
    ) -> tuple[str, Usage]:
        """Plain-text conversational turn (NO JSON schema) — for the live CMO
        voice call. `messages` is the running [{role, content}] history. This is
        user-initiated and endpoint-authorised, so it deliberately skips the
        agent-sandbox manifest gate that guards autonomous pipeline agents."""
        seat = self._registry[role]
        convo: list[dict] = [{"role": "system", "content": system}, *messages]
        text, t_in, t_out = await self._chat_call(seat, convo, max_tokens, temperature)
        return text.strip(), Usage(role.value, seat.model, t_in, t_out)

"""A4 — content guardrails: enforce post-generation what the prompt only asks.

Two cheap, deterministic, LLM-free gates (codebase philosophy: reproducible,
zero cost, zero added latency):

  scan_input    — pre-LLM: flag prompt-injection / role-override in founder
                  free-text (e.g. a Gate-2 rejection note) before it can steer
                  generation.
  check_content — post-generation brand-safety: profanity/slurs, the founder's
                  do-not-claim list and words-to-avoid, and fabricated specifics
                  — a price, coupon code, or hard statistic the founder never
                  provided (NO_FABRICATION, enforced rather than merely asked).

Heuristic by design: it errs toward catching slips and feeding them back for one
regeneration, not toward perfect NLP. A false positive costs one retry; a
fabricated price in a founder's auto-published post is unacceptable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class GuardrailResult:
    ok: bool
    violations: list[str] = field(default_factory=list)


class GuardrailViolation(Exception):
    """Threaded through generation when content fails the guardrails."""


# ── brand safety ─────────────────────────────────────────────────────────────
# A small, surgical set of strong profanity / slurs a brand post must never
# contain. NOT a tone dragnet (that's the founder's voice setting) — extend
# per-brand via the founder's words_to_avoid, never by bloating this.
_TOXIC = {
    "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "cunt",
    "slut", "whore", "retard", "nigger", "faggot",
}
_WORD = re.compile(r"[a-z']+")

# ── prompt-injection signatures (pre-LLM) ────────────────────────────────────
_INJECTION = [
    re.compile(r"\bignore\s+(all|any|the|your|previous|above|prior)\b.*\b(instruction|prompt|rule)", re.I),
    re.compile(r"\bdisregard\b.*\b(instruction|prompt|rule|above|previous)", re.I),
    re.compile(r"\byou\s+are\s+now\b", re.I),
    re.compile(r"\bact\s+as\b.*\b(system|developer|admin|jailbreak|unfiltered)", re.I),
    re.compile(r"\b(system|developer)\s+prompt\b", re.I),
    re.compile(r"\breveal\b.*\b(prompt|instruction|system)", re.I),
    re.compile(r"</?(system|assistant|user)\s*>", re.I),
    re.compile(r"\bjailbreak\b", re.I),
]

# ── fabricated-specifics signatures (post-gen) ───────────────────────────────
# Currency tokens are word-bounded so "stars 5" can't read as "Rs 5".
_MONEY = re.compile(r"(?:₹|\$|\bRs\.?\s?|\bINR\s?)(\d[\d,]*(?:\.\d+)?)", re.I)
_PERCENT = re.compile(r"\b(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)", re.I)
_MULTIPLE = re.compile(r"\b(\d{1,4})\s?x\b", re.I)  # "10x", "3x" growth claims
_COUPONS = [
    re.compile(r"\b(?:use|apply|with|enter|get)\s+(?:the\s+)?(?:promo\s+|coupon\s+|discount\s+)?code\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{2,})", re.I),
    re.compile(r"\b(?:promo|coupon|discount)\s+code\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{2,})", re.I),
    re.compile(r"\bcode\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9\-]{2,})"),
]


def _nums(s: str) -> set[str]:
    """Bare numeric tokens in a string, comma-normalised (₹1,000 → '1000')."""
    return set(re.findall(r"\d+(?:\.\d+)?", (s or "").replace(",", "")))


def check_content(
    *,
    body: str | None,
    thread: list[str] | None = None,
    first_comment: str | None = None,
    do_not_claim: list[str] | None = None,
    words_to_avoid: list[str] | None = None,
    provided: str = "",
) -> GuardrailResult:
    """Inspect one generated post. ``provided`` is the founder's ground truth
    (profile + approved strategy) — a number/code is only fabricated if it does
    NOT appear there."""
    parts = [body or ""]
    if thread:
        parts.extend(thread)
    if first_comment:
        parts.append(first_comment)
    text = "\n".join(parts)
    low = text.lower()
    violations: list[str] = []

    # 1. brand safety / toxicity (token-exact, so "assassin" ≠ a slur)
    hits = sorted(set(_WORD.findall(low)) & _TOXIC)
    if hits:
        violations.append(f"brand-safety: contains profanity/slur ({', '.join(hits)})")

    # 2. founder's words-to-avoid
    for w in words_to_avoid or []:
        w = (w or "").strip()
        if w and w.lower() in low:
            violations.append(f"words-to-avoid: uses '{w}'")

    # 3. founder's do-not-claim list
    for claim in do_not_claim or []:
        claim = (claim or "").strip()
        if claim and claim.lower() in low:
            violations.append(f"do-not-claim: makes a forbidden claim ('{claim}')")

    # 4. fabricated specifics — a price / statistic / coupon the founder never gave
    provided_nums = _nums(provided)
    provided_low = (provided or "").lower()

    for m in _MONEY.finditer(text):
        if m.group(1).replace(",", "") not in provided_nums:
            violations.append(
                f"fabricated specific: price '{m.group(0).strip()}' is not in the founder's inputs"
            )
    for rx, label in ((_PERCENT, "statistic"), (_MULTIPLE, "claim")):
        for m in rx.finditer(text):
            if m.group(1).replace(",", "") not in provided_nums:
                violations.append(
                    f"fabricated {label}: '{m.group(0).strip()}' is not in the founder's inputs"
                )
    seen_codes: set[str] = set()
    for rx in _COUPONS:
        for m in rx.finditer(text):
            code = m.group(1)
            if code.lower() in seen_codes:
                continue
            seen_codes.add(code.lower())
            if code.lower() not in provided_low:
                violations.append(f"fabricated coupon code: '{code}' is not in the founder's inputs")

    return GuardrailResult(ok=not violations, violations=violations)


def scan_input(text: str) -> list[str]:
    """Pre-LLM filter — return injection / role-override issues in founder
    free-text (empty list = clean)."""
    if not text:
        return []
    issues: list[str] = []
    for rx in _INJECTION:
        m = rx.search(text)
        if m:
            issues.append(f"possible prompt-injection: '{m.group(0).strip()[:60]}'")
    return issues

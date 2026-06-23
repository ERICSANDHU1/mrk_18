"""Meaning-aware intake validation — keeps keyboard-mashing and placeholder text
out of the founder's "company memory" (which every agent then reasons from).

Two layers, run only AFTER structural validation (length/required/enum) already
passed in FounderProfile:

  Layer 1 — heuristic_problems(): deterministic, free, field-aware. Strict on the
    free-text "sentence" fields (target customer, description), lenient on names
    so real brands survive (Zoho, Paytm, Zerodha). Catches single-token mash
    ("vkxvkygv20"), vowel-less / consonant-run gibberish ("ghvckutyvyugciy"),
    and keyboard walks ("asdf").

  Layer 2 — coherence_problems(): one cheap LLM call (the TRIAGE seat) that judges
    whether each answer is a genuine business answer or placeholder/gibberish.
    Catches pseudo-word mash that slips past Layer 1. Degrades to SILENCE on any
    error / missing socket, so onboarding is never blocked by a model outage.
"""

import re

from pydantic import BaseModel

from .llm.socket import AgentRole

_VOWELS = frozenset("aeiou")
_WORD = re.compile(r"[A-Za-z]+")
_KEYBOARD_ROWS = ("qwertyuiop", "asdfghjkl", "zxcvbnm")


def _max_consonant_run(w: str) -> int:
    run = best = 0
    for c in w:
        if c in _VOWELS:
            run = 0
        else:
            run += 1
            best = max(best, run)
    return best


def _implausible(word: str) -> bool:
    """One token that doesn't look like real language. Short tokens (acronyms,
    'b2b', 'to') are never flagged — only words long enough to judge."""
    w = word.lower()
    if len(w) < 4:
        return False
    vowels = sum(c in _VOWELS for c in w)
    if vowels / len(w) < 0.2:  # almost no vowels → not a word
        return True
    return _max_consonant_run(w) >= 5  # e.g. "ghvck..." run of 5+ consonants


def _keyboard_walk(text: str) -> bool:
    t = re.sub(r"[^a-z]", "", text.lower())
    for row in _KEYBOARD_ROWS:
        for i in range(len(row) - 3):
            seg = row[i : i + 4]
            if seg in t or seg[::-1] in t:
                return True
    return False


def _sentence_problem(label: str, text: str) -> str | None:
    """Free-text fields: a real answer is a phrase of real words."""
    words = _WORD.findall(text or "")
    if len(words) < 2:
        return f"{label}: write a real phrase, not a single code-like token"
    if _keyboard_walk(text):
        return f"{label}: looks like random keyboard input — write a real answer"
    longish = [w for w in words if len(w) >= 4]
    if longish and sum(_implausible(w) for w in longish) / len(longish) > 0.5:
        return f"{label}: doesn't read like real words — write a genuine answer"
    return None


def _name_problem(label: str, text: str) -> str | None:
    """Names/brands: lenient — only reject when EVERY word is unpronounceable, so
    real names like Zoho / Paytm / Zerodha pass untouched."""
    words = _WORD.findall(text or "")
    if not words:
        return f"{label}: needs real letters"
    if _keyboard_walk(text):
        return f"{label}: looks like random keyboard input"
    if all(_implausible(w) for w in words) and sum(len(w) for w in words) >= 6:
        return f"{label}: doesn't look like a real name"
    return None


def heuristic_problems(draft: dict) -> list[str]:
    """Layer 1 — deterministic. Returns human-readable problems ([] = clean)."""
    problems: list[str] = []

    icp = draft.get("icp")
    if isinstance(icp, str) and icp.strip():
        if p := _sentence_problem("Target customer", icp):
            problems.append(p)

    desc = draft.get("product_description")
    if isinstance(desc, str) and desc.strip():
        if p := _sentence_problem("Description", desc):
            problems.append(p)

    name = draft.get("company_name")
    if isinstance(name, str) and name.strip():
        if p := _name_problem("Company name", name):
            problems.append(p)

    comps = draft.get("top_competitors")
    if isinstance(comps, list):
        for c in comps:
            if isinstance(c, str) and c.strip():
                if p := _name_problem(f"Competitor '{c.strip()[:24]}'", c):
                    problems.append(p)

    return problems


class _Coherence(BaseModel):
    company_name_genuine: bool
    description_genuine: bool
    target_customer_genuine: bool
    competitors_genuine: bool


_COHERENCE_SYS = (
    "You validate a startup founder's onboarding answers for an AI marketing tool. "
    "For each field decide if it is a GENUINE, meaningful business answer written by a "
    'real person, or placeholder text, random keyboard input (e.g. "asdfgh", '
    '"vkxvkygv", "ghvck"), gibberish, or obviously fake. Real brand names (Indian or '
    "global), transliterated/Hinglish words, abbreviations, and short-but-meaningful "
    "answers are GENUINE. Mark a field false ONLY when it is clearly not real language "
    "or not a real attempt. When unsure, mark it true."
)

_COHERENCE_LABELS = {
    "company_name_genuine": "Company name",
    "description_genuine": "Description (one-liner / USP / problem)",
    "target_customer_genuine": "Target customer",
    "competitors_genuine": "Competitors",
}


async def coherence_problems(socket, draft: dict) -> list[str]:
    """Layer 2 — one cheap LLM coherence call. Returns problems for fields judged
    not genuine. ANY failure (no socket, model/schema error) returns [] — Layer 1
    has already run, so an LLM outage must never hard-block onboarding."""
    if socket is None:
        return []
    fields = {
        "company_name": (draft.get("company_name") or "").strip(),
        "description": (draft.get("product_description") or "").strip(),
        "target_customer": (draft.get("icp") or "").strip(),
        "competitors": ", ".join(
            c for c in (draft.get("top_competitors") or []) if isinstance(c, str)
        ),
    }
    user = "Judge each field:\n" + "\n".join(f"- {k}: {v!r}" for k, v in fields.items())
    try:
        verdict, _usage = await socket.complete(
            AgentRole.TRIAGE, _COHERENCE_SYS, user, _Coherence
        )
    except Exception:  # noqa: BLE001 — degrade to Layer 1 on any model failure
        return []
    return [
        f"{label}: looks like placeholder or random text — please write a real answer"
        for attr, label in _COHERENCE_LABELS.items()
        if getattr(verdict, attr) is False
    ]

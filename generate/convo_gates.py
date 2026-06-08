"""Quality gates for the MRK18 CMO conversational dataset.

The adcopy gate (quality_gates.py) checks a structured-JSON schema; this one
checks free-text chat rows {id, seed, user, assistant}. Two layers:

  PER-ROW (drop the row):
    1. schema      — id/seed/user/assistant present and non-empty
    2. length      — assistant within a sane word window (boundary rows may be short)
    3. placeholder — reject literal "₹X" / "X%" / "N%" un-computed placeholders
    4. promise     — reject guarantee language ("guaranteed", "will 10x", ...)
    5. ai-ism      — reject "As an AI", "I hope this helps", "I cannot", etc.
    6. dedup       — reject >MAX_OVERLAP sentence overlap with an accepted row
                     (the original dataset's failure mode)

  BATCH (audit, not per-row) — the persona v2 quotas:
    - "Do this first:"      < 40% of rows
    - "isn't ... it's ..."  < ~35%
    - "honest/brutally..."  < ~25% (reserve for bluntness-asking seeds)
    - contradiction openers < ~35%
  These are reported; the batch is FLAGGED (not silently passed) if exceeded.

Usage:
  python -m generate.convo_gates data/generated/cmo_1000_raw.jsonl
"""

import json
import re
import sys

MAX_OVERLAP = 0.40
MIN_WORDS, MAX_WORDS = 30, 420   # boundary/yes-no answers can be short; see _is_boundary
MIN_WORDS_BOUNDARY = 8

_SENT_SPLIT = re.compile(r"[.!?]\s+")

# Placeholders are only "lazy" outside quotes — a quoted "'starts at ₹X' anchor"
# is a legitimate price-template reference, so strip quoted spans before checking.
_QUOTED = re.compile(r"'[^']*'|\"[^\"]*\"|‘[^’]*’|“[^”]*”")
_PLACEHOLDER = re.compile(r"₹\s?[XYN]\b|\b[XYN]\s?%(?!\w)")

# Affirmative promise cores. Descriptive ("almost guaranteed") and refusing
# ("anyone who guarantees you a 10x") uses are NOT promises — a negator within
# the preceding window suppresses the flag.
_PROMISE_CORE = re.compile(
    r"\bi (?:guarantee|promise you)\b"
    r"|\bguaranteed to \w+"
    r"|\bguaranteed (?:results|roi|#1|sales|10x|growth)\b"
    r"|\bwe'?ll (?:10x|double|triple)\b"
    r"|\bwill (?:10x|double|triple) your\b"
    r"|\b100%\s+guaranteed\b", re.IGNORECASE)
_NEGATOR = re.compile(
    r"\b(no|not|n'?t|never|nobody|no one|anyone who|nothing|cannot|can'?t|won'?t|don'?t|"
    r"isn'?t|aren'?t)\b", re.IGNORECASE)
_AIISM = re.compile(
    r"\bas an ai\b|\bi hope this helps\b|\bi'?m just an ai\b|"
    r"\bas a language model\b|\bcertainly![\s]|\bgreat question!\b", re.IGNORECASE)


def _has_promise(text):
    for m in _PROMISE_CORE.finditer(text):
        window = text[max(0, m.start() - 30):m.start()]
        if not _NEGATOR.search(window):
            return True
    return False

_DO_FIRST = re.compile(r"\bdo this first\b", re.IGNORECASE)
_ANTITHESIS = re.compile(r"\bisn'?t\b[^.?!]{0,60}\bit'?s\b", re.IGNORECASE)
_HONEST = re.compile(r"\bbrutally honest\b|\bhonest(ly)?\b", re.IGNORECASE)
_REVERSAL_OPENER = re.compile(
    r"^\s*(you think|you'?re probably thinking|everyone tells you|"
    r"that'?s not|it'?s not)\b", re.IGNORECASE)

# Arithmetic linter: verify explicit contribution calcs "A × B% − C = [minus] D".
# Wrong unit-economics math is a credibility killer; the structural gate is blind
# to it, so flag (for repair) rather than silently pass.
_MATH = re.compile(
    r"(?:₹\s?)?([\d,]+)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*%\s*[−\-–]\s*(?:₹\s?)?([\d,]+)\s*=\s*"
    r"(minus\s+|-)?\s*(?:₹\s?)?(-?[\d,]+)", re.IGNORECASE)


def find_math_errors(text):
    out = []
    for m in _MATH.finditer(text):
        A, B, C, minus, D = m.groups()
        try:
            computed = float(A.replace(",", "")) * float(B) / 100 - float(C.replace(",", ""))
            stated = float(D.replace(",", ""))
        except ValueError:
            continue
        if minus and "minus" in minus.lower():
            stated = -abs(stated)
        if abs(computed - stated) > 2:
            out.append({"expr": m.group(0).strip(), "should_be": round(computed)})
    return out


def _sentences(text):
    return {s.strip().lower() for s in _SENT_SPLIT.split(text) if len(s.strip()) > 25}


def _is_boundary(row):
    s = (row.get("seed") or {})
    blob = f"{s.get('topic','')} {s.get('difficulty','')} {s.get('situation','')}".lower()
    return any(t in blob for t in (
        "off-topic", "boundary", "guarantee", "prompt-injection", "yes/no", "refus"))


def check_row(row):
    """Return list of problems (empty = pass)."""
    p = []
    for k in ("id", "seed", "user", "assistant"):
        if not row.get(k):
            p.append(f"missing/empty: {k}")
    if p:
        return p
    a = row["assistant"]
    words = len(a.split())
    floor = MIN_WORDS_BOUNDARY if _is_boundary(row) else MIN_WORDS
    if words < floor:
        p.append(f"too short ({words}w, floor {floor})")
    if words > MAX_WORDS:
        p.append(f"too long ({words}w)")
    if _PLACEHOLDER.search(_QUOTED.sub(" ", a)):
        p.append("uncomputed placeholder (₹X / X%)")
    if _has_promise(a):
        p.append("promise/guarantee language")
    if _AIISM.search(a):
        p.append("AI-ism / generic-assistant phrasing")
    return p


def run_gates(rows):
    passed, accepted_sents = [], []
    report = {"total": len(rows), "failed_schema": 0, "failed_dedup": 0,
              "passed": 0, "examples": {"row": [], "dedup": []}}

    for row in rows:
        problems = check_row(row)
        if problems:
            report["failed_schema"] += 1
            if len(report["examples"]["row"]) < 6:
                report["examples"]["row"].append({"id": row.get("id"), "why": problems})
            continue

        sents = _sentences(row["assistant"])
        worst = 0.0
        for prev in accepted_sents:
            if not sents:
                break
            ov = len(sents & prev) / max(len(sents), 1)
            if ov > worst:
                worst = ov
            if worst > MAX_OVERLAP:
                break
        if worst > MAX_OVERLAP:
            report["failed_dedup"] += 1
            if len(report["examples"]["dedup"]) < 6:
                report["examples"]["dedup"].append({"id": row.get("id"), "overlap": round(worst, 2)})
            continue

        accepted_sents.append(sents)
        passed.append(row)

    # batch-level quota audit on the passed rows
    n = max(len(passed), 1)
    quotas = {
        "do_this_first": sum(bool(_DO_FIRST.search(r["assistant"])) for r in passed) / n,
        "antithesis": sum(bool(_ANTITHESIS.search(r["assistant"])) for r in passed) / n,
        "honest": sum(bool(_HONEST.search(r["assistant"])) for r in passed) / n,
        "reversal_opener": sum(bool(_REVERSAL_OPENER.search(r["assistant"])) for r in passed) / n,
    }
    limits = {"do_this_first": 0.40, "antithesis": 0.35, "honest": 0.25, "reversal_opener": 0.35}
    flags = {k: round(v, 3) for k, v in quotas.items() if v > limits[k]}
    # arithmetic audit (flag for repair, do not drop — preserves row count)
    math_flags = []
    for r in passed:
        errs = find_math_errors(r["assistant"])
        if errs:
            math_flags.append({"id": r.get("id"), "errors": errs})

    report["passed"] = len(passed)
    report["quotas"] = {k: round(v, 3) for k, v in quotas.items()}
    report["quota_flags"] = flags  # empty dict = batch within all quotas
    report["math_flags"] = math_flags  # empty list = all explicit calcs check out
    return passed, report


def main(argv=None):
    argv = argv or sys.argv[1:]
    path = argv[0]
    rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    passed, report = run_gates(rows)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

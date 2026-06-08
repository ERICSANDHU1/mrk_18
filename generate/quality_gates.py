"""Automated quality gates for generated examples.

Run over a list of {input, output} rows; returns the rows that pass plus a
report. Gates:
  1. schema/key check   — output has all required keys, variations has exactly 2
  2. sentence dedup     — reject if >MAX_OVERLAP sentence overlap with an accepted row
  3. no-invented-numbers — flag digit tokens in the output absent from the input
"""

import re

MAX_OVERLAP = 0.40  # reject a row sharing more than this fraction of sentences

_SENT_SPLIT = re.compile(r"[.!?]\s+")
# A bare number token (no trailing punctuation captured): 1,200 / 24 / 3.5
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
# "Claim-like" numbers worth flagging as potential hallucinations: percentages,
# Nx multipliers, and currency amounts. Plain numbers in natural language
# (ages, times, "30 days") are not flagged.
_CLAIM_NUM = re.compile(
    r"(?:₹|rs\.?\s*)\s*\d[\d,]*(?:\.\d+)?"      # ₹150, Rs 1,200
    r"|\d[\d,]*(?:\.\d+)?\s*%"                   # 30%
    r"|\d[\d,]*(?:\.\d+)?\s*x\b"                 # 5x
    r"|\b\d[\d,]*(?:\.\d+)?\s*(?:crore|lakh|million|times faster|x faster)",
    re.IGNORECASE,
)


def _flatten(obj) -> str:
    if isinstance(obj, dict):
        return " ".join(_flatten(v) for v in obj.values())
    if isinstance(obj, list):
        return " ".join(_flatten(v) for v in obj)
    return str(obj)


def _sentences(text: str) -> set[str]:
    return {
        s.strip().lower()
        for s in _SENT_SPLIT.split(text)
        if len(s.strip()) > 20
    }


def check_keys(output: dict, required: list[str]) -> list[str]:
    problems = []
    for k in required:
        if k not in output:
            problems.append(f"missing key: {k}")
    if "variations" in output:
        v = output["variations"]
        if not isinstance(v, list) or len(v) != 2:
            problems.append(f"variations must have exactly 2 items (got {len(v) if isinstance(v, list) else 'non-list'})")
    return problems


def _norm(num: str) -> str:
    return num.replace(",", "").rstrip(".")


def invented_numbers(inp: dict, output: dict) -> list[str]:
    """Flag claim-like numbers (₹/%/Nx) in the output whose value isn't in the input.

    Plain numbers (ages, times, "30 days") are intentionally ignored — only
    fabricated stats, prices, and multipliers are treated as hallucination risks.
    """
    src_vals = {_norm(n) for n in _NUM.findall(_flatten(inp))}
    flagged = []
    for claim in _CLAIM_NUM.findall(_flatten(output)):
        digits = _NUM.search(claim)
        if digits and _norm(digits.group(0)) not in src_vals:
            flagged.append(claim.strip())
    return sorted(set(flagged))


def run_gates(rows: list[dict], required: list[str], reject_numbers: bool = True) -> tuple[list[dict], dict]:
    """rows: [{"input":..., "output":...}]. Returns (passed_rows, report).

    reject_numbers=True drops rows containing claim-like invented numbers
    (fabricated ₹ amounts, %, or Nx multipliers not present in the brief).
    """
    passed = []
    accepted_sentences: list[set[str]] = []
    report = {
        "total": len(rows),
        "failed_keys": 0,
        "failed_dedup": 0,
        "failed_numbers": 0,
        "passed": 0,
        "examples": {"keys": [], "dedup": [], "numbers": []},
    }

    for row in rows:
        out = row.get("output")
        if not isinstance(out, dict):
            report["failed_keys"] += 1
            continue

        key_problems = check_keys(out, required)
        if key_problems:
            report["failed_keys"] += 1
            if len(report["examples"]["keys"]) < 3:
                report["examples"]["keys"].append(key_problems)
            continue

        sents = _sentences(_flatten(out))
        worst = 0.0
        for prev in accepted_sentences:
            if not sents:
                break
            overlap = len(sents & prev) / max(len(sents), 1)
            worst = max(worst, overlap)
            if worst > MAX_OVERLAP:
                break
        if worst > MAX_OVERLAP:
            report["failed_dedup"] += 1
            if len(report["examples"]["dedup"]) < 3:
                report["examples"]["dedup"].append(round(worst, 2))
            continue

        bad_nums = invented_numbers(row["input"], out)
        if bad_nums:
            report["failed_numbers"] += 1
            if len(report["examples"]["numbers"]) < 5:
                report["examples"]["numbers"].append(bad_nums)
            if reject_numbers:
                continue  # drop rows with fabricated claim-numbers

        accepted_sentences.append(sents)
        passed.append(row)

    report["passed"] = len(passed)
    return passed, report

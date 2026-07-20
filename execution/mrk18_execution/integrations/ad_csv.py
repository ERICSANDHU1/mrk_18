"""Ad-export CSV → a compact, pre-computed payload for the audit model.

The founder uploads a raw platform export (Meta / Google / LinkedIn / TikTok).
We parse it SERVER-SIDE (never trust a client-side parse), resolve the columns
platform-agnostically, do ALL arithmetic in code, and aggregate to a handful of
rows before anything reaches the LLM.

Why the math lives here, not in the prompt: models are unreliable at summing
hundreds of rows, and every figure the audit states must be computable from the
upload. Give the model the arithmetic; let it do the judgment.

Two correctness rules this module enforces:
  * Rows are grouped BY CAMPAIGN first (a daily export has one row per campaign
    per day — the unit of analysis is the campaign, not the day).
  * Derived metrics (CTR/CPC/CPM/ROAS/CAC) are recomputed FROM THE SUMS. Never
    average an average — averaging per-day CTRs is a classic, silent error.
"""

import csv
import io
import math
import re
from typing import Any

MAX_BYTES = 10 * 1024 * 1024  # 10MB
MAX_ROWS = 50_000
# Rows sent to the model after aggregation. Campaign-level grouping usually
# lands well under this; the remainder rolls into a single OTHER row.
MAX_MODEL_ROWS = 150


class AdCsvError(ValueError):
    """The upload can't be analysed — message is safe to show the founder."""


# ── column resolution ────────────────────────────────────────────────────────
# Canonical name -> header spellings seen across platform exports. Matched on a
# normalised header (lowercased, punctuation stripped), longest match first so
# "cost per result" never steals "cost".
_SYNONYMS: dict[str, tuple[str, ...]] = {
    "campaign": ("campaign name", "campaign", "campaign id"),
    "adset": ("ad set name", "adset name", "ad group name", "ad group", "ad set"),
    "ad": ("ad name", "ad", "creative name"),
    "spend": ("amount spent", "amount spent inr", "amount spent usd", "spend", "cost", "total spent"),
    "impressions": ("impressions", "impr", "impressions total"),
    "clicks": ("link clicks", "clicks all", "clicks", "link click"),
    "conversions": (
        "purchases", "conversions", "results", "leads", "conv", "total conversions",
        "website purchases",
    ),
    "revenue": (
        "purchase conversion value", "conversion value", "conv value", "revenue",
        "purchases conversion value", "total conversion value",
    ),
    "reach": ("reach",),
    "frequency": ("frequency",),
    "date": ("day", "date", "reporting starts", "date start", "week"),
}

_NUMERIC = {"spend", "impressions", "clicks", "conversions", "revenue", "reach", "frequency"}


def _norm(header: str) -> str:
    """Lowercase, drop currency/punctuation noise: 'Amount spent (INR)' → 'amount spent inr'."""
    h = header.strip().lower()
    h = re.sub(r"[^\w\s]", " ", h)  # brackets, dots, dashes → space
    return re.sub(r"\s+", " ", h).strip()


def resolve_columns(headers: list[str]) -> dict[str, int]:
    """Canonical field -> column index. Absent fields are simply missing, and the
    audit is told which ones were absent rather than guessing at them."""
    normalized = [_norm(h) for h in headers]
    out: dict[str, int] = {}
    for field, spellings in _SYNONYMS.items():
        # exact match first, then prefix — longest spelling wins either way
        for spelling in sorted(spellings, key=len, reverse=True):
            for i, h in enumerate(normalized):
                if h == spelling and i not in out.values():
                    out[field] = i
                    break
            if field in out:
                break
        if field in out:
            continue
        for spelling in sorted(spellings, key=len, reverse=True):
            for i, h in enumerate(normalized):
                if h.startswith(spelling) and i not in out.values():
                    out[field] = i
                    break
            if field in out:
                break
    return out


def detect_platform(headers: list[str]) -> str:
    joined = " ".join(_norm(h) for h in headers)
    if "amount spent" in joined or "ad set name" in joined or "results" in joined:
        return "meta"
    if "ad group" in joined or "conv value" in joined or "impr" in joined:
        return "google"
    if "campaign group" in joined:
        return "linkedin"
    return "unknown"


def detect_currency(headers: list[str]) -> str | None:
    joined = " ".join(_norm(h) for h in headers)
    for code in ("inr", "usd", "eur", "gbp", "aed", "sgd"):
        if re.search(rf"\b{code}\b", joined):
            return code.upper()
    return None


# ── sanitising + numbers ─────────────────────────────────────────────────────

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TEMPLATING = re.compile(r"\{\{.*?\}\}|\{%.*?%\}")


def sanitize(value: str) -> str:
    """Cell values are untrusted. Strip control chars and templating so a crafted
    campaign name can't smuggle structure into the prompt. The text itself still
    reaches the model as DATA — the prompt is what forbids obeying it."""
    v = _CONTROL.sub("", str(value))
    v = _TEMPLATING.sub("", v)
    return v.strip()[:120]


def _num(value: Any) -> float:
    """Parse a metric cell: '₹1,234.50' → 1234.5, '2.5%' → 2.5, junk → 0.0."""
    if value is None:
        return 0.0
    s = re.sub(r"[^\d.\-]", "", str(value))
    if not s or s in {"-", ".", "-."}:
        return 0.0
    try:
        f = float(s)
    except ValueError:
        return 0.0
    return 0.0 if math.isnan(f) or math.isinf(f) else f


# ── parse → group → aggregate ────────────────────────────────────────────────


def parse_csv(text: str) -> tuple[list[str], list[list[str]]]:
    if len(text.encode("utf-8", "ignore")) > MAX_BYTES:
        raise AdCsvError("that file is over 10MB — export a smaller date range")
    reader = csv.reader(io.StringIO(text))
    try:
        rows = [r for r in reader if any(c.strip() for c in r)]
    except csv.Error as exc:
        raise AdCsvError("we couldn't read that CSV — re-export it and try again") from exc
    if not rows:
        raise AdCsvError("that file looks empty")
    headers, body = rows[0], rows[1:]
    if len(body) > MAX_ROWS:
        raise AdCsvError("that export has too many rows — narrow the date range")
    if not body:
        raise AdCsvError("that file has headers but no rows")
    return [sanitize(h) for h in headers], body


def to_records(headers: list[str], rows: list[list[str]], cols: dict[str, int]) -> list[dict]:
    """Rows → typed dicts, grouped BY CAMPAIGN (summing metrics) when a campaign
    column exists — a daily export otherwise looks like hundreds of tiny rows."""
    key_col = cols.get("campaign", cols.get("adset", cols.get("ad")))
    grouped: dict[str, dict] = {}
    for row in rows:
        name = sanitize(row[key_col]) if key_col is not None and key_col < len(row) else "(unnamed)"
        name = name or "(unnamed)"
        rec = grouped.setdefault(name, {"name": name, "rows": 0})
        rec["rows"] += 1
        for field in _NUMERIC:
            idx = cols.get(field)
            if idx is not None and idx < len(row):
                rec[field] = rec.get(field, 0.0) + _num(row[idx])
    return list(grouped.values())


def _derive(rec: dict) -> dict:
    """Derived metrics recomputed from the SUMS — never averaged from per-row values."""
    spend = rec.get("spend", 0.0)
    impr = rec.get("impressions", 0.0)
    clicks = rec.get("clicks", 0.0)
    conv = rec.get("conversions", 0.0)
    rev = rec.get("revenue", 0.0)
    out = dict(rec)
    out["ctr_pct"] = round(clicks / impr * 100, 2) if impr else None
    out["cpc"] = round(spend / clicks, 2) if clicks else None
    out["cpm"] = round(spend / impr * 1000, 2) if impr else None
    out["cac"] = round(spend / conv, 2) if conv else None
    out["roas"] = round(rev / spend, 2) if spend and rev else None
    return out


def aggregate(records: list[dict], limit: int = MAX_MODEL_ROWS) -> list[dict]:
    """Top campaigns by spend, plus any big converters the spend cut missed;
    everything else rolls into one OTHER row so totals still reconcile."""
    ranked = sorted(records, key=lambda r: r.get("spend", 0.0), reverse=True)
    keep = ranked[:limit]
    rest = ranked[limit:]
    if rest:
        # don't lose a small-spend/high-conversion winner in the tail
        extra = sorted(rest, key=lambda r: r.get("conversions", 0.0), reverse=True)[:20]
        extra = [r for r in extra if r.get("conversions", 0.0) > 0]
        keep += extra
        rest = [r for r in rest if r not in extra]
    if rest:
        other = {"name": f"OTHER (n={len(rest)})", "rows": sum(r.get("rows", 0) for r in rest)}
        for field in _NUMERIC:
            total = sum(r.get(field, 0.0) for r in rest)
            if total:
                other[field] = round(total, 2)
        keep.append(other)
    return [_derive(r) for r in keep]


def precompute(records: list[dict], currency: str | None) -> dict:
    """Account-level totals — the arithmetic the model must never do itself."""
    tot = {f: sum(r.get(f, 0.0) for r in records) for f in _NUMERIC}
    spend, conv, rev = tot["spend"], tot["conversions"], tot["revenue"]

    # The concentration headline is "what share of spend sits in the WORST-
    # PERFORMING half" — ranked by cost-per-conversion, NOT by lowest spend.
    # Ranking by spend inverts the story: it flags the cheap winners instead of
    # the expensive failures. A campaign that spent money and converted nothing
    # is the worst of all (infinite CAC).
    def _badness(r: dict) -> float:
        c, s = r.get("conversions", 0.0), r.get("spend", 0.0)
        if c > 0:
            return s / c
        return math.inf if s > 0 else -1.0  # spent-and-never-converted ranks worst

    worst: list[dict] = []
    worst_spend = worst_conv = 0.0
    if conv > 0 or any(r.get("spend", 0.0) > 0 for r in records):
        by_bad = sorted(records, key=_badness, reverse=True)
        worst = by_bad[: max(1, len(by_bad) // 2)]
        worst_spend = sum(r.get("spend", 0.0) for r in worst)
        worst_conv = sum(r.get("conversions", 0.0) for r in worst)
    return {
        "currency": currency,
        "campaigns": len(records),
        "total_spend": round(spend, 2),
        "total_impressions": int(tot["impressions"]),
        "total_clicks": int(tot["clicks"]),
        "total_conversions": round(conv, 2),
        "total_revenue": round(rev, 2) if rev else None,
        "blended_cac": round(spend / conv, 2) if conv else None,
        "blended_roas": round(rev / spend, 2) if spend and rev else None,
        "blended_ctr_pct": round(tot["clicks"] / tot["impressions"] * 100, 2)
        if tot["impressions"]
        else None,
        "blended_cpm": round(spend / tot["impressions"] * 1000, 2) if tot["impressions"] else None,
        # the concentration headline, computed not guessed. "worst-performing"
        # = highest cost-per-conversion, so these are the campaigns actually
        # burning money — name the count so the model states it accurately.
        "worst_performing_count": len(worst),
        "worst_performing_names": [r.get("name") for r in worst][:10],
        "worst_performing_spend": round(worst_spend, 2),
        "worst_performing_spend_pct": round(worst_spend / spend * 100, 1) if spend else None,
        "worst_performing_conversions": round(worst_conv, 2),
        "worst_performing_conversion_pct": round(worst_conv / conv * 100, 1) if conv else None,
    }


def build_payload(text: str, brand_context: str | None = None) -> dict:
    """Raw CSV text → the exact object the audit prompt expects."""
    headers, rows = parse_csv(text)
    cols = resolve_columns(headers)
    if "spend" not in cols:
        raise AdCsvError(
            "we couldn't find a spend/cost column — export with 'Amount spent' included"
        )
    records = to_records(headers, rows, cols)
    if not records:
        raise AdCsvError("no usable rows in that export")
    currency = detect_currency(headers)

    # The date span turns "48 conversions" into "3.4/day" — the number the
    # learning-phase diagnosis depends on. Absent date column = absent span.
    date_idx = cols.get("date")
    dates = sorted(
        {sanitize(r[date_idx]) for r in rows if date_idx is not None and date_idx < len(r)}
        - {""}
    ) if date_idx is not None else []
    aggregated = aggregate(records)
    missing = [f for f in ("impressions", "clicks", "conversions", "revenue") if f not in cols]
    return {
        "detected_platform": detect_platform(headers),
        "currency": currency,
        "date_range": {"from": dates[0], "to": dates[-1], "days": len(dates)} if dates else None,
        "row_count_total": len(rows),
        "campaigns_analyzed": len(records),
        "missing_columns": missing,
        "precomputed": precompute(records, currency),
        "campaigns": aggregated,
        "brand_context": (brand_context or "").strip()[:400] or None,
    }

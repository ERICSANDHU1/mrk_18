"""Meta (Facebook) Marketing API connector — read-only ad-data ingestion.

This isolates everything Meta-specific so the generic OAuth flow stays generic:

  * Meta hands back a SHORT-lived token and (unlike standard OAuth2) has no
    rotating refresh token — you swap short → long-lived (~60 days) instead.
  * The connection must be pinned to a specific ad account (act_<id>), so right
    after connect we read the user's ad accounts and store the primary one.
  * The Ads Insights edge returns spend/impressions/clicks/ctr/cpc/roas/actions;
    we reshape those rows into the EXACT metrics dict the analytics adapter
    already understands (total_spend + currency + campaigns[]), then feed the
    existing diagnose path with source="meta". Nothing downstream changes.

Security posture: access tokens NEVER travel in a URL — the code exchange and
long-lived swap POST the token in the body; reads send it as an Authorization:
Bearer header. Paging walks Meta's `after` cursor against our own base URL rather
than blindly following the `next` URL Meta returns (no token in URL, no SSRF on
a tampered host). Upstream error bodies are logged (scrubbed) but never reflected
to the client. All network calls accept an optional httpx transport for tests.
"""

import logging
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.analytics import diagnose_metrics
from ..config import get_settings
from ..db.models import AnalyticsDiagnosisRow, ConnectedAccountRow
from ..security.oauth import ProviderConfig

log = logging.getLogger("mrk18.meta_ads")

PLATFORM = "meta"
LONG_LIVED_TTL_SECONDS = 5_184_000  # ~60 days — Meta's long-lived token lifetime

# Single window for the pull: lifetime ("maximum"), so the founder's full ad
# history (including older spend) is captured. Narrower windows can come later.
_PULL_PERIOD: tuple[str, str] = ("all time", "maximum")

# Insights fields we pull (read-only). roas/conversions arrive NESTED in the
# purchase_roas / actions arrays — reshape_insights flattens them.
_INSIGHT_FIELDS = (
    "campaign_name,account_currency,spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas"
)

# action_type values that count as a conversion (purchases + leads, web/app).
_CONVERSION_ACTIONS = frozenset({
    "purchase",
    "onsite_web_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
})


class MetaError(Exception):
    """Any failure talking to the Meta Graph/Marketing API."""


def _graph_base() -> str:
    return f"https://graph.facebook.com/{get_settings().meta_api_version}"


def _to_float(v) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _sum_actions(actions, wanted: frozenset[str]) -> float:
    total = 0.0
    for a in actions or []:
        if a.get("action_type") in wanted:
            try:
                total += float(a.get("value", 0))
            except (TypeError, ValueError):
                continue
    return total


# ── OAuth finalize (called from the connections callback) ───────────────────


async def exchange_for_long_lived(
    provider: ProviderConfig, short_token: str, transport: httpx.AsyncBaseTransport | None = None
) -> dict:
    """Swap the ~1-2h token for a ~60-day long-lived one. POSTs the token in the
    body so it never lands in a URL/access log."""
    async with httpx.AsyncClient(timeout=30, transport=transport) as client:
        resp = await client.post(
            provider.token_url,
            data={
                "grant_type": "fb_exchange_token",
                "client_id": provider.client_id,
                "client_secret": provider.client_secret,
                "fb_exchange_token": short_token,
            },
            headers={"Accept": "application/json"},
        )
    if resp.status_code != 200:
        log.warning("meta long-lived exchange failed: HTTP %s %s", resp.status_code, resp.text[:200])
        raise MetaError("Meta long-lived token exchange failed")
    data = resp.json()
    if not data.get("access_token"):
        raise MetaError("Meta long-lived exchange response missing access_token")
    return data


async def fetch_primary_ad_account(
    access_token: str, transport: httpx.AsyncBaseTransport | None = None
) -> str | None:
    """Return the founder's primary ad account id (act_<id>), preferring an
    ACTIVE account. None if they have no ad accounts. Token in the Bearer header."""
    async with httpx.AsyncClient(timeout=30, transport=transport) as client:
        resp = await client.get(
            f"{_graph_base()}/me/adaccounts",
            params={"fields": "account_id,name,currency,account_status", "limit": 50},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        log.warning("meta ad-account lookup failed: HTTP %s %s", resp.status_code, resp.text[:200])
        raise MetaError("Meta ad-account lookup failed")
    accounts = resp.json().get("data", [])
    if not accounts:
        return None
    active = [a for a in accounts if a.get("account_status") == 1]
    chosen = (active or accounts)[0]
    return chosen.get("id")  # already in "act_<id>" form


async def finalize_oauth(
    provider: ProviderConfig, short_token: str, transport: httpx.AsyncBaseTransport | None = None
) -> dict:
    """Turn a fresh short-lived token into what store_tokens wants: a long-lived
    token, its expiry (defaulted to ~60d if Meta omits it, so the reconnect nudge
    still fires), and the linked ad account (external_ref)."""
    longd = await exchange_for_long_lived(provider, short_token, transport=transport)
    long_token = longd["access_token"]
    external_ref = await fetch_primary_ad_account(long_token, transport=transport)
    return {
        "access_token": long_token,
        "expires_in": longd.get("expires_in") or LONG_LIVED_TTL_SECONDS,
        "external_ref": external_ref,
    }


# ── Insights fetch + reshape ────────────────────────────────────────────────


async def fetch_insights(
    access_token: str,
    ad_account_id: str,
    *,
    date_preset: str = "maximum",
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict]:
    """Per-campaign insights for the account over `date_preset`. Token rides the
    Bearer header; paging walks the `after` cursor against our own base URL (we
    never follow Meta's raw `next` URL — keeps the token out of URLs and avoids
    trusting an arbitrary host)."""
    rows: list[dict] = []
    base_url = f"{_graph_base()}/{ad_account_id}/insights"
    base_params = {
        "fields": _INSIGHT_FIELDS,
        "level": "campaign",
        "date_preset": date_preset,
        "limit": 500,
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    after: str | None = None
    async with httpx.AsyncClient(timeout=60, transport=transport) as client:
        while True:
            params = dict(base_params)
            if after:
                params["after"] = after
            resp = await client.get(base_url, params=params, headers=headers)
            if resp.status_code != 200:
                log.warning("meta insights fetch failed: HTTP %s %s", resp.status_code, resp.text[:200])
                raise MetaError("Meta insights fetch failed")
            data = resp.json()
            rows.extend(data.get("data", []))
            paging = data.get("paging") or {}
            after = (paging.get("cursors") or {}).get("after")
            if not paging.get("next") or not after:
                break
    return rows


def reshape_insights(rows: list[dict]) -> dict:
    """Meta insights rows → the metrics dict the analytics adapter expects:
    {total_spend, currency, campaigns:[{name, spend, ctr, cpc, roas, conversions}]}."""
    campaigns: list[dict] = []
    total_spend = 0.0
    currency: str | None = None
    for r in rows:
        if currency is None:
            currency = r.get("account_currency")
        spend = _to_float(r.get("spend")) or 0.0
        total_spend += spend
        roas = None
        pr = r.get("purchase_roas")
        if isinstance(pr, list) and pr:
            roas = _to_float(pr[0].get("value"))
        conversions = _sum_actions(r.get("actions"), _CONVERSION_ACTIONS)
        campaigns.append({
            "name": r.get("campaign_name") or "(unnamed)",
            "spend": round(spend, 2),
            "ctr": _to_float(r.get("ctr")),
            "cpc": _to_float(r.get("cpc")),
            "roas": round(roas, 2) if roas is not None else None,
            "conversions": int(conversions),
        })
    return {"total_spend": round(total_spend, 2), "currency": currency, "campaigns": campaigns}


# ── Pull (no analysis) + Analyze (the approval gate's action) ───────────────


async def pull_founder(
    session: AsyncSession,
    vault,
    founder_id: UUID,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict:
    """Pull the founder's Meta ad data and store it as a PENDING snapshot
    (metrics set, diagnosis NULL). Runs NO analysis — the founder reviews the
    numbers and approves before the CMO diagnoses them.

    Returns a summary of what was pulled. Raises LookupError if Meta isn't
    connected, ValueError if no ad account is linked."""
    account = (
        await session.execute(
            select(ConnectedAccountRow).where(
                ConnectedAccountRow.founder_id == founder_id,
                ConnectedAccountRow.platform == PLATFORM,
            )
        )
    ).scalar_one_or_none()
    if account is None or account.status != "connected":
        raise LookupError("no connected Meta account for this founder")
    if not account.external_ref:
        raise ValueError("Meta connection has no ad account linked")

    token = await vault.get_access_token(session, founder_id, PLATFORM)
    label, preset = _PULL_PERIOD
    rows = await fetch_insights(token, account.external_ref, date_preset=preset, transport=transport)
    metrics = reshape_insights(rows)
    if not metrics["campaigns"]:
        log.info("meta pull for %s found no campaign data", founder_id)
        return {"diagnosis_id": None, "period": label, "campaigns": 0, "spend": 0.0}

    row = AnalyticsDiagnosisRow(
        founder_id=founder_id,
        source=PLATFORM,
        period=label,
        metrics=metrics,
        diagnosis=None,  # PENDING — the founder approves before analysis runs
    )
    session.add(row)
    await session.commit()
    log.info("meta pull for %s: %d campaigns stored (pending analysis)", founder_id, len(metrics["campaigns"]))
    return {
        "diagnosis_id": str(row.diagnosis_id),
        "period": label,
        "campaigns": len(metrics["campaigns"]),
        "spend": metrics["total_spend"],
        "currency": metrics.get("currency"),
    }


async def analyze_pending(session: AsyncSession, socket, founder_id: UUID) -> dict:
    """The approval gate's action: run the CMO diagnosis on the latest PENDING
    Meta snapshot (metrics present, diagnosis NULL) and fill the diagnosis in
    place. Reuses the SAME diagnose path the manual/CSV flow uses. Raises
    LookupError if there's nothing pending to analyze."""
    row = (
        await session.execute(
            select(AnalyticsDiagnosisRow)
            .where(
                AnalyticsDiagnosisRow.founder_id == founder_id,
                AnalyticsDiagnosisRow.source == PLATFORM,
                AnalyticsDiagnosisRow.diagnosis.is_(None),
            )
            .order_by(AnalyticsDiagnosisRow.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    if row is None:
        raise LookupError("no pending Meta ad data to analyze")
    diag, _usage = await diagnose_metrics(socket, row.metrics)
    row.diagnosis = diag.model_dump(mode="json")
    await session.commit()
    log.info("meta analysis approved + run for %s (%s)", founder_id, row.diagnosis_id)
    return {"diagnosis_id": str(row.diagnosis_id), "diagnosis": row.diagnosis}

"""Diagnose 'connected but no data pulled' for Meta. READ-ONLY (no DB writes).

Finds the meta connection, lists ALL ad accounts on the token (with spend), then
fetches insights for the linked account and prints what comes back — so we can
see whether the right ad account was picked and whether it actually has data.

    cd execution
    .venv\\Scripts\\python.exe scripts\\meta_probe.py
"""

import asyncio
import json
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8")

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import (  # noqa: E402
    AnalyticsDiagnosisRow,
    ConnectedAccountRow,
    FounderRow,
)
from mrk18_execution.integrations import meta_ads  # noqa: E402
from mrk18_execution.security.vault import TokenVault  # noqa: E402


async def main() -> None:
    s = get_settings()
    eng = build_engine(s.database_url)
    factory = build_session_factory(eng)
    vault = TokenVault(s.token_vault_key)

    async with factory() as session:
        accts = (
            await session.execute(
                select(ConnectedAccountRow).where(ConnectedAccountRow.platform == "meta")
            )
        ).scalars().all()
        print(f"=== meta connections: {len(accts)} ===")
        if not accts:
            print("  NONE — the connection was never stored. (callback/finalize failed)")
            await eng.dispose()
            return

        for a in accts:
            f = await session.get(FounderRow, a.founder_id)
            print(f"\n founder: {f.email if f else a.founder_id}")
            print(f"   status={a.status}  external_ref(ad acct)={a.external_ref!r}  has_token={bool(a.token_ciphertext)}")
            print(f"   scopes={a.scopes}  token_expires_at={a.token_expires_at}")

            if a.status != "connected" or not a.token_ciphertext:
                print("   -> no usable token; skipping insights probe")
                continue

            token = vault.open(a.wrapped_dek, a.token_ciphertext)

            # list ALL ad accounts on this token, with lifetime spend
            ver = s.meta_api_version
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(
                    f"https://graph.facebook.com/{ver}/me/adaccounts",
                    params={"fields": "account_id,name,currency,account_status,amount_spent", "limit": 50},
                    headers={"Authorization": f"Bearer {token}"},
                )
            print(f"\n   me/adaccounts -> HTTP {r.status_code}")
            if r.status_code == 200:
                for ad in r.json().get("data", []):
                    spent = ad.get("amount_spent")
                    print(f"     • {ad.get('id')}  '{ad.get('name')}'  {ad.get('currency')}  status={ad.get('account_status')}  amount_spent={spent}")
            else:
                print("     body:", r.text[:300])

            # Business-Manager ad accounts — personal me/adaccounts MISSES these,
            # and that's the usual home of real ad spend.
            async with httpx.AsyncClient(timeout=30) as client:
                rb = await client.get(
                    f"https://graph.facebook.com/{ver}/me/businesses",
                    params={"fields": "id,name", "limit": 50},
                    headers={"Authorization": f"Bearer {token}"},
                )
            print(f"\n   me/businesses -> HTTP {rb.status_code}")
            if rb.status_code == 200:
                bizes = rb.json().get("data", [])
                if not bizes:
                    print("     (no business managers on this account)")
                for b in bizes:
                    print(f"     business: {b.get('id')} '{b.get('name')}'")
                    for edge in ("owned_ad_accounts", "client_ad_accounts"):
                        async with httpx.AsyncClient(timeout=30) as client:
                            ra = await client.get(
                                f"https://graph.facebook.com/{ver}/{b['id']}/{edge}",
                                params={"fields": "account_id,name,currency,amount_spent,account_status", "limit": 50},
                                headers={"Authorization": f"Bearer {token}"},
                            )
                        if ra.status_code == 200:
                            for ad in ra.json().get("data", []):
                                print(f"       [{edge}] act_{ad.get('account_id')} '{ad.get('name')}' {ad.get('currency')} spent={ad.get('amount_spent')} status={ad.get('account_status')}")
                        else:
                            print(f"       [{edge}] HTTP {ra.status_code}: {ra.text[:140]}")
            else:
                print("     body:", rb.text[:200])

            # fetch insights for the LINKED account
            if a.external_ref:
                try:
                    rows = await meta_ads.fetch_insights(token, a.external_ref, date_preset="maximum")
                    metrics = meta_ads.reshape_insights(rows)
                    print(f"\n   insights for {a.external_ref}: rows={len(rows)} campaigns={len(metrics['campaigns'])} spend={metrics['total_spend']} ccy={metrics.get('currency')}")
                    if metrics["campaigns"]:
                        print("   sample:", json.dumps(metrics["campaigns"][:3], indent=1)[:600])
                except Exception as exc:  # noqa: BLE001
                    print(f"   insights FETCH FAILED: {exc!r}")

        # existing stored diagnoses
        diags = (
            await session.execute(
                select(AnalyticsDiagnosisRow).order_by(AnalyticsDiagnosisRow.created_at.desc()).limit(10)
            )
        ).scalars().all()
        print(f"\n=== analytics_diagnoses rows: {len(diags)} ===")
        for d in diags:
            m = d.metrics or {}
            print(f"   source={d.source} period={d.period!r} pending={d.diagnosis is None} campaigns={len(m.get('campaigns', []))} spend={m.get('total_spend')} at={d.created_at}")

    await eng.dispose()


asyncio.run(main())

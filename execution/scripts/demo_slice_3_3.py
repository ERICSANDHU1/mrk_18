"""Slice 3.3 demo — try to leak knowledge across founders, and fail.

Run it yourself:

    cd execution
    .\\.venv\\Scripts\\python.exe scripts\\demo_slice_3_3.py

What it stages: two founders with very different businesses feed their
Company Brains. Then founder A attacks: searches for B's specialty, calls
B's knowledge endpoints directly, tries with no token at all. Every attempt
is shown raw — status codes, responses, and the audit evidence left behind.
No network, no config: in-memory DB, stub embeddings, real auth code path.
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # execution/ root

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from mrk18_execution.api.app import create_app  # noqa: E402
from mrk18_execution.db.models import AuditRow, Base  # noqa: E402
from mrk18_execution.llm.embeddings import StubEmbeddingEngine  # noqa: E402
from tests.authtools import bearer, install_auth, mint  # noqa: E402

CHAI_DOC = (
    "Chai Robotics sells robotic chai vending machines to Indian tech parks. "
    "Pricing: 30000 INR monthly rental including maintenance and masala chai pods. "
    "Best customers are facility managers at 200-seat offices in Bengaluru and Pune."
)
FINTECH_DOC = (
    "PayWave processes UPI settlements for kirana stores. Compliance follows "
    "RBI guidelines on payment aggregators. Revenue model is 0.4 percent per settlement. "
    "Expansion plan: onboard 500 kirana stores in Jaipur by Q3."
)


def banner(text: str) -> None:
    print(f"\n{'─' * 72}\n{text}\n{'─' * 72}")


async def main() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app = create_app(engine=engine)
    install_auth(app)
    app.state.embedding_engine = StubEmbeddingEngine()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://demo") as client:
        banner("SETUP — two founders, two very different businesses")
        sub_a, sub_b = uuid4(), uuid4()
        headers_a, headers_b = bearer(mint(sub_a, email="aarav@chai.in")), bearer(
            mint(sub_b, email="binita@paywave.in")
        )
        fid_a = (await client.post("/founders", json={}, headers=headers_a)).json()["founder_id"]
        fid_b = (await client.post("/founders", json={}, headers=headers_b)).json()["founder_id"]
        print(f"founder A (chai robots):   {fid_a}")
        print(f"founder B (UPI fintech):   {fid_b}")

        r = await client.post(
            f"/founders/{fid_a}/knowledge",
            json={"source": "doc:pitch", "text": CHAI_DOC},
            headers=headers_a,
        )
        print(f"A ingests their pitch  → {r.status_code} {r.json()}")
        r = await client.post(
            f"/founders/{fid_b}/knowledge",
            json={"source": "doc:strategy", "text": FINTECH_DOC},
            headers=headers_b,
        )
        print(f"B ingests their strategy → {r.status_code} {r.json()}")

        banner("ATTACK 1 — A searches their OWN brain for B's specialty")
        print('A asks: "RBI compliance UPI settlements kirana"')
        r = await client.post(
            f"/founders/{fid_a}/knowledge/search",
            json={"query": "RBI compliance UPI settlements kirana"},
            headers=headers_a,
        )
        hits = r.json()
        for hit in hits:
            print(f"  [{hit['source']}] score={hit['score']}: {hit['content'][:80]}…")
        leaked = any("PayWave" in h["content"] or "kirana" in h["content"] for h in hits)
        print(f"\n  B's content in A's results? {'💥 LEAKED' if leaked else '✅ NO — only A’s own chunks'}")

        banner("ATTACK 2 — A calls B's knowledge endpoints DIRECTLY (the URL-typing attack)")
        for label, req in {
            "read B's sources    ": client.get(f"/founders/{fid_b}/knowledge", headers=headers_a),
            "search B's brain    ": client.post(
                f"/founders/{fid_b}/knowledge/search",
                json={"query": "expansion plan"},
                headers=headers_a,
            ),
            "poison B's brain    ": client.post(
                f"/founders/{fid_b}/knowledge",
                json={"source": "doc:fake", "text": "PayWave is shutting down."},
                headers=headers_a,
            ),
        }.items():
            resp = await req
            verdict = "✅ blocked" if resp.status_code == 403 else f"💥 {resp.status_code}"
            print(f"  {label} → HTTP {resp.status_code}  {verdict}")

        banner("ATTACK 3 — no badge at all")
        resp = await client.get(f"/founders/{fid_b}/knowledge")
        print(f"  anonymous read of B   → HTTP {resp.status_code}  "
              f"{'✅ blocked' if resp.status_code == 401 else '💥'}")

        banner("THE EVIDENCE — every attempt left a security_alert in the audit chain")
        async with engine.connect() as conn:
            rows = (
                await conn.execute(
                    select(AuditRow.outcome, AuditRow.detail).where(
                        AuditRow.event_type == "security_alert"
                    )
                )
            ).all()
        for outcome, detail in rows:
            print(f"  {outcome}: {detail}")
        print(f"\n  {len(rows)} alarm(s) recorded — attempts are evidence, not secrets.")

        banner("VERDICT")
        ok = not leaked and len(rows) >= 3
        print("  ✅ THE WALL HOLDS — B's knowledge cannot reach A, by query or by URL."
              if ok else "  💥 SOMETHING IS WRONG — investigate before anything else.")


if __name__ == "__main__":
    asyncio.run(main())

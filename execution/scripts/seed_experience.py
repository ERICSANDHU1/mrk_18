"""Seed the shared Experience Brain from case-study JSON files.

Put one case per file in  execution/experience_seed/cases/*.json  (and/or a
single  experience_seed/cases.jsonl ). Then, from execution/ with the venv:

    python scripts/seed_experience.py

Re-running REPLACES cases by their `ref` (idempotent — safe to run repeatedly).
Requires Cloudflare creds (CF_ACCOUNT_ID + CF_API_TOKEN) for real BGE-M3 embeddings.
"""

import asyncio
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.llm.embeddings import CloudflareEmbeddingEngine  # noqa: E402
from mrk18_execution.rag.experience import experience_size, ingest_case  # noqa: E402

SEED_DIR = Path(__file__).resolve().parent.parent / "experience_seed"


def load_cases() -> list[dict]:
    cases: list[dict] = []
    cases_dir = SEED_DIR / "cases"
    if cases_dir.is_dir():
        for f in sorted(cases_dir.glob("*.json")):
            cases.append(json.loads(f.read_text(encoding="utf-8")))
    jsonl = SEED_DIR / "cases.jsonl"
    if jsonl.exists():
        for line in jsonl.read_text(encoding="utf-8").splitlines():
            if line.strip():
                cases.append(json.loads(line))
    return cases


async def main() -> None:
    s = get_settings()
    if not (s.cf_account_id and s.cf_api_token):
        sys.exit("Set CF_ACCOUNT_ID + CF_API_TOKEN in .env — needed to embed (BGE-M3).")
    engine = CloudflareEmbeddingEngine(s.cf_account_id, s.cf_api_token)

    cases = load_cases()
    if not cases:
        sys.exit(f"No cases found under {SEED_DIR / 'cases'}/. Add JSON files first.")

    eng = build_engine(s.database_url)
    sf = build_session_factory(eng)
    async with sf() as session:
        for case in cases:
            res = await ingest_case(session, case=case, engine=engine)
            print(f"  ingested {res['ref']}: {res['title']}")
        await session.commit()
        total = await experience_size(session)
    await eng.dispose()
    print(f"\nDone. {len(cases)} case(s) seeded. Experience Brain holds {total} chunk(s).")


asyncio.run(main())

"""Slice 2.1 live demo — the token vault on the REAL database.

1. Connect a (simulated) LinkedIn account for the demo founder — the token
   goes through the real envelope encryption into real Supabase.
2. Show what the DATABASE actually holds: gibberish, twice encrypted.
3. Prove the app can still decrypt it (the only legitimate path out).
4. Plant a pending publish task, then REVOKE: ciphertexts destroyed +
   pending work cancelled, timed against the 60-second rule.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
load_dotenv()

from sqlalchemy import select  # noqa: E402

from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.db.engine import build_engine, build_session_factory  # noqa: E402
from mrk18_execution.db.models import (  # noqa: E402
    ConnectedAccountRow,
    ContentItemRow,
    FounderRow,
    PublishResultRow,
    RunRow,
)
from mrk18_execution.security.vault import TokenVault, VaultError, revoke_account  # noqa: E402

DEMO_EMAIL = "demo@mrk18.ai"
FAKE_TOKEN = "AQX-simulated-linkedin-access-token-7f3k9d2m"


async def main() -> None:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    factory = build_session_factory(engine)
    vault = TokenVault(settings.token_vault_key)

    try:
        async with factory() as session:
            founder = (
                await session.execute(select(FounderRow).where(FounderRow.email == DEMO_EMAIL))
            ).scalar_one()
            fid = founder.id

            print("=" * 64)
            print("STEP 1 - storing a (simulated) LinkedIn token in the vault")
            print(f"  plaintext going in : {FAKE_TOKEN}")
            await vault.store_tokens(
                session,
                founder_id=fid,
                platform="linkedin",
                access_token=FAKE_TOKEN,
                expires_at=datetime.now(timezone.utc) + timedelta(days=60),
                scopes=["w_member_social", "openid", "profile"],
                external_ref="urn:li:person:demo",
            )
            await session.commit()

        print("\nSTEP 2 - what the DATABASE actually holds now:")
        async with factory() as session:
            acct = (
                await session.execute(
                    select(ConnectedAccountRow).where(
                        ConnectedAccountRow.founder_id == fid,
                        ConnectedAccountRow.platform == "linkedin",
                    )
                )
            ).scalar_one()
        print(f"  token_ciphertext : {acct.token_ciphertext[:70]}...")
        print(f"  wrapped_dek      : {acct.wrapped_dek[:70]}...")
        print(f"  plaintext visible in DB? {'YES - BUG!' if FAKE_TOKEN in (acct.token_ciphertext or '') else 'NO'}")

        print("\nSTEP 3 - the app (and only the app, holding the master key) decrypts:")
        async with factory() as session:
            token = await vault.get_access_token(session, fid, "linkedin")
        print(f"  decrypted: {token}")
        print(f"  matches original: {token == FAKE_TOKEN}")

        print("\nSTEP 4 - plant a pending publish task, then REVOKE")
        async with factory() as session:
            run = RunRow(run_id=uuid4(), founder_id=fid, thread_id=str(uuid4()), status="done")
            item = ContentItemRow(
                item_id=uuid4(),
                run_id=run.run_id,
                founder_id=fid,
                platform="linkedin",
                format="linkedin_post",
                body="(demo pending post)",
                status="approved",
            )
            pending = PublishResultRow(
                request_id=f"{item.item_id}:linkedin_api",
                item_id=item.item_id,
                run_id=run.run_id,
                founder_id=fid,
                platform="linkedin",
                adapter="linkedin_api",
                status="retryable",
            )
            session.add(run)
            await session.flush()  # FK order: run before item before result
            session.add(item)
            await session.flush()
            session.add(pending)
            await session.commit()
            pending_id = pending.result_id

        result = await revoke_account(factory, fid, "linkedin")
        print(f"  revoked in {result['seconds']:.2f}s (rule: < 60s)")
        print(f"  pending actions cancelled: {result['pending_cancelled']}")

        async with factory() as session:
            acct = (
                await session.execute(
                    select(ConnectedAccountRow).where(
                        ConnectedAccountRow.founder_id == fid,
                        ConnectedAccountRow.platform == "linkedin",
                    )
                )
            ).scalar_one()
            cancelled = await session.get(PublishResultRow, pending_id)
        print(f"  ciphertext after revoke: {acct.token_ciphertext}  (destroyed)")
        print(f"  pending task status    : {cancelled.status} ({cancelled.error})")

        print("\nSTEP 5 - vault now refuses to produce a token:")
        async with factory() as session:
            try:
                await vault.get_access_token(session, fid, "linkedin")
                print("  !!! got a token - BUG !!!")
            except VaultError as e:
                print(f"  refused: {e}")

        print("\n" + "=" * 64)
        print("DEMO COMPLETE - see Supabase: Table Editor -> connected_accounts")
    finally:
        await engine.dispose()


asyncio.run(main())

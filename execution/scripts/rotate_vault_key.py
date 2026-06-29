"""Rotate the token-vault master key (TOKEN_VAULT_KEY).

Envelope scheme (security/vault.py): each connected_accounts row stores
wrapped_dek = master.encrypt(DEK); the token itself is encrypted with that DEK.
Rotating the master means RE-WRAPPING every DEK (decrypt with the OLD master,
re-encrypt with the NEW master) — the token ciphertext never changes.

Usage (from execution/):
  # 1. DRY RUN — proves every row decrypts with the current key, writes nothing:
  python scripts/rotate_vault_key.py --dry-run
  # 2. REAL RUN — re-wraps all rows in one transaction, then PRINTS the new key:
  python scripts/rotate_vault_key.py

The OLD key is read from TOKEN_VAULT_KEY in execution/.env. After a real run,
set the printed NEW key as TOKEN_VAULT_KEY in your host (Render) env, redeploy,
and treat the old key as permanently compromised.
"""

import asyncio
import os
import pathlib
import sys

import asyncpg
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _rewrap(old: Fernet, new: Fernet, wrapped: str) -> str:
    """Decrypt a wrapped DEK with the old master, re-wrap with the new master."""
    dek = old.decrypt(wrapped.encode())
    return new.encrypt(dek).decode()


async def main(dry: bool) -> None:
    load_dotenv(ROOT / ".env")
    old_key = os.environ.get("TOKEN_VAULT_KEY", "")
    if not old_key:
        sys.exit("TOKEN_VAULT_KEY missing in execution/.env")
    dsn = os.environ.get("CHECKPOINTER_DSN") or os.environ.get("DATABASE_URL", "")
    if not dsn:
        sys.exit("CHECKPOINTER_DSN missing in execution/.env")

    old = Fernet(old_key.encode())
    new_key = Fernet.generate_key()
    new = Fernet(new_key)

    conn = await asyncpg.connect(dsn, timeout=30)
    try:
        rows = await conn.fetch(
            "select account_id, wrapped_dek, refresh_ciphertext from connected_accounts "
            "where wrapped_dek is not null"
        )
        print(f"{len(rows)} account(s) with stored tokens to re-wrap")

        plans = []
        for r in rows:
            try:
                new_wrapped = _rewrap(old, new, r["wrapped_dek"])
            except InvalidToken:
                sys.exit(
                    f"account {r['account_id']}: wrapped_dek does NOT decrypt with the current "
                    "TOKEN_VAULT_KEY — aborting, nothing changed. Check the OLD key in .env."
                )
            new_refresh = None
            if r["refresh_ciphertext"]:
                r_wrapped, _, r_ct = r["refresh_ciphertext"].partition("::")
                try:
                    new_refresh = f"{_rewrap(old, new, r_wrapped)}::{r_ct}"
                except InvalidToken:
                    sys.exit(f"account {r['account_id']}: refresh DEK does NOT decrypt — aborting.")
            plans.append((r["account_id"], new_wrapped, new_refresh))

        if dry:
            print("DRY RUN ok — every row re-wraps cleanly with the current key. No changes written.")
            return

        async with conn.transaction():
            for account_id, new_wrapped, new_refresh in plans:
                await conn.execute(
                    "update connected_accounts set wrapped_dek=$1, refresh_ciphertext=$2 "
                    "where account_id=$3",
                    new_wrapped,
                    new_refresh,
                    account_id,
                )
        print(f"re-wrapped {len(plans)} account(s).")
        print("\n=== SET THIS AS TOKEN_VAULT_KEY IN RENDER (env only), then redeploy ===")
        print(new_key.decode())
        print("======================================================================\n")
        print("Then treat the OLD key as permanently compromised.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))

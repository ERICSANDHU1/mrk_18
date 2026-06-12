"""S2 — the token vault: envelope encryption + the 60-second revocation rule.

Envelope scheme: every record gets its own random data key (DEK). The token
is encrypted with the DEK; the DEK is encrypted ("wrapped") with the master
key from TOKEN_VAULT_KEY, which lives only in the environment — never in the
database. A full DB leak therefore yields ciphertext twice over, and rotating
the master key means re-wrapping DEKs, not re-encrypting every token.

Iron rules enforced here:
  * plaintext tokens never leave this module except via get_access_token()
  * plaintext is NEVER logged, audited, or returned by any API view
  * revocation destroys ciphertexts AND cancels the founder's pending
    publish work in the same transaction (the <60s guarantee — it's instant)
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..audit.recorder import record
from ..db.models import ConnectedAccountRow, PublishResultRow
from ..schemas.enums import AuditEventType
from .scopes import validate_scopes

log = logging.getLogger("mrk18.vault")

AGENT = "system:vault"

# Reconnect nudge window: LinkedIn tokens die at 60 days; nudge from day ~50.
RECONNECT_WINDOW_DAYS = 10


class VaultError(Exception):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TokenVault:
    def __init__(self, master_key: str):
        if not master_key:
            raise VaultError("TOKEN_VAULT_KEY is not configured")
        self._master = Fernet(master_key.encode())

    # ── envelope primitives ────────────────────────────────────────────────
    def seal(self, plaintext: str) -> tuple[str, str]:
        """Return (wrapped_dek, ciphertext)."""
        dek = Fernet.generate_key()
        ciphertext = Fernet(dek).encrypt(plaintext.encode()).decode()
        wrapped = self._master.encrypt(dek).decode()
        return wrapped, ciphertext

    def open(self, wrapped_dek: str, ciphertext: str) -> str:
        try:
            dek = self._master.decrypt(wrapped_dek.encode())
            return Fernet(dek).decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise VaultError("vault decryption failed (wrong master key or corrupt data)") from exc

    # ── account operations ─────────────────────────────────────────────────
    async def store_tokens(
        self,
        session: AsyncSession,
        *,
        founder_id: UUID,
        platform: str,
        access_token: str,
        refresh_token: str | None = None,
        expires_at: datetime | None = None,
        scopes: list[str] | None = None,
        external_ref: str | None = None,
    ) -> ConnectedAccountRow:
        """Connect (or re-connect) a platform account. Scopes are validated
        against the minimum-scope policy BEFORE anything is stored."""
        granted = validate_scopes(platform, scopes or [])

        wrapped, ciphertext = self.seal(access_token)
        refresh_blob = None
        if refresh_token:
            # separate envelope per secret — simpler to reason about, rotation-safe
            r_wrapped, r_ct = self.seal(refresh_token)
            refresh_blob = f"{r_wrapped}::{r_ct}"
        account = (
            await session.execute(
                select(ConnectedAccountRow).where(
                    ConnectedAccountRow.founder_id == founder_id,
                    ConnectedAccountRow.platform == platform,
                )
            )
        ).scalar_one_or_none()
        if account is None:
            account = ConnectedAccountRow(founder_id=founder_id, platform=platform)
            session.add(account)
        account.status = "connected"
        account.scopes = granted
        account.external_ref = external_ref
        account.wrapped_dek = wrapped
        account.token_ciphertext = ciphertext
        account.refresh_ciphertext = refresh_blob
        account.token_expires_at = expires_at
        account.revoked_at = None
        account.updated_at = _utcnow()

        await record(
            session,
            event_type=AuditEventType.AGENT_ACTION,
            agent_id=AGENT,
            founder_id=founder_id,
            platform=platform,
            outcome="account_connected",
            detail={"scopes": granted, "expires_at": str(expires_at or "")},  # NEVER the token
        )
        return account

    async def get_access_token(
        self, session: AsyncSession, founder_id: UUID, platform: str
    ) -> str:
        """The ONLY way plaintext leaves the vault — for an adapter call."""
        account = (
            await session.execute(
                select(ConnectedAccountRow).where(
                    ConnectedAccountRow.founder_id == founder_id,
                    ConnectedAccountRow.platform == platform,
                )
            )
        ).scalar_one_or_none()
        if account is None or account.status != "connected":
            raise VaultError(f"no connected {platform} account for this founder")
        if not account.wrapped_dek or not account.token_ciphertext:
            raise VaultError(f"{platform} account has no stored token")
        return self.open(account.wrapped_dek, account.token_ciphertext)


def needs_reconnect(account: ConnectedAccountRow) -> bool:
    """True when the token dies within the nudge window (LinkedIn day ~50)."""
    if account.status != "connected" or account.token_expires_at is None:
        return False
    expires = account.token_expires_at
    if expires.tzinfo is None:  # SQLite test DB strips tz
        expires = expires.replace(tzinfo=timezone.utc)
    return expires - _utcnow() <= timedelta(days=RECONNECT_WINDOW_DAYS)


async def revoke_account(
    session_factory: async_sessionmaker, founder_id: UUID, platform: str
) -> dict:
    """Disconnect: destroy ciphertexts and cancel the founder's pending
    publish work for that platform — one transaction, instant (<60s rule)."""
    from .tenant import tenant_session

    started = _utcnow()
    async with tenant_session(session_factory, founder_id) as session:
        account = (
            await session.execute(
                select(ConnectedAccountRow).where(
                    ConnectedAccountRow.founder_id == founder_id,
                    ConnectedAccountRow.platform == platform,
                )
            )
        ).scalar_one_or_none()
        if account is None:
            raise LookupError(f"no {platform} connection found")

        account.status = "revoked"
        account.wrapped_dek = None
        account.token_ciphertext = None
        account.refresh_ciphertext = None
        account.revoked_at = started
        account.updated_at = started

        # cancel pending actions: anything queued/retryable for this platform
        pending = (
            (
                await session.execute(
                    select(PublishResultRow).where(
                        PublishResultRow.founder_id == founder_id,
                        PublishResultRow.platform == platform,
                        PublishResultRow.status.in_(("queued_manual", "retryable")),
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in pending:
            row.status = "failed"
            row.error = "cancelled: account revoked by founder"
            row.updated_at = started

        await record(
            session,
            event_type=AuditEventType.AGENT_ACTION,
            agent_id=AGENT,
            founder_id=founder_id,
            platform=platform,
            outcome="account_revoked",
            detail={"pending_cancelled": len(pending)},
        )
        await session.commit()

    elapsed = (_utcnow() - started).total_seconds()
    log.info("revoked %s for founder %s in %.2fs", platform, founder_id, elapsed)
    return {"platform": platform, "pending_cancelled": len(pending), "seconds": elapsed}

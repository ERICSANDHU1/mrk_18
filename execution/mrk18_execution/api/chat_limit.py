"""Per-account daily free-chat cap — DURABLE.

Two tiers, both keyed by the account's email ("gmail"), both on a rolling 24-hour
window that opens on the first chat and resets 24h later:

  • Before onboarding: 5 free chats/day  (key = email).
  • After onboarding:  a FRESH 10 chats/day  (key = email + ":onb").

The count is PERSISTED in the account's key-value row (BrandDNARow, under
"chatusage:{key}") — so a page reload, a backend restart, or Render's free-tier
spin-down never hands back a fresh 5/10. Live voice calls are NOT counted. A
message may cost more than 1 unit (a premium model bills 2×) — `consume` takes
the unit count.
"""

import time

from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import BrandDNARow

FREE_PER_DAY = 5  # before onboarding — 5 free chats / 24h / account
ONBOARDED_PER_DAY = 10  # after onboarding — a fresh 10 / 24h / account
_WINDOW = 24 * 60 * 60.0  # rolling 24h


def account_key(email: str | None, sub: str | None = None) -> str:
    """Stable per-account key — the email ("gmail") when present, else the auth
    subject. Lower-cased so casing can't mint a second free allowance."""
    return (email or sub or "").strip().lower()


def onboarded_key(email: str | None, sub: str | None = None) -> str:
    """The onboarded tier's SEPARATE key, so the 10 starts fresh at onboarding."""
    return account_key(email, sub) + ":onb"


def _store_key(key: str) -> str:
    return f"chatusage:{key}"


async def _read(session: AsyncSession, key: str) -> tuple[BrandDNARow | None, int, float]:
    """(row, used, window_start) for this account, rolling the window over when the
    24h has elapsed. Read-only — never writes."""
    row = await session.get(BrandDNARow, _store_key(key))
    now = time.time()
    p = (row.payload if row and row.payload else None) or {}
    used = int(p.get("used", 0) or 0)
    start = float(p.get("start", now) or now)
    if now - start >= _WINDOW:  # a new day → fresh allowance
        used, start = 0, now
    return row, used, start


async def state(session: AsyncSession, key: str, cap: int) -> dict:
    """Read-only snapshot of the account's daily usage against `cap`."""
    _row, used, start = await _read(session, key)
    return {
        "used": used,
        "cap": cap,
        "remaining": max(0, cap - used),
        "limit_reached": used >= cap,
        "resets_in": max(0, int(_WINDOW - (time.time() - start))),
    }


async def consume(session: AsyncSession, key: str, units: int = 1) -> None:
    """Charge `units` against today's allowance and persist it."""
    row, used, start = await _read(session, key)
    payload = {"used": used + max(1, units), "start": start}
    if row is None:
        session.add(BrandDNARow(auth_user_id=_store_key(key), payload=payload))
    else:
        row.payload = payload
    await session.commit()

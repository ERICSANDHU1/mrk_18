"""Per-account daily free-chat cap.

Two tiers, both keyed by the account's email ("gmail"), both on a rolling 24-hour
window that opens on the first chat and resets 24h later:

  • Before onboarding: 5 free chats/day  (key = email).
  • After onboarding:  a FRESH 10 chats/day  (key = email + ":onb").

The onboarded tier uses a SEPARATE key so it starts fresh at 10 the moment they
onboard and counts straight down (10 → 9 → …) — it is NOT the pre-onboarding 5
plus 10. Live voice calls are NOT counted — only typed chats.

In-memory, same posture as the taster's free-tier caps: a soft conversion guard,
not a security boundary, so a process restart simply opens a fresh window. (Swap
`_usage` for a tiny DB table if restart-durable daily counts are needed.)
"""

import time

FREE_PER_DAY = 5  # before onboarding — 5 free chats / 24h / account
ONBOARDED_PER_DAY = 10  # after onboarding — a fresh 10 / 24h / account
_WINDOW = 24 * 60 * 60.0  # rolling 24h

# account_key -> (count_in_window, window_start_epoch)
_usage: dict[str, tuple[int, float]] = {}


def account_key(email: str | None, sub: str | None = None) -> str:
    """Stable per-account key — the email ("gmail") when present, else the auth
    subject. Lower-cased so casing can't mint a second free allowance."""
    return (email or sub or "").strip().lower()


def onboarded_key(email: str | None, sub: str | None = None) -> str:
    """The onboarded tier's SEPARATE key, so the 10 starts fresh at onboarding
    (independent of whatever pre-onboarding chats were spent)."""
    return account_key(email, sub) + ":onb"


def _current(key: str) -> tuple[int, float]:
    """(count, window_start) for this account, rolling the window over if the 24h
    has elapsed since it opened."""
    now = time.time()
    count, start = _usage.get(key, (0, now))
    if now - start >= _WINDOW:  # a new day → fresh allowance
        count, start = 0, now
        _usage[key] = (count, start)
    return count, start


def state(key: str, cap: int) -> dict:
    """Read-only snapshot of the account's daily usage against `cap`."""
    count, start = _current(key)
    return {
        "used": count,
        "cap": cap,
        "remaining": max(0, cap - count),
        "limit_reached": count >= cap,
        "resets_in": max(0, int(_WINDOW - (time.time() - start))),
    }


def consume(key: str) -> None:
    """Charge one chat against today's allowance."""
    count, start = _current(key)
    _usage[key] = (count + 1, start)
    # opportunistic cleanup so the map can't grow unbounded on a long-lived process
    if len(_usage) > 100_000:
        now = time.time()
        for stale in [k for k, (_, s) in _usage.items() if now - s >= _WINDOW]:
            _usage.pop(stale, None)

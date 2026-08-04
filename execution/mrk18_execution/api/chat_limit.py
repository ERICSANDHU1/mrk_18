"""Per-account daily free-chat cap.

5 free text chats per DAY per account (keyed by the account's email — the
"gmail"), on a rolling 24-hour window: the window opens on the first chat and
resets 24h later, handing back a fresh 5. Onboarded founders get a bigger daily
allowance (the 5 + 10 the funnel promises). Live voice calls are NOT counted —
only typed chats.

In-memory, same posture as the taster's free-tier caps: a soft conversion guard,
not a security boundary, so a process restart simply opens a fresh window. (Swap
`_usage` for a tiny DB table if restart-durable daily counts are needed.)
"""

import time

FREE_PER_DAY = 5  # before onboarding — 5 free chats / 24h / account
ONBOARDED_PER_DAY = 15  # after onboarding — the 5 + 10, per day
_WINDOW = 24 * 60 * 60.0  # rolling 24h

# account_key -> (count_in_window, window_start_epoch)
_usage: dict[str, tuple[int, float]] = {}


def account_key(email: str | None, sub: str | None = None) -> str:
    """Stable per-account key — the email ("gmail") when present, else the auth
    subject. Lower-cased so casing can't mint a second free allowance."""
    return (email or sub or "").strip().lower()


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

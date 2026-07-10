"""Slice 2.4 — perimeter rate limiting.

Token buckets per (caller, endpoint class). The wall (auth) decides WHETHER a
request is allowed; this decides HOW OFTEN — brute-force probing, runaway
retry loops, and LLM-quota burn all get throttled instead of served.

Keys: the client IP (X-Forwarded-For only when explicitly trusted — set
TRUST_PROXY_HEADERS once deployed behind a proxy, never before, or callers
could spoof their own bucket). Counters are in-process: correct for the
single-instance pilot; multi-instance later moves them to Redis — this module
is that seam.

Budgets are deliberately class-based, not per-route: strictest where money or
approvals are at stake.
"""

import re
import time
from dataclasses import dataclass, field

# (regex, methods, class name, budget per minute) — first match wins
_CLASSES: list[tuple[re.Pattern, frozenset, str, int]] = [
    (re.compile(r"^/founders/[^/]+/runs$"), frozenset({"POST"}), "run_start", 10),
    (re.compile(r"^/runs/[^/]+/gate[12]$"), frozenset({"POST"}), "gates", 60),
    (re.compile(r"^/runs/[^/]+/publish$"), frozenset({"POST"}), "publish", 20),
    (re.compile(r"^/runs/[^/]+/review-link$"), frozenset({"GET"}), "review_link", 30),
    (re.compile(r"^/founders$"), frozenset({"POST"}), "signup", 20),
    # the free taster burns Tavily credits + GPU seconds per call — strictest class
    (re.compile(r"^/taster$"), frozenset({"POST"}), "taster", 5),
]
DEFAULT_PER_MIN = 240
ALERT_COOLDOWN_S = 300.0  # one alarm per key+class per 5 min, not one per request


@dataclass
class _Bucket:
    tokens: float
    updated: float
    alerted_at: float = field(default=float("-inf"))  # -inf: first breach always alerts


class RateLimiter:
    def __init__(self, default_per_min: int = DEFAULT_PER_MIN, clock=time.monotonic):
        self._default = default_per_min
        self._clock = clock
        self._buckets: dict[tuple[str, str], _Bucket] = {}

    def classify(self, method: str, path: str) -> tuple[str, int]:
        for pattern, methods, name, per_min in _CLASSES:
            if method in methods and pattern.match(path):
                return name, per_min
        return "default", self._default

    def check(self, key: str, method: str, path: str) -> tuple[bool, float, bool]:
        """Returns (allowed, retry_after_s, should_alert). should_alert is True
        only on the first refusal per cooldown window — alarms, not alarm spam."""
        klass, per_min = self.classify(method, path)
        now = self._clock()
        rate = per_min / 60.0
        bucket = self._buckets.get((key, klass))
        if bucket is None:
            # blunt memory guard: a scanner cycling millions of IPs can't grow
            # this dict forever — resetting buckets is safe (limits refill full)
            if len(self._buckets) > 50_000:
                self._buckets.clear()
            bucket = self._buckets[(key, klass)] = _Bucket(tokens=float(per_min), updated=now)
        bucket.tokens = min(float(per_min), bucket.tokens + (now - bucket.updated) * rate)
        bucket.updated = now
        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True, 0.0, False
        retry_after = (1.0 - bucket.tokens) / rate
        should_alert = now - bucket.alerted_at > ALERT_COOLDOWN_S
        if should_alert:
            bucket.alerted_at = now
        return False, retry_after, should_alert

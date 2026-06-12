"""Slice 3.1 — signal sources: where metrics come from.

Same seam pattern as the publisher adapters: one protocol, swappable
implementations, so going live never rewires Eagle-View.

  * manual  — the pilot's REAL path: the founder pastes the numbers their
              platform shows them (LinkedIn exposes no personal-profile
              analytics API, so manual isn't a stopgap there — it's the road).
              Manual entry is an API endpoint, not a source class.
  * stub    — deterministic curves for tests and demos.
  * linkedin_api / x_api — land at go-live behind this same protocol
              (X's public_metrics makes it the first truly automated source).
"""

from typing import Protocol
from uuid import UUID

from ..schemas.enums import WindowPoint

# hours after publish at which each window is due
WINDOW_HOURS: dict[WindowPoint, float] = {
    WindowPoint.H1: 1.0,
    WindowPoint.H6: 6.0,
    WindowPoint.H24: 24.0,
    WindowPoint.H72: 72.0,
    WindowPoint.D7: 168.0,
}


class SignalSource(Protocol):
    name: str

    async def fetch(
        self, *, platform: str, platform_post_id: str | None, item_id: UUID,
        window_point: WindowPoint,
    ) -> dict | None:
        """Return metric fields (reach, engagement_rate, …) or None when this
        source can't measure that post (wrong platform, no post id, …)."""
        ...


class StubSignalSource:
    """Deterministic engagement curve — a post 'lives' fast then decays.
    Reach grows with each window; engagement_rate decays; numbers derive from
    the item_id so tests are stable without any randomness."""

    name = "stub"

    _GROWTH = {  # share of final 7d reach visible at each window
        WindowPoint.H1: 0.18,
        WindowPoint.H6: 0.55,
        WindowPoint.H24: 0.85,
        WindowPoint.H72: 0.96,
        WindowPoint.D7: 1.0,
    }

    async def fetch(
        self, *, platform: str, platform_post_id: str | None, item_id: UUID,
        window_point: WindowPoint,
    ) -> dict | None:
        base_reach = 400 + (item_id.int % 1600)  # 400–1999, stable per item
        share = self._GROWTH[window_point]
        return {
            "reach": int(base_reach * share),
            "engagement_rate": round(0.06 * (1.0 - 0.4 * share) + 0.01, 6),
            "saves": int(8 * share),
            "link_ctr": 0.012,
        }

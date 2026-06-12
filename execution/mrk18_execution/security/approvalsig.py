"""Slice 2.3 — HMAC-signed ApprovalEvents, verified by the Publisher.

The JWT (S1) proves WHO clicked approve; this module freezes WHAT they
approved. At Gate 2 the orchestrator signs each ApprovalEvent over a hash of
the exact item content the founder saw, plus the event identity. Every
publisher re-verifies the signature before acting, so:

  * a forged "approved" row written straight into the DB fails (no valid MAC)
  * a real approval re-pointed at edited content fails (hash mismatch) —
    nothing publishes that the founder never saw
  * an approval can't be replayed as a different decision or another event
    (decision + event_id are inside the MAC)

Key = APPROVAL_SIGNING_KEY (same secret that signs review links). No key
configured → signatures are neither minted nor demanded (pilot/dev); key
configured → unsigned or invalid events are REFUSED and alarmed.
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import UUID

_VERSION = "v1"


def item_content_hash(item) -> str:
    """Canonical sha256 over exactly what the founder reviews. `item` is a
    ContentItemRow (or anything with these attributes)."""
    payload = {
        "item_id": str(item.item_id),
        "platform": item.platform,
        "format": item.format,
        "body": item.body,
        "thread": item.thread or None,
        "first_comment": item.first_comment or None,
        "link_url": item.link_url or None,
        "media_urls": [m.get("url") for m in (item.media or [])],
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


def _canon_ts(dt: datetime) -> str:
    """UTC, naive, isoformat — identical for a tz-aware mint-time datetime and
    the naive value SQLite hands back on re-read."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat()


def sign_approval(
    key: str,
    *,
    event_id: UUID,
    item_hash: str,
    founder_id: UUID,
    decision: str,
    decided_at: datetime,
) -> str:
    msg = (
        f"approval:{_VERSION}:{event_id}:{item_hash}:{founder_id}:"
        f"{decision}:{_canon_ts(decided_at)}"
    ).encode()
    return f"{_VERSION}.{hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()}"


def verify_approval_signature(key: str, event, item) -> bool:
    """Recompute the MAC from the DB rows and compare in constant time.
    `event` is an ApprovalEventRow, `item` the ContentItemRow it approves."""
    if not event.signature:
        return False
    expected = sign_approval(
        key,
        event_id=event.event_id,
        item_hash=item_content_hash(item),
        founder_id=event.founder_id,
        decision=event.decision,
        decided_at=event.decided_at,
    )
    return hmac.compare_digest(event.signature, expected)

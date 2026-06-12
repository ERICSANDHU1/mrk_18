"""Publisher interface + the defense-in-depth approval guard.

THE iron rule, enforced here for every adapter equally: a publisher acts only
on a PublishRequest carrying an approval_event_id that resolves to a real,
'approved' ApprovalEvent for that exact item. The orchestrator already
enforced the gate — this layer re-verifies independently, so a bug (or an
attacker) upstream still cannot publish. A failed check is a SECURITY_ALERT.
"""

from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ApprovalEventRow, ContentItemRow
from ..schemas.publishing import PublishRequest, PublishResult


class ApprovalViolation(Exception):
    """Raised when something tries to publish without a valid approval."""


class Publisher(Protocol):
    name: str

    async def publish(
        self, request: PublishRequest, step_token: str | None = None
    ) -> PublishResult:
        """Execute (or queue / export) one approved post. Never called without
        the guard below having passed — and with a signing key configured, the
        adapter itself re-checks via the ephemeral step token (Slice 2.3)."""
        ...


async def verify_approval(
    session: AsyncSession, item: ContentItemRow, signing_key: str | None = None
) -> ApprovalEventRow:
    """Return the item's latest ApprovalEvent IFF it is an approval.

    Checks, in order — each failure is a distinct, loud reason:
      1. an ApprovalEvent exists for the item
      2. the LATEST event's decision is 'approved' (a later rejection wins)
      3. the item's own status is consistent (approved / exported / failed-retry)
      4. with a signing key (Slice 2.3): the event's HMAC verifies against the
         item's CURRENT content — a forged row or content edited after approval
         fails here. Key configured = signatures are mandatory, no exceptions.
    """
    latest = (
        await session.execute(
            select(ApprovalEventRow)
            .where(ApprovalEventRow.item_id == item.item_id)
            .order_by(ApprovalEventRow.decided_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if latest is None:
        raise ApprovalViolation(f"item {item.item_id}: no ApprovalEvent exists")
    if latest.decision != "approved":
        raise ApprovalViolation(
            f"item {item.item_id}: latest decision is '{latest.decision}', not approved"
        )
    if item.status not in ("approved", "exported", "failed"):
        raise ApprovalViolation(
            f"item {item.item_id}: status '{item.status}' is not publishable"
        )
    if signing_key:
        from ..security.approvalsig import verify_approval_signature

        if not latest.signature:
            raise ApprovalViolation(
                f"item {item.item_id}: ApprovalEvent is unsigned — refusing "
                "(possible forged approval)"
            )
        if not verify_approval_signature(signing_key, latest, item):
            raise ApprovalViolation(
                f"item {item.item_id}: approval signature does not verify — refusing "
                "(content changed after approval, or the event was forged)"
            )
    return latest


def request_for(item: ContentItemRow, adapter_name: str, approval_event_id: UUID) -> PublishRequest:
    """Build the frozen PublishRequest from a verified item. request_id is the
    idempotency key: one per item × adapter, stable across retries."""
    from datetime import datetime, timezone

    from ..schemas.content import MediaSpec

    return PublishRequest(
        request_id=f"{item.item_id}:{adapter_name}",
        item_id=item.item_id,
        approval_event_id=approval_event_id,
        platform=item.platform,
        account_ref=f"founder:{item.founder_id}:{item.platform}",
        author_handle="(pilot — account not yet connected)",
        body=item.body,
        thread=item.thread,
        media=[MediaSpec.model_validate(m) for m in (item.media or [])],
        first_comment=item.first_comment,
        link_url=item.link_url,
        scheduled_at=datetime.now(timezone.utc),
    )

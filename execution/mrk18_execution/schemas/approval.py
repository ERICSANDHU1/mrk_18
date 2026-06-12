"""ApprovalEvent — the load-bearing object of the whole system.

Nothing publishes without one. The decision enum has no bulk member (no
"Approve All" exists at the type level). `signature` is a placeholder in
Phase 1; Phase 2 fills it with an HMAC over (item hash + founder + timestamp)
and the Publisher verifies it cryptographically before acting.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import ApprovalDecision


class ApprovalEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)  # immutable once minted

    event_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    item_id: UUID
    founder_id: UUID
    decision: ApprovalDecision
    note: str | None = Field(default=None, max_length=2000)
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signature: str | None = None  # Phase 2: HMAC; Phase 1: None

    @model_validator(mode="after")
    def note_only_meaningful_on_reject(self) -> "ApprovalEvent":
        # A rejection note drives regeneration; on approval a note is allowed
        # but a *regeneration* expectation is not — nothing to enforce here yet.
        return self

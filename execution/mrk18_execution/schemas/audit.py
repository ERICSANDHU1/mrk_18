"""AuditRecord — append-only trail of every agent action (L9).

Hard rule enforced at the type level: a PUBLISH event without an
approval_event_id cannot even be constructed. (The DB layer additionally
makes the table append-only; Phase 2 hash-chains the rows.)
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import AuditEventType, Platform


class AuditRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)  # records never mutate

    record_id: UUID = Field(default_factory=uuid4)
    event_type: AuditEventType
    agent_id: str = Field(min_length=1, description="Non-human identity, e.g. 'agent:content', 'agent:publisher'")
    founder_id: UUID | None = None
    run_id: UUID | None = None
    approval_event_id: UUID | None = None
    platform: Platform | None = None
    outcome: str = Field(min_length=1)
    detail: dict = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def publish_requires_approval(self) -> "AuditRecord":
        if self.event_type == AuditEventType.PUBLISH and self.approval_event_id is None:
            raise ValueError(
                "publish event without approval_event_id — refusing to construct "
                "(this is the zero-unauthorized-publishes invariant)"
            )
        return self

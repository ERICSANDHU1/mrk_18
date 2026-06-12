"""SignalRecord — Eagle-View Monitor output (Phase 3; schema fixed now so the
Phase 1 database never needs a breaking migration)."""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from .enums import Platform, WindowPoint


class SignalRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    signal_id: UUID = Field(default_factory=uuid4)
    founder_id: UUID
    item_id: UUID
    platform: Platform
    window_point: WindowPoint
    pulled_at: datetime
    reach: int = Field(ge=0)
    engagement_rate: float = Field(ge=0.0)
    follower_delta_48h: int | None = None
    link_ctr: float | None = Field(default=None, ge=0.0)
    comment_sentiment: float | None = Field(default=None, ge=-1.0, le=1.0)
    saves: int | None = Field(default=None, ge=0)
    half_life_hours: float | None = Field(default=None, gt=0.0)

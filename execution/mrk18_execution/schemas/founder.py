"""FounderProfile — the tenant + intake contract (Layer 1).

A FounderProfile that validates IS the "100% complete" intake gate: partial
intake progress is stored as raw JSON in the DB and only becomes a
FounderProfile when every required field passes. Orchestration starts from a
FounderProfile, never from raw intake.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import Platform


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConsentRecord(BaseModel):
    """DPDP Act 2023: consent must be free, specific, informed, affirmative."""

    model_config = ConfigDict(extra="forbid")

    given: bool
    text_version: str = Field(min_length=1)  # which consent text they saw
    timestamp: datetime = Field(default_factory=_utcnow)

    @field_validator("given")
    @classmethod
    def must_be_affirmative(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("consent must be affirmative (no pre-ticked boxes)")
        return v


class FounderProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    founder_id: UUID = Field(default_factory=uuid4)
    company_name: str = Field(min_length=1, max_length=200)
    website: str = Field(min_length=4, max_length=500)
    product_description: str = Field(min_length=10, max_length=2000)
    icp: str = Field(min_length=10, max_length=2000, description="Who they sell to, geography, stage")
    top_competitors: list[str] = Field(min_length=1, max_length=3)
    tone: str = Field(min_length=2, max_length=500)
    primary_goal: str = Field(min_length=2, max_length=500)
    monthly_spend_inr: int = Field(ge=0)
    target_platforms: list[Platform] = Field(min_length=1)
    consent: ConsentRecord
    created_at: datetime = Field(default_factory=_utcnow)

    @field_validator("top_competitors")
    @classmethod
    def competitors_non_empty(cls, v: list[str]) -> list[str]:
        cleaned = [c.strip() for c in v if c.strip()]
        if not cleaned:
            raise ValueError("at least one named competitor required")
        return cleaned

    @field_validator("target_platforms")
    @classmethod
    def platforms_unique(cls, v: list[Platform]) -> list[Platform]:
        if len(set(v)) != len(v):
            raise ValueError("duplicate platforms in target_platforms")
        return v

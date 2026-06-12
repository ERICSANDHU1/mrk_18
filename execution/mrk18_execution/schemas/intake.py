"""Intake draft contract — the PARTIAL form (Layer 1).

Every field optional: a founder can save half a form and come back tomorrow.
The full FounderProfile (founder.py) is the completion gate; this model is
only the shape of what may be saved along the way.
"""

from pydantic import BaseModel, ConfigDict, Field

from .enums import Platform

# Fields that must be present and valid before intake can complete.
INTAKE_FIELDS = (
    "company_name",
    "website",
    "product_description",
    "icp",
    "top_competitors",
    "tone",
    "primary_goal",
    "monthly_spend_inr",
    "target_platforms",
    "consent_given",
    "consent_text_version",
)


class IntakeDraft(BaseModel):
    """A partial save. Unknown fields are rejected; missing fields are fine."""

    model_config = ConfigDict(extra="forbid")

    company_name: str | None = None
    website: str | None = None
    product_description: str | None = None
    icp: str | None = None
    top_competitors: list[str] | None = None
    tone: str | None = None
    primary_goal: str | None = None
    monthly_spend_inr: int | None = Field(default=None, ge=0)
    target_platforms: list[Platform] | None = None
    consent_given: bool | None = None
    consent_text_version: str | None = None

    def non_null_fields(self) -> dict:
        return {k: v for k, v in self.model_dump(mode="json").items() if v is not None}


class IntakeStatus(BaseModel):
    """What the API reports back after every save / read."""

    founder_id: str
    status: str
    complete: bool
    missing_fields: list[str]
    problems: list[str] = []

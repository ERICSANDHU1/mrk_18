"""MarketingIntelligenceReport — output of the analysis layer (L2/L3).

The "zero hallucinated facts" rule is a schema field, not a hope: every claim
carries a source and a confidence level, and low-confidence claims are
surfaced, never silently blended in.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .enums import Confidence


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    source: str = Field(min_length=1, description="URL, founder intake field, or named dataset")
    confidence: Confidence


class ReportSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1)
    claims: list[Claim] = Field(min_length=1)

    @property
    def low_confidence_claims(self) -> list[Claim]:
        return [c for c in self.claims if c.confidence == Confidence.LOW]


class MarketingIntelligenceReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    market_intel: ReportSection
    audience_positioning: ReportSection
    content_strategy: ReportSection
    synthesis: str = Field(min_length=1)
    founder_flags: list[str] = Field(default_factory=list, description="Disagreements raised at Gate 1")

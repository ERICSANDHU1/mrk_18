"""RunMeta — one CampaignRun: LangGraph thread mapping, status, and the
fully-loaded INR cost ledger (PRD cost-tracking requirement)."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from .enums import RunStatus


class RunMeta(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    run_id: UUID = Field(default_factory=uuid4)
    founder_id: UUID
    thread_id: str = Field(min_length=1, description="LangGraph resume key — one per run")
    status: RunStatus = RunStatus.GENERATING
    tokens_in: int = Field(default=0, ge=0)
    tokens_out: int = Field(default=0, ge=0)
    images_generated: int = Field(default=0, ge=0)
    cost_inr: float = Field(default=0.0, ge=0.0)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None

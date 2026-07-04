"""Public Founding-50 waitlist applications.

The landing-page Apply form posts here. No auth (it's a public form) — guarded by
the global rate limiter (perimeter middleware), tight field caps, and a honeypot.
Rows land in the `applications` table; read them in the Supabase Table Editor.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ApplicationRow
from .deps import get_session

router = APIRouter(tags=["apply"])

# The public counter reads WAITLIST_START "now" and ticks up by one for every NEW
# application from here. WAITLIST_BASELINE = the rows already in the table when the
# counter went live, so pre-existing rows don't inflate the displayed number.
WAITLIST_START = 78
WAITLIST_BASELINE = 7  # application rows present on 2026-07-05


@router.get("/apply/count", response_model=dict)
async def apply_count(session: AsyncSession = Depends(get_session)) -> dict:
    """Public live queue size — WAITLIST_START + new applications since baseline.
    The landing modal, the /mrk bar and the standalone /form all read this, live."""
    n = int(await session.scalar(select(func.count()).select_from(ApplicationRow)) or 0)
    return {"count": n, "in_line": WAITLIST_START + max(0, n - WAITLIST_BASELINE)}


class ApplyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(default="", max_length=40)
    company: str = Field(default="", max_length=300)
    marketing_issue: str = Field(min_length=1, max_length=2000)
    hp: str = Field(default="", max_length=200)  # honeypot — humans leave it blank

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if "@" not in v or "." not in v.rsplit("@", 1)[-1]:
            raise ValueError("invalid email")
        return v


@router.post("/apply", response_model=dict)
async def apply(body: ApplyBody, session: AsyncSession = Depends(get_session)) -> dict:
    """Store a Founding-50 application. Honeypot hits get a 200 but aren't stored,
    so bots think it worked and move on."""
    if body.hp.strip():
        return {"ok": True}
    session.add(
        ApplicationRow(
            email=body.email,
            phone=body.phone.strip() or None,
            company=body.company.strip() or None,
            marketing_issue=body.marketing_issue.strip(),
        )
    )
    await session.commit()
    return {"ok": True}

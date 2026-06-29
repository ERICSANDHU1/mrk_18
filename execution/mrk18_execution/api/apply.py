"""Public Founding-50 waitlist applications.

The landing-page Apply form posts here. No auth (it's a public form) — guarded by
the global rate limiter (perimeter middleware), tight field caps, and a honeypot.
Rows land in the `applications` table; read them in the Supabase Table Editor.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ApplicationRow
from .deps import get_session

router = APIRouter(tags=["apply"])


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

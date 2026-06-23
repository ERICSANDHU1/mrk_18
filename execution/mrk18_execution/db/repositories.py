"""Thin data-access functions. No business rules here — rules live in the
schemas (contracts) and the API layer; this file only moves rows."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import FounderProfileRow, FounderRow


async def create_founder(
    session: AsyncSession,
    email: str,
    display_name: str | None,
    auth_user_id: str | None = None,
) -> FounderRow:
    founder = FounderRow(
        email=email.strip().lower(), display_name=display_name, auth_user_id=auth_user_id
    )
    session.add(founder)
    await session.flush()  # assigns id, surfaces unique email/auth_user_id violation
    session.add(FounderProfileRow(founder_id=founder.id, status="draft", draft={}))
    await session.flush()
    return founder


async def get_founder_by_auth_user(session: AsyncSession, sub: str) -> FounderRow | None:
    """Resolve a verified JWT `sub` (Supabase UUID or Clerk user id) to its founder."""
    sub = (sub or "").strip()
    if not sub:
        return None
    result = await session.execute(
        select(FounderRow).where(FounderRow.auth_user_id == sub)
    )
    return result.scalar_one_or_none()


async def get_profile(session: AsyncSession, founder_id: UUID) -> FounderProfileRow | None:
    result = await session.execute(
        select(FounderProfileRow).where(FounderProfileRow.founder_id == founder_id)
    )
    return result.scalar_one_or_none()


async def merge_draft(profile_row: FounderProfileRow, patch: dict) -> dict:
    merged = {**(profile_row.draft or {}), **patch}
    profile_row.draft = merged
    return merged

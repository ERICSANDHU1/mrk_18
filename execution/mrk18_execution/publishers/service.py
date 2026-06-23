"""Publish orchestration: approved items → adapters, with the guard,
idempotency, per-item isolation (one failure never blocks the batch), and a
full audit trail. The DB is publish-state truth.

Modes:
  export — REAL: ready-to-post kit on disk (pilot default; E1)
  stub   — platform adapters with stub transports (shapes proven, items
           honestly stay 'approved'; flips to live at go-live)
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..audit.recorder import record
from ..db.models import ConnectedAccountRow, ContentItemRow, PublishResultRow, RunRow
from ..schemas.content import can_transition
from ..schemas.enums import AuditEventType, ContentStatus, Platform
from ..security.manifests import PermissionViolation, require_permission
from ..security.steptokens import PUBLISHER_AGENT, mint_step_token, publish_scope
from .adapters import ExportAdapter, InstagramOpsAdapter, LinkedInApiAdapter, XApiAdapter
from .base import ApprovalViolation, request_for, verify_approval

AGENT = "agent:publisher"
log = logging.getLogger("mrk18.publisher")

# A run may only be published once it is closed (review finding B4) — otherwise
# items could ship while siblings still await the founder at Gate 2.
PUBLISHABLE_RUN_STATUSES = frozenset({"done"})

PLATFORM_ADAPTERS = {
    Platform.LINKEDIN.value: LinkedInApiAdapter,
    Platform.X.value: XApiAdapter,
    Platform.INSTAGRAM.value: InstagramOpsAdapter,
}


async def _live_adapter(session, vault, item, signing_key, transport):
    """Build the LIVE adapter for one item: the real access token (from the
    vault) + the connected account's author ref. Instagram has no live API in
    the pilot, so it stays the human-ops queue. Returns None when the account
    isn't connected — the caller skips the item rather than failing it."""
    platform = item.platform
    if platform == Platform.INSTAGRAM.value:
        return InstagramOpsAdapter(signing_key=signing_key)
    account = (
        await session.execute(
            select(ConnectedAccountRow).where(
                ConnectedAccountRow.founder_id == item.founder_id,
                ConnectedAccountRow.platform == platform,
            )
        )
    ).scalar_one_or_none()
    if account is None or account.status != "connected":
        return None
    token = await vault.get_access_token(session, item.founder_id, platform)
    return PLATFORM_ADAPTERS[platform](
        stub=False,
        signing_key=signing_key,
        access_token=token,
        author_ref=account.external_ref,
        transport=transport,
    )


def _result_row(item: ContentItemRow, adapter_name: str, result, payload: dict) -> PublishResultRow:
    return PublishResultRow(
        request_id=result.request_id,
        item_id=item.item_id,
        run_id=item.run_id,
        founder_id=item.founder_id,
        platform=item.platform,
        adapter=adapter_name,
        status=result.status.value,
        platform_post_id=result.platform_post_id,
        public_url=result.public_url,
        thread_ids=result.thread_ids,
        payload=payload,
        raw_response=result.raw_response,
        error=result.error.message if result.error else None,
        cost_estimate_usd=result.cost_estimate_usd,
        published_at=result.published_at,
    )


async def publish_run(
    session_factory: async_sessionmaker,
    run_id: UUID,
    mode: str = "export",
    export_dir: str = "exports",
    signing_key: str | None = None,
    strict: bool = False,
    vault=None,
    transport=None,
) -> list[dict]:
    """Publish/export every publishable item of a run. Returns a summary per
    item — including the refusals, which are the system working, not failing.

    A1 — ``strict=True`` (production) refuses the whole batch when ``signing_key``
    is unset: without it ``verify_approval`` can't check signatures and no step
    token is minted, so publishing would proceed unguarded. Fail closed, loudly,
    rather than ship past a disabled gate."""
    if strict and not signing_key:
        raise ValueError(
            "publish blocked: APPROVAL_SIGNING_KEY is required in production — "
            "the publish gate fails closed rather than shipping unguarded"
        )
    if mode == "live" and vault is None:
        raise ValueError(
            "live publish needs the token vault (TOKEN_VAULT_KEY) to fetch access tokens"
        )

    from ..security.tenant import tenant_session

    # Resolve the owner + validate the run on a privileged probe: we need the
    # founder_id to scope, and RLS isn't active until we do. The per-item loop
    # then runs under the tenant role (session-level, so it survives the many
    # commits) — a publish can never reach another founder's rows.
    async with session_factory() as probe:
        run = await probe.get(RunRow, run_id)
        if run is None:
            raise LookupError("run not found")
        if run.status not in PUBLISHABLE_RUN_STATUSES:  # B4
            raise ValueError(
                f"run is not finished (status: {run.status}) — nothing to publish yet"
            )
        founder_id = run.founder_id

    summary: list[dict] = []
    async with tenant_session(session_factory, founder_id) as session:
        items = (
            (
                await session.execute(
                    select(ContentItemRow).where(ContentItemRow.run_id == run_id)
                )
            )
            .scalars()
            .all()
        )

        for item in items:
            entry: dict = {"item_id": str(item.item_id), "platform": item.platform}

            if mode == "export":
                adapter = ExportAdapter(export_dir, signing_key=signing_key)
            elif mode == "live":
                adapter = await _live_adapter(session, vault, item, signing_key, transport)
                if adapter is None:
                    summary.append(
                        {**entry, "status": "skipped", "skipped": "account not connected"}
                    )
                    continue
            else:  # stub — shapes proven, nothing actually leaves the building
                adapter = PLATFORM_ADAPTERS[item.platform](signing_key=signing_key)

            # ── idempotency: one result per item × adapter, ever ──────────
            existing = (
                await session.execute(
                    select(PublishResultRow).where(
                        PublishResultRow.request_id == f"{item.item_id}:{adapter.name}"
                    )
                )
            ).scalar_one_or_none()
            if existing is not None and existing.status not in ("failed", "retryable"):
                summary.append({**entry, "status": existing.status, "skipped": "already done"})
                continue

            if item.status not in ("approved", "exported"):
                summary.append({**entry, "status": item.status, "skipped": "not approved"})
                continue
            if mode == "export" and item.status == "exported":
                summary.append({**entry, "status": "exported", "skipped": "already exported"})
                continue

            # ── THE GUARD: manifest + independent approval re-verification ─
            # (Slice 2.3) the publisher's own manifest must grant this channel,
            # the ApprovalEvent must verify cryptographically against the exact
            # current content, and only then is a step token minted — the
            # adapter refuses to act without it.
            try:
                capability = "publish:export" if mode == "export" else f"publish:{item.platform}"
                require_permission(PUBLISHER_AGENT, capability)
                event = await verify_approval(session, item, signing_key=signing_key)
            except (ApprovalViolation, PermissionViolation) as violation:
                await record(
                    session,
                    event_type=AuditEventType.SECURITY_ALERT,
                    agent_id=AGENT,
                    founder_id=item.founder_id,
                    run_id=run_id,
                    outcome="publish_refused_no_valid_approval"
                    if isinstance(violation, ApprovalViolation)
                    else "publish_refused_permission",
                    detail={"item_id": str(item.item_id), "reason": str(violation)},
                )
                await session.commit()
                summary.append({**entry, "status": "REFUSED", "reason": str(violation)})
                continue

            request = request_for(item, adapter.name, event.event_id)
            step_token = (
                mint_step_token(
                    signing_key, agent_id=PUBLISHER_AGENT, scope=publish_scope(request)
                )
                if signing_key
                else None
            )
            try:
                result = await adapter.publish(request, step_token=step_token)
            except PermissionViolation as violation:
                # an adapter refusing its own step token is an alarm, not a retry
                await record(
                    session,
                    event_type=AuditEventType.SECURITY_ALERT,
                    agent_id=AGENT,
                    founder_id=item.founder_id,
                    run_id=run_id,
                    approval_event_id=event.event_id,
                    outcome="publish_refused_step_token",
                    detail={"item_id": str(item.item_id), "reason": str(violation)},
                )
                await session.commit()
                summary.append({**entry, "status": "REFUSED", "reason": str(violation)})
                continue
            except Exception as exc:  # noqa: BLE001 — one item's failure never blocks the batch
                await record(
                    session,
                    event_type=AuditEventType.ERROR,
                    agent_id=AGENT,
                    founder_id=item.founder_id,
                    run_id=run_id,
                    approval_event_id=event.event_id,
                    outcome="publish_attempt_failed",
                    detail={"item_id": str(item.item_id), "error": str(exc)[:500]},
                )
                await session.commit()
                summary.append({**entry, "status": "failed", "error": str(exc)[:200]})
                continue

            if existing is not None:  # retry path: update the same row
                existing.status = result.status.value
                existing.public_url = result.public_url
                existing.platform_post_id = result.platform_post_id
                existing.raw_response = result.raw_response
                existing.error = None
                existing.published_at = result.published_at
            else:
                session.add(
                    _result_row(item, adapter.name, result, request.model_dump(mode="json"))
                )

            # honest status transitions only
            if result.status.value == "exported" and can_transition(
                ContentStatus(item.status), ContentStatus.EXPORTED
            ):
                item.status = "exported"
            elif (
                mode == "live"
                and result.status.value == "published"
                and can_transition(ContentStatus(item.status), ContentStatus.PUBLISHED)
            ):
                item.status = "published"  # a LIVE publish really shipped — mark it
            # stub 'published' results do NOT mark the item published (no lie in
            # the data); IG queued_manual completes via complete_ops_task

            audit_event = (
                AuditEventType.EXPORT
                if result.status.value == "exported"
                else AuditEventType.OPS_TASK
                if result.status.value == "queued_manual"
                else AuditEventType.PUBLISH
            )
            await record(
                session,
                event_type=audit_event,
                agent_id=AGENT,
                founder_id=item.founder_id,
                run_id=run_id,
                approval_event_id=event.event_id,
                platform=item.platform,
                outcome=f"item_{result.status.value}",
                detail={
                    "item_id": str(item.item_id),
                    "adapter": adapter.name,
                    "stub": bool(result.raw_response.get("stub")),
                    "url": result.public_url or "",
                },
            )
            try:
                await session.commit()
            except IntegrityError:
                # M1: a concurrent publish_run inserted the same request_id
                # first. The unique key did its job (no double-post); treat the
                # collision as "already done" instead of crashing the batch.
                await session.rollback()
                log.info("publish idempotency collision for %s — already done", request.request_id)
                summary.append({**entry, "status": "skipped", "skipped": "already done"})
                continue
            summary.append({**entry, "status": result.status.value, "url": result.public_url})

    return summary


async def complete_ops_task(
    session_factory: async_sessionmaker, result_id: UUID, public_url: str
) -> dict:
    """Ops pastes the live URL → queued_manual becomes published, item follows."""
    from ..security.tenant import tenant_session

    # privileged probe for the owner (need founder_id to scope), then scope
    async with session_factory() as probe:
        owner = await probe.get(PublishResultRow, result_id)
        if owner is None:
            raise LookupError("publish result not found")
        founder_id = owner.founder_id

    async with tenant_session(session_factory, founder_id) as session:
        row = await session.get(PublishResultRow, result_id)
        if row is None:
            raise LookupError("publish result not found")
        if row.status != "queued_manual":
            raise ValueError(f"result is '{row.status}', not queued_manual")
        item = await session.get(ContentItemRow, row.item_id)
        row.status = "published"
        row.public_url = public_url
        from datetime import datetime, timezone

        row.published_at = datetime.now(timezone.utc)
        if item is not None and can_transition(
            ContentStatus(item.status), ContentStatus.PUBLISHED
        ):
            item.status = "published"
        await record(
            session,
            event_type=AuditEventType.PUBLISH,
            agent_id="ops:manual",
            founder_id=row.founder_id,
            run_id=row.run_id,
            approval_event_id=UUID(row.payload["approval_event_id"]),
            platform=row.platform,
            outcome="item_published",
            detail={"item_id": str(row.item_id), "via": "ops_manual", "url": public_url},
        )
        await session.commit()
        return {"result_id": str(result_id), "status": "published", "url": public_url}

"""C3 — the ARQ background worker.

Runs the timed jobs the API can't (it must answer requests, not sleep):
  * run auto-resume — re-drive runs orphaned by a restart (the reliability fix)
  * stale-approval expiry (silence = rejection)
  * scheduled Eagle-View signal pulls
  * periodic audit-chain verification (alarms on a break)

Build/run:
    pip install ".[worker]"
    arq mrk18_execution.worker.main.WorkerSettings      # or: python -m mrk18_execution.worker

It builds the SAME Postgres + LangGraph the API does, so a resumed run continues
from its checkpoint. Needs REDIS_URL (Upstash free tier works).
"""

import logging

from arq import cron
from arq.connections import RedisSettings

from ..config import get_settings
from ..db.engine import build_engine, build_session_factory

log = logging.getLogger("mrk18.worker")


async def _build_graph(settings, ctx) -> None:
    """Best-effort graph + checkpointer, mirroring the API's lifespan. Failure
    degrades (resume/pull jobs skip) — it never crashes the worker."""
    ctx["graph"] = None
    ctx["pool"] = None
    ctx["embedding_engine"] = None
    if not (settings.checkpointer_dsn and settings.groq_api_key):
        return
    try:
        from ..graph.analysis import build_analysis_graph
        from ..graph.checkpointer import open_checkpointer
        from ..llm.images import SupabaseMediaStore, pick_engine
        from ..llm.socket import LLMSocket, default_registry

        pool, saver = await open_checkpointer(settings.checkpointer_dsn)
        socket = LLMSocket(default_registry(settings.groq_api_key))
        store = (
            SupabaseMediaStore(settings.supabase_url, settings.supabase_service_key)
            if settings.supabase_url and settings.supabase_service_key
            else None
        )
        ctx["graph"] = build_analysis_graph(
            socket, saver, image_engine=pick_engine(settings), media_store=store
        )
        ctx["pool"] = pool
        if settings.cf_account_id and settings.cf_api_token:
            from ..llm.embeddings import CloudflareEmbeddingEngine

            ctx["embedding_engine"] = CloudflareEmbeddingEngine(
                settings.cf_account_id, settings.cf_api_token
            )
    except Exception as exc:  # noqa: BLE001 — degrade, never crash the worker
        log.warning("worker graph unavailable — resume/pull jobs will skip: %s", exc)


async def on_startup(ctx) -> None:
    settings = get_settings()
    ctx["settings"] = settings
    engine = build_engine(settings.database_url)
    ctx["engine"] = engine
    ctx["factory"] = build_session_factory(engine)
    ctx["signal_sources"] = {}  # wired at go-live; empty = manual platforms skipped
    await _build_graph(settings, ctx)
    log.info("worker up (graph=%s)", "ready" if ctx["graph"] else "degraded")


async def on_shutdown(ctx) -> None:
    if ctx.get("pool") is not None:
        try:
            await ctx["pool"].close()
        except Exception:  # noqa: BLE001
            pass
    if ctx.get("engine") is not None:
        await ctx["engine"].dispose()


# ── jobs ─────────────────────────────────────────────────────────────────────
async def job_resume_stuck_runs(ctx) -> dict:
    from ..graph.lifecycle import resume_stuck_runs

    if ctx["graph"] is None:
        return {"skipped": "graph unavailable"}
    return await resume_stuck_runs(
        ctx["graph"], ctx["factory"], embedding_engine=ctx["embedding_engine"]
    )


async def job_expire_stale_approvals(ctx) -> dict:
    from ..graph.lifecycle import expire_stale_approvals

    return {"expired": await expire_stale_approvals(ctx["factory"])}


async def job_pull_signals(ctx) -> dict:
    from ..monitor.eagleview import pull_due_signals

    return await pull_due_signals(ctx["factory"], ctx["signal_sources"])


async def job_verify_audit_chain(ctx) -> dict:
    from ..audit.recorder import verify_audit_chain

    result = await verify_audit_chain(ctx["factory"])
    if not result.get("ok"):
        log.critical("AUDIT CHAIN BROKEN: %s", result.get("breaks"))
    return result


class WorkerSettings:
    """`arq mrk18_execution.worker.main.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_startup = on_startup
    on_shutdown = on_shutdown
    functions = [
        job_resume_stuck_runs,
        job_expire_stale_approvals,
        job_pull_signals,
        job_verify_audit_chain,
    ]
    cron_jobs = [
        cron(job_resume_stuck_runs, minute=set(range(0, 60, 5))),  # every 5 min
        cron(job_expire_stale_approvals, minute={3}),  # hourly at :03
        cron(job_pull_signals, minute={7}),  # hourly at :07
        cron(job_verify_audit_chain, hour={4}, minute={15}),  # daily 04:15 UTC
    ]

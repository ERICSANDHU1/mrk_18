"""FastAPI application factory.

Injection-friendly: tests pass their own engine/graph; production builds both
from settings (Supabase session pooler + Groq free tier) inside the lifespan.
"""

import asyncio
import math
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncEngine

from ..config import get_settings
from ..db.engine import build_engine, build_session_factory
from ..security.headers import apply_security_headers
from ..security.logfilter import install_secret_scrubbing
from ..security.ratelimit import RateLimiter
from .connections import router as connections_router
from .intake import router as intake_router
from .privacy import router as privacy_router
from .review import router as review_router
from .runs import router as runs_router
from .webhooks import router as webhooks_router

if sys.platform == "win32":
    # psycopg async (LangGraph checkpointer) needs the selector loop on
    # Windows dev machines; production (Linux) is unaffected.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def create_app(engine: AsyncEngine | None = None, graph=None) -> FastAPI:
    settings = get_settings()

    # A1 — fail closed: in production, refuse to boot without the crypto keys
    # that keep auth, the token vault, and the publish gate from silently
    # degrading to fail-open. No-op in dev/test (APP_ENV unset → "dev").
    from ..security.startup import require_production_secrets

    require_production_secrets(settings)

    # C4 — Sentry (optional): absent DSN or absent sentry-sdk → no-op.
    if settings.sentry_dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(
                dsn=settings.sentry_dsn,
                environment=settings.app_env,
                release=settings.app_version,
                traces_sample_rate=0.0,
            )
        except Exception as exc:  # noqa: BLE001 — observability must never block boot
            import logging

            logging.getLogger("mrk18.execution").warning("sentry init skipped: %s", exc)

    if engine is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not configured — fill execution/.env")
        engine = build_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # re-apply scrubbing now that uvicorn has installed its handlers
        install_secret_scrubbing(exact_secrets=getattr(app.state, "secret_values", []))
        # C5 — warn loudly (never block) if the DB is behind its migrations.
        try:
            from ..db.schema_health import check_schema

            health = await check_schema(app.state.engine)
            if not health["ok"]:
                import logging

                logging.getLogger("mrk18.execution").critical(
                    "DB schema is BEHIND migrations — missing %s. Apply migrations before serving.",
                    health["missing"],
                )
        except Exception as exc:  # noqa: BLE001 — the health check must never block boot
            import logging

            logging.getLogger("mrk18.execution").warning("schema health check skipped: %s", exc)
        # Live CMO voice call — a SEPARATE, latency-first socket: always the fast
        # Groq path (never the cold-start Brain on a live call), and independent of
        # the analysis graph so the call works even if the checkpointer is down.
        app.state.voice_socket = None
        if settings.groq_api_key:
            try:
                from ..llm.socket import LLMSocket, default_registry

                app.state.voice_socket = LLMSocket(default_registry(settings.groq_api_key))
            except Exception as exc:  # noqa: BLE001 — voice is optional, never blocks boot
                import logging

                logging.getLogger("mrk18.execution").warning(
                    "CMO voice socket unavailable: %s", exc
                )
        pool = None
        if graph is not None:
            app.state.graph = graph
        elif settings.checkpointer_dsn and (settings.groq_api_key or settings.brain_base_url):
            # The analysis pipeline must never take down auth/intake/webhooks: if
            # the checkpointer DB is unreachable at boot, degrade to graph=None
            # (runs answer 503) instead of crashing the whole API.
            try:
                from ..graph.analysis import build_analysis_graph
                from ..graph.checkpointer import open_checkpointer
                from ..llm.images import SupabaseMediaStore, pick_engine
                from ..llm.socket import LLMSocket, brain_registry, default_registry

                pool, saver = await open_checkpointer(settings.checkpointer_dsn)
                # Phase 4 seam: Brain when configured, else the Groq pilot.
                registry = (
                    brain_registry(
                        settings.brain_base_url,
                        settings.brain_api_key,
                        settings.brain_base_model,
                    )
                    if settings.brain_base_url
                    else default_registry(settings.groq_api_key)
                )
                socket = LLMSocket(registry)
                app.state.llm_socket = socket  # Slice 3.4 — Comment Agent drafts here
                engine = pick_engine(settings)  # Cloudflare free > fal > none
                store = (
                    SupabaseMediaStore(settings.supabase_url, settings.supabase_service_key)
                    if settings.supabase_url and settings.supabase_service_key
                    else None
                )
                # Web-search grounding (Tavily) — None when no key → runs proceed
                # with no web context, exactly as before.
                researcher = None
                if settings.tavily_api_key:
                    from ..research.web import TavilyResearcher

                    researcher = TavilyResearcher(settings.tavily_api_key)
                app.state.graph = build_analysis_graph(
                    socket, saver, image_engine=engine, media_store=store, researcher=researcher
                )
            except Exception as exc:  # noqa: BLE001 — any boot failure degrades, never crashes
                import logging

                logging.getLogger("mrk18.execution").warning(
                    "analysis graph unavailable at startup — runs will answer 503 until the "
                    "checkpointer DB is reachable: %s",
                    exc,
                )
                if pool is not None:
                    try:
                        await pool.close()
                    except Exception:  # noqa: BLE001
                        pass
                    pool = None
                app.state.graph = None
        else:
            app.state.graph = None  # runs endpoints respond 503 with a clear message
        yield
        # cancel any in-flight background work (e.g. a Meta backfill) before teardown
        inflight = list(getattr(app.state, "background_tasks", ()) or ())
        for t in inflight:
            t.cancel()
        if inflight:
            await asyncio.gather(*inflight, return_exceptions=True)
        if pool is not None:
            await pool.close()

    app = FastAPI(title="MRK18 Execution API", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    app.state.background_tasks = set()
    app.state.is_prod = settings.is_prod  # A1 — publish endpoint goes strict in prod

    # S3 — scrub secrets from every log line (last line of defense). Called
    # again in the lifespan once uvicorn has configured its own handlers.
    app.state.secret_values = [
        settings.token_vault_key,
        settings.approval_signing_key,
        settings.maintenance_key,
        settings.groq_api_key,
        settings.fal_key,
        settings.supabase_service_key,
        settings.database_url,
        settings.checkpointer_dsn,
        settings.cf_api_token,
        settings.together_api_key,
        settings.langsmith_api_key,
        settings.clerk_webhook_secret,
        settings.brain_api_key,
        settings.tavily_api_key,
        settings.meta_app_secret,
    ]
    install_secret_scrubbing(exact_secrets=app.state.secret_values)

    # S1 — verify Supabase JWTs against the project JWKS. Unconfigured = fail
    # CLOSED: founder endpoints answer 503, never serve data unauthenticated.
    jwks_url = settings.auth_jwks_url or settings.supabase_jwks_url
    if jwks_url:
        from ..security.auth import JWTVerifier

        app.state.jwt_verifier = JWTVerifier(
            jwks_url,
            audience=settings.auth_audience or None,
            issuer=settings.auth_issuer or None,
        )
    else:
        app.state.jwt_verifier = None
    # S1 — run-scoped review links (the review page can't carry a Bearer header)
    app.state.review_token_key = settings.approval_signing_key or None
    # Slice 2.3 — same key signs ApprovalEvents + per-step publish tokens
    app.state.approval_signing_key = settings.approval_signing_key or None
    app.state.maintenance_key = settings.maintenance_key or None
    app.state.clerk_webhook_secret = settings.clerk_webhook_secret or None

    # S2 — token vault + OAuth providers (providers filled at go-live or by tests)
    if settings.token_vault_key:
        from ..security.vault import TokenVault

        app.state.vault = TokenVault(settings.token_vault_key)
    else:
        app.state.vault = None
    app.state.oauth_providers = {}
    app.state.oauth_transport = None
    # Meta (Facebook) ad-data connector — registered only when credentials exist,
    # so the "Connect Meta" button stays dormant (start → 503) until go-live.
    if settings.meta_app_id and settings.meta_app_secret:
        from ..security.oauth import ProviderConfig

        ver = settings.meta_api_version
        redirect_base = (settings.oauth_redirect_base or "").rstrip("/")
        app.state.oauth_providers["meta"] = ProviderConfig(
            platform="meta",
            authorize_url=f"https://www.facebook.com/{ver}/dialog/oauth",
            token_url=f"https://graph.facebook.com/{ver}/oauth/access_token",
            client_id=settings.meta_app_id,
            client_secret=settings.meta_app_secret,
            redirect_uri=f"{redirect_base}/oauth/callback",
        )

    # Slice 2.4 — perimeter: rate limits + security headers on every response.
    app.state.rate_limiter = (
        RateLimiter(default_per_min=settings.rate_limit_default_per_min)
        if settings.rate_limit_enabled
        else None
    )
    app.state.trust_proxy_headers = settings.trust_proxy_headers

    def _client_key(request: Request) -> str:
        if app.state.trust_proxy_headers:
            forwarded = request.headers.get("x-forwarded-for", "")
            if forwarded:
                # The RIGHTMOST hop is the IP our own proxy (Render) appended; a
                # leftmost value is attacker-supplied and must never key the limiter
                # (else a rotating X-Forwarded-For defeats every per-caller limit).
                return forwarded.split(",")[-1].strip()
        return request.client.host if request.client else "unknown"

    @app.middleware("http")
    async def perimeter(request: Request, call_next):
        limiter: RateLimiter | None = app.state.rate_limiter
        if limiter is not None and request.url.path != "/health":
            key = _client_key(request)
            allowed, retry_after, should_alert = limiter.check(
                key, request.method, request.url.path
            )
            if not allowed:
                if should_alert:  # once per cooldown — evidence, not spam
                    from ..audit.recorder import record
                    from ..schemas.enums import AuditEventType

                    async with app.state.session_factory() as session:
                        await record(
                            session,
                            event_type=AuditEventType.SECURITY_ALERT,
                            agent_id="system:perimeter",
                            outcome="rate_limit_exceeded",
                            detail={
                                "key": key,
                                "method": request.method,
                                "path": request.url.path,
                            },
                        )
                        await session.commit()
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "rate limit exceeded — slow down"},
                    headers={"Retry-After": str(math.ceil(retry_after))},
                )
                apply_security_headers(response.headers)
                return response
        response = await call_next(request)
        apply_security_headers(response.headers)
        return response

    # Slice 2.4 — the siren's go-live ear: security alerts → webhook, if set
    if settings.alert_webhook_url:
        import httpx

        from ..audit.recorder import register_alert_hook

        async def _webhook_alert(rec) -> None:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    settings.alert_webhook_url,
                    json={
                        "alert": rec.outcome,
                        "agent": rec.agent_id,
                        "founder_id": str(rec.founder_id) if rec.founder_id else None,
                        "run_id": str(rec.run_id) if rec.run_id else None,
                        "detail": rec.detail,
                    },
                )

        register_alert_hook(_webhook_alert)

    @app.get("/health")
    async def health() -> dict:
        # liveness only — deliberately cheap (no DB). Readiness is /readyz.
        return {"status": "ok", "version": settings.app_version}

    # Slice 3.1 — Eagle-View automated sources (filled at go-live; tests inject)
    app.state.signal_sources = {}
    # Slice 3.4 — Comment Agent: LLM socket + comment sources (tests inject both)
    if not hasattr(app.state, "llm_socket"):
        app.state.llm_socket = None
    app.state.comment_sources = {}

    # Slice 3.3 — Company Brain embeddings: BGE-M3 on Cloudflare's free tier,
    # SAME credentials as the free image engine. Unset → knowledge endpoints
    # answer 503 and runs simply proceed without retrieved knowledge.
    if settings.cf_account_id and settings.cf_api_token:
        from ..llm.embeddings import CloudflareEmbeddingEngine

        app.state.embedding_engine = CloudflareEmbeddingEngine(
            settings.cf_account_id, settings.cf_api_token
        )
    else:
        app.state.embedding_engine = None

    from .analytics import router as analytics_router
    from .chats import router as chats_router
    from .cmo import router as cmo_router
    from .comments import router as comments_router
    from .knowledge import router as knowledge_router
    from .meta import router as meta_router
    from .ops import router as ops_router
    from .signals import router as signals_router

    app.include_router(intake_router)
    app.include_router(runs_router)
    app.include_router(meta_router)
    app.include_router(ops_router)
    app.include_router(review_router)
    app.include_router(connections_router)
    app.include_router(privacy_router)
    app.include_router(signals_router)
    app.include_router(knowledge_router)
    app.include_router(analytics_router)
    app.include_router(comments_router)
    app.include_router(cmo_router)
    app.include_router(chats_router)
    app.include_router(webhooks_router)

    # CORS — added last so it's the OUTERMOST middleware (handles browser
    # preflight cleanly, before rate limiting). Empty origins → no CORS, so
    # server-to-server stays locked down by default.
    origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    if origins:
        from fastapi.middleware.cors import CORSMiddleware

        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    return app

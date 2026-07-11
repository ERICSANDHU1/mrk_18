"""Environment-driven settings. Every secret comes from .env / the platform
secret store — never hardcoded, never committed."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Runtime environment. "prod" activates the A1 fail-closed startup guard
    # (refuse to boot without the mandatory crypto keys). Dev/test default skips
    # it so local runs and CI boot without the production secret set.
    app_env: str = "dev"  # "dev" | "prod"

    # Database (Supabase session pooler, port 5432 — never 6543)
    database_url: str = ""
    checkpointer_dsn: str = ""

    # Supabase services
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_jwks_url: str = ""

    # Auth — generic JWT verification (Clerk, Supabase, any OIDC). Falls back to
    # supabase_jwks_url when auth_jwks_url is unset.
    auth_jwks_url: str = ""  # e.g. https://<your-clerk-subdomain>.clerk.accounts.dev/.well-known/jwks.json
    auth_audience: str = ""  # default: skip aud check (Clerk session tokens omit aud). Set "authenticated" for Supabase.
    auth_issuer: str = ""  # verify iss when set — recommended for Clerk (your Frontend API URL)

    # CORS — comma-separated browser origins allowed to call the API
    cors_allow_origins: str = ""  # e.g. http://localhost:3000,https://app.mrk18.com

    # LLM providers (Slice 1.3)
    together_api_key: str = ""
    groq_api_key: str = ""

    # Phase 4 — the trained Brain (vLLM multi-LoRA, OpenAI-compatible). Set
    # brain_base_url to repoint every role from the Groq pilot to the Brain;
    # role -> adapter names live in llm/socket.BRAIN_ADAPTERS.
    brain_base_url: str = ""
    brain_api_key: str = ""
    brain_base_model: str = "qwen3-32b"

    # Web-search grounding (research/web.py) — Tavily free tier. When set, the
    # router fetches real, current context on the brand + each named competitor
    # before the analysis agents run. Unset → runs proceed with no web context.
    tavily_api_key: str = ""

    # Free taster (public POST /taster) — the no-signup URL analysis in the
    # landing hero. Served by a DEDICATED RunPod Serverless vLLM endpoint
    # (Mistral-7B base + 4 LoRA adapters: usp, differentiation, brand_analysis,
    # personality), separate from the main Brain so free traffic can never
    # starve paying founders. Unset → /taster answers 503 in prod and a clearly
    # labeled sample in dev, so the feature ships dormant. See TASTER_SETUP.md.
    taster_base_url: str = ""  # empty = Groq; or e.g. https://api.runpod.ai/v2/<id>/openai/v1
    taster_api_key: str = ""  # empty = fall back to groq_api_key (server-side only)
    # One model serves all 4 verdicts, differentiated by the specialist prompts.
    # EMPTY string switches to multi-LoRA adapter mode (model name = adapter name,
    # for the future RunPod endpoint) and skips the competitor web-research step.
    taster_model: str = "openai/gpt-oss-120b"
    taster_max_competitors: int = 3  # per-analysis Tavily budget guard
    taster_daily_per_ip: int = 3  # free analyses per IP per UTC day (0 disables the cap)
    # Global fresh-analysis budget per UTC day (0 disables) — the wall that keeps
    # the Groq TPD and the Tavily monthly credits from being drained by strangers:
    # ~4k Groq tokens + ~6 Tavily credits per FRESH analysis; cache hits are free.
    taster_daily_global: int = 50
    taster_cache_ttl_hours: int = 72  # per-domain result reuse window (fresh-ness matters little)
    taster_max_tokens: int = 380  # per-adapter output cap — the GPU-cost guard

    # Images (Slice 1.4) — engine picked by available credentials:
    # Cloudflare (free tier) > fal.ai (paid, production) > none (posts ship text-only)
    cf_account_id: str = ""
    cf_api_token: str = ""
    fal_key: str = ""

    # Meta (Facebook) Marketing API — read-only ad-data connector (ads_read).
    # Unset → the "Connect Meta" provider is simply not registered and the start
    # endpoint answers 503, so the whole feature ships dormant until you paste
    # your Meta app credentials. App Review only matters for non-tester users.
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_api_version: str = "v23.0"  # pin a version; bump deliberately
    # Public base URL of THIS backend — used to build the OAuth redirect_uri Meta
    # calls back (must match a Valid OAuth Redirect URI in the Meta app):
    # https://mrk18.onrender.com → redirect_uri https://mrk18.onrender.com/oauth/callback.
    # Defaulted so you don't have to set it in Render; override via env if the
    # backend ever moves.
    oauth_redirect_base: str = "https://mrk18.onrender.com"
    # Where the callback sends the browser after a successful connect. e.g.
    # https://app.mrk18.com — unset keeps the legacy JSON response (tests rely on it).
    web_base_url: str = ""

    # Observability
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""
    langsmith_project: str = "mrk18-execution"
    sentry_dsn: str = ""  # C4 — absent DSN (or absent sentry-sdk) = Sentry no-op
    app_version: str = "0.1.0"  # surfaced in /health + as the Sentry release

    # Worker (C3) — ARQ on Redis (Upstash free tier works). Only the worker
    # process needs this; the API never touches Redis.
    redis_url: str = "redis://localhost:6379"

    # Security (Phase 2)
    approval_signing_key: str = ""
    token_vault_key: str = ""
    maintenance_key: str = ""  # ops endpoints (cron) — not founder-facing
    clerk_webhook_secret: str = ""  # Svix signing secret for Clerk webhooks (whsec_…)
    # Company Brain (Slice 3.3 — free-tier MVP cap; raise with the Pro plan)
    knowledge_max_chunks: int = 1500

    # Perimeter (Slice 2.4)
    rate_limit_enabled: bool = True
    rate_limit_default_per_min: int = 240
    trust_proxy_headers: bool = False  # ONLY behind a proxy (Render/CF), never before
    alert_webhook_url: str = ""  # security_alert siren → POST here (Slack/ntfy/...)

    # Cost governance (A5). Caps are against metered ("would-be") INR cost; 0
    # disables a cap. Free tier meters but bills ₹0, so defaults are generous.
    run_cost_cap_inr: float = 50.0  # abort a single run once it crosses this
    daily_cost_cap_inr: float = 500.0  # refuse new runs once a founder's day exceeds this

    @property
    def is_prod(self) -> bool:
        """True in production — gates the A1 fail-closed startup guard."""
        return self.app_env.strip().lower() in {"prod", "production"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

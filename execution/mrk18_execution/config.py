"""Environment-driven settings. Every secret comes from .env / the platform
secret store — never hardcoded, never committed."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database (Supabase session pooler, port 5432 — never 6543)
    database_url: str = ""
    checkpointer_dsn: str = ""

    # Supabase services
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_jwks_url: str = ""

    # LLM providers (Slice 1.3)
    together_api_key: str = ""
    groq_api_key: str = ""

    # Images (Slice 1.4) — engine picked by available credentials:
    # Cloudflare (free tier) > fal.ai (paid, production) > none (posts ship text-only)
    cf_account_id: str = ""
    cf_api_token: str = ""
    fal_key: str = ""

    # Observability
    langsmith_tracing: bool = False
    langsmith_api_key: str = ""
    langsmith_project: str = "mrk18-execution"

    # Security (Phase 2)
    approval_signing_key: str = ""
    token_vault_key: str = ""
    maintenance_key: str = ""  # ops endpoints (cron) — not founder-facing
    # Perimeter (Slice 2.4)
    rate_limit_enabled: bool = True
    rate_limit_default_per_min: int = 240
    trust_proxy_headers: bool = False  # ONLY behind a proxy (Render/CF), never before
    alert_webhook_url: str = ""  # security_alert siren → POST here (Slack/ntfy/...)


@lru_cache
def get_settings() -> Settings:
    return Settings()

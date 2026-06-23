"""A1 — the fail-closed startup guard.

In prod the API must refuse to boot without its mandatory crypto keys; in dev it
boots freely. Pure unit tests over require_production_secrets plus a create_app
boot check with settings monkeypatched — no DB needed, because the guard runs
before any engine work.
"""

from types import SimpleNamespace

import pytest

from mrk18_execution.security.startup import (
    InsecureBootError,
    missing_production_secrets,
    require_production_secrets,
)


def _settings(*, is_prod, jwks="", supa_jwks="", vault="", approval=""):
    return SimpleNamespace(
        is_prod=is_prod,
        app_env="prod" if is_prod else "dev",
        auth_jwks_url=jwks,
        supabase_jwks_url=supa_jwks,
        token_vault_key=vault,
        approval_signing_key=approval,
    )


def test_dev_boots_without_any_secrets():
    # default dev: missing everything is fine
    require_production_secrets(_settings(is_prod=False))


def test_prod_with_all_secrets_ok():
    require_production_secrets(
        _settings(is_prod=True, jwks="https://x/jwks", vault="k1", approval="k2")
    )


def test_prod_missing_all_raises_and_lists_each():
    with pytest.raises(InsecureBootError) as exc:
        require_production_secrets(_settings(is_prod=True))
    msg = str(exc.value)
    assert "AUTH_JWKS_URL" in msg
    assert "TOKEN_VAULT_KEY" in msg
    assert "APPROVAL_SIGNING_KEY" in msg


def test_prod_missing_only_one_is_reported():
    s = _settings(is_prod=True, jwks="https://x/jwks", vault="k1", approval="")
    assert missing_production_secrets(s) == ["APPROVAL_SIGNING_KEY"]
    with pytest.raises(InsecureBootError):
        require_production_secrets(s)


def test_supabase_jwks_satisfies_auth_requirement():
    # either the generic OIDC JWKS or the Supabase one counts
    require_production_secrets(
        _settings(is_prod=True, supa_jwks="https://p.supabase.co/jwks", vault="k", approval="k")
    )


def test_create_app_refuses_insecure_prod_boot(monkeypatch):
    """create_app must raise before touching the DB when prod lacks keys."""
    import mrk18_execution.api.app as appmod

    bad = SimpleNamespace(
        is_prod=True,
        app_env="prod",
        auth_jwks_url="",
        supabase_jwks_url="",
        token_vault_key="",
        approval_signing_key="",
        database_url="",  # never reached — the guard fires first
    )
    monkeypatch.setattr(appmod, "get_settings", lambda: bad)
    with pytest.raises(InsecureBootError):
        appmod.create_app()

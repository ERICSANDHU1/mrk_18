"""A1 — fail-closed startup guard.

Production must refuse to boot without the crypto keys that make the API's core
guarantees real. Each missing key silently downgrades a guard to fail-OPEN:

  * AUTH_JWKS_URL        — without it JWT verification can't run; founder
                           endpoints would have no verified caller.
  * TOKEN_VAULT_KEY      — the envelope key for platform OAuth tokens at rest;
                           without it the vault can't seal/open and connections
                           can't be used.
  * APPROVAL_SIGNING_KEY — signs ApprovalEvents, review links, and the per-step
                           publish tokens. Without it the publish gate skips its
                           signature checks (publishers/base.verify_approval and
                           security/steptokens.require_publish_token both
                           fail OPEN when the key is unset).

In dev/test (APP_ENV unset → "dev") the check is a no-op, so local runs and CI
boot without the full production secret set.
"""

from __future__ import annotations


class InsecureBootError(RuntimeError):
    """Raised when a production boot is missing a mandatory crypto key."""


# name → "is this secret present?" — AUTH_JWKS_URL is satisfied by either the
# generic Clerk/OIDC JWKS or the Supabase one (the app falls back between them).
_REQUIRED_PROD_SECRETS = {
    "AUTH_JWKS_URL": lambda s: bool(
        (s.auth_jwks_url or "").strip() or (s.supabase_jwks_url or "").strip()
    ),
    "TOKEN_VAULT_KEY": lambda s: bool((s.token_vault_key or "").strip()),
    "APPROVAL_SIGNING_KEY": lambda s: bool((s.approval_signing_key or "").strip()),
}


def missing_production_secrets(settings) -> list[str]:
    """The mandatory secrets that are unset (order matches _REQUIRED_PROD_SECRETS)."""
    return [name for name, present in _REQUIRED_PROD_SECRETS.items() if not present(settings)]


def require_production_secrets(settings) -> None:
    """Fail closed: in prod, raise if any mandatory crypto key is unset.

    No-op when ``settings.is_prod`` is False (dev/test)."""
    if not getattr(settings, "is_prod", False):
        return
    missing = missing_production_secrets(settings)
    if missing:
        raise InsecureBootError(
            "refusing to boot in production without: "
            + ", ".join(missing)
            + ". These are not optional in prod — a missing key silently "
            "downgrades auth, the token vault, or the publish gate to fail-open. "
            "Set them in the environment (see execution/.env.example)."
        )

"""Shared auth helpers for tests — REAL ES256 tokens against a static JWKS.

No mocking of the verifier: tests sign genuine JWTs with a test keypair and
the app verifies them through the same code path production uses (only the
key source differs — static JWKS instead of the Supabase endpoint).
"""

import time
from uuid import UUID, uuid4

import jwt
from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key

from mrk18_execution.security.auth import JWTVerifier

KID = "test-key-1"
_PRIVATE_KEY = generate_private_key(SECP256R1())

# a second, untrusted keypair — for forging "valid-looking" tokens in attacks
_ROGUE_KEY = generate_private_key(SECP256R1())

REVIEW_TOKEN_KEY = "test-review-signing-key"
MAINTENANCE_KEY = "test-maintenance-key"


def jwks() -> dict:
    entry = jwt.algorithms.ECAlgorithm.to_jwk(_PRIVATE_KEY.public_key(), as_dict=True)
    entry.update({"kid": KID, "alg": "ES256", "use": "sig"})
    return {"keys": [entry]}


def mint(
    sub: UUID | str | None = None,
    email: str | None = None,
    *,
    audience: str = "authenticated",
    expires_in: int = 3600,
    kid: str = KID,
    key=None,
    alg: str = "ES256",
) -> str:
    claims = {
        "sub": str(sub or uuid4()),
        "aud": audience,
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time()),
    }
    if email:
        claims["email"] = email
    return jwt.encode(claims, key or _PRIVATE_KEY, algorithm=alg, headers={"kid": kid})


def mint_rogue(sub: UUID | str | None = None) -> str:
    """A structurally perfect token signed by a key Supabase never published."""
    return mint(sub, key=_ROGUE_KEY, kid="rogue-key")


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def install_auth(app) -> None:
    """Wire the static-JWKS verifier + signing keys into a test app."""
    app.state.jwt_verifier = JWTVerifier(static_jwks=jwks())
    app.state.review_token_key = REVIEW_TOKEN_KEY
    app.state.approval_signing_key = REVIEW_TOKEN_KEY  # one key in prod too
    app.state.maintenance_key = MAINTENANCE_KEY

"""S1 — verify Supabase Auth JWTs against the project JWKS.

The browser is never trusted: every founder-scoped request must carry
``Authorization: Bearer <jwt>`` minted by Supabase Auth. We verify the
signature (asymmetric ES256/RS256 keys fetched from the JWKS endpoint),
expiry and audience server-side. The legacy HS256 shared-secret pattern is
deliberately NOT supported (SYSTEM_ARCHITECTURE §5) — a token whose header
names any other algorithm is rejected before key lookup, which also closes
the classic alg-confusion attack.

Keys are cached in-process; refetches are rate-limited so a forged `kid`
cannot make us hammer the JWKS endpoint.
"""

import time

import httpx
import jwt

ALLOWED_ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"  # Supabase sets aud=authenticated for signed-in users
_REFETCH_COOLDOWN_S = 30.0


class AuthError(Exception):
    """Token could not be verified. Message is safe to return to the caller."""


class JWTVerifier:
    def __init__(
        self,
        jwks_url: str | None = None,
        *,
        static_jwks: dict | None = None,
        cache_ttl_s: float = 600.0,
    ) -> None:
        if not jwks_url and static_jwks is None:
            raise ValueError("JWTVerifier needs a jwks_url or a static JWKS")
        self._url = jwks_url
        self._ttl = cache_ttl_s
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._last_attempt = 0.0
        if static_jwks is not None:
            self._load(static_jwks)
            self._fetched_at = float("inf")  # static keys never go stale

    def _load(self, jwks: dict) -> None:
        keys = {}
        for entry in jwks.get("keys", []):
            try:
                key = jwt.PyJWK.from_dict(entry)
            except jwt.PyJWKError:
                continue  # an unusable key must not break the usable ones
            if key.key_id:
                keys[key.key_id] = key
        self._keys = keys

    async def _refresh(self) -> None:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(self._url)
            resp.raise_for_status()
            self._load(resp.json())
        self._fetched_at = time.monotonic()

    async def _key_for(self, kid: str) -> jwt.PyJWK:
        now = time.monotonic()
        stale = now - self._fetched_at > self._ttl
        if self._url and (kid not in self._keys or stale):
            if now - self._last_attempt > _REFETCH_COOLDOWN_S or not self._keys:
                self._last_attempt = now
                try:
                    await self._refresh()
                except httpx.HTTPError as exc:
                    if not self._keys:  # nothing cached → cannot verify anything
                        raise AuthError("signing keys unavailable") from exc
        key = self._keys.get(kid)
        if key is None:
            raise AuthError("token signed with an unknown key")
        return key

    async def verify(self, token: str) -> dict:
        """Return the verified claims, or raise AuthError. Never trusts the header."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as exc:
            raise AuthError("malformed token") from exc
        if header.get("alg") not in ALLOWED_ALGORITHMS:
            raise AuthError("token algorithm not allowed")
        key = await self._key_for(header.get("kid", ""))
        try:
            return jwt.decode(
                token,
                key=key.key,
                algorithms=ALLOWED_ALGORITHMS,
                audience=AUDIENCE,
                options={"require": ["exp", "sub"]},
            )
        except jwt.InvalidTokenError as exc:
            raise AuthError(str(exc) or "invalid token") from exc

"""S1 — run-scoped review-link tokens.

The spartan review page is opened by browser navigation, which cannot carry an
Authorization header. Instead the founder's dashboard (or, for the pilot, the
runs API) mints a signed link: ``/review/{run_id}?t=<exp>.<hmac>``. The token
is a capability — it grants gate decisions on exactly ONE run, expires, and is
useless on any other run or after tampering. Signed with the approval signing
key; verified with a constant-time compare.
"""

import hashlib
import hmac
import time
from uuid import UUID

DEFAULT_TTL_S = 48 * 3600  # matches the approval-expiry window (silence = rejection)


def _sign(key: str, run_id: UUID | str, exp: int) -> str:
    msg = f"review:{run_id}:{exp}".encode()
    return hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()


def mint_review_token(key: str, run_id: UUID | str, ttl_s: int = DEFAULT_TTL_S) -> str:
    exp = int(time.time()) + ttl_s
    return f"{exp}.{_sign(key, run_id, exp)}"


def verify_review_token(key: str, run_id: UUID | str, token: str) -> bool:
    exp_part, _, sig = token.partition(".")
    if not exp_part.isdigit() or not sig:
        return False
    exp = int(exp_part)
    if time.time() > exp:
        return False
    return hmac.compare_digest(sig, _sign(key, run_id, exp))

"""Verify Clerk webhook signatures (Svix scheme) — no third-party dep.

Clerk signs each webhook with Svix: HMAC-SHA256 over ``{id}.{timestamp}.{body}``
keyed by the base64 part of the ``whsec_…`` secret. We verify the signature and
a timestamp tolerance before trusting a single byte of the payload — the
webhook is unauthenticated by JWT, so the signature IS the credential.
"""

import base64
import hashlib
import hmac
import time


class WebhookError(Exception):
    """The webhook could not be verified. Message is safe to surface."""


def verify_svix(
    secret: str,
    *,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    body: bytes,
    tolerance_s: int = 300,
) -> None:
    """Raise WebhookError unless the Svix signature over (id.ts.body) is valid."""
    if not (svix_id and svix_timestamp and svix_signature):
        raise WebhookError("missing svix headers")
    try:
        ts = int(svix_timestamp)
    except ValueError as exc:
        raise WebhookError("bad timestamp") from exc
    if abs(time.time() - ts) > tolerance_s:
        raise WebhookError("timestamp outside tolerance")

    key = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    try:
        secret_bytes = base64.b64decode(key)
    except Exception as exc:  # noqa: BLE001 — any malformed secret is a config error
        raise WebhookError("malformed signing secret") from exc

    signed = svix_id.encode() + b"." + svix_timestamp.encode() + b"." + body
    expected = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()

    # the header is a space-separated list of "v1,<sig>" entries
    for part in svix_signature.split():
        _, _, sig = part.partition(",")
        if sig and hmac.compare_digest(sig, expected):
            return
    raise WebhookError("no matching signature")

"""Slice 2.4 — security response headers: the browser becomes an ally.

Applied to every response by middleware. Endpoint-set headers win (the review
page sets its own nonce-based CSP), so everything here is set-if-absent.
"""

SECURITY_HEADERS: dict[str, str] = {
    # refuse downgrade-to-HTTP once on TLS (harmless on plain-HTTP dev)
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    # never MIME-sniff a response into something executable
    "X-Content-Type-Options": "nosniff",
    # API responses execute nothing and may not be framed (no clickjacking)
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    # review links carry capability tokens in the URL — never leak via Referer
    "Referrer-Policy": "no-referrer",
    # founder data must not linger in shared browser/proxy caches
    "Cache-Control": "no-store",
}


def apply_security_headers(headers) -> None:
    """set-if-absent onto a (Mutable)Headers mapping."""
    for name, value in SECURITY_HEADERS.items():
        if name not in headers:
            headers[name] = value

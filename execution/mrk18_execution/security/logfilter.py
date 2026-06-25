"""S3 — secret scrubbing for logs.

"Tokens NEVER logged, never sent to the frontend, never plaintext" (Sheet 11).
Scrubbing happens in a Formatter wrapper so it operates on the FULLY rendered
line — message AND traceback — and is attached to the handlers that actually
emit (root + uvicorn/httpx/openai), so records from sub-loggers are covered.
A record-level filter is layered on top as defense-in-depth.

Patterns: Fernet/vault blobs (gAAAA…), Bearer tokens, key=value secrets,
OAuth code/state, DSN userinfo passwords, fal-style id:secret keys, plus any
exact configured secret value registered at startup.
"""

import logging
import re

_PATTERNS = [
    re.compile(r"gAAAA[A-Za-z0-9_\-]{16,}"),  # Fernet token / wrapped DEK
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{8,}", ),
    re.compile(
        r"(?i)\b(access_token|refresh_token|api[_-]?key|client_secret|password|"
        r"code_verifier|code|state|[a-z0-9_]*token|[a-z0-9_]*secret)\b\s*[=:]\s*[\"']?[A-Za-z0-9._\-]{6,}"
    ),
    re.compile(r"(?i)[?&](code|state|[a-z0-9_]*token)=[^&\s\"']+"),  # OAuth/Graph query params
    re.compile(r"(://[^:@/\s]+:)[^@/\s]+(@)"),  # DSN userinfo password
    re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}\b"),  # fal id:secret
    re.compile(r"\bgsk_[A-Za-z0-9]{20,}\b"),  # Groq key
]
_REDACTION = "«redacted»"


class _Scrubber:
    def __init__(self, exact_secrets: list[str] | None = None):
        self._exact = sorted(
            {s for s in (exact_secrets or []) if s and len(s) >= 6}, key=len, reverse=True
        )

    def scrub(self, text: str) -> str:
        if not text:
            return text
        for secret in self._exact:
            if secret in text:
                text = text.replace(secret, _REDACTION)
        for pat in _PATTERNS:
            # keep the leading group for DSN / key=value forms
            if pat.groups and pat.pattern.startswith("(://"):
                text = pat.sub(r"\1" + _REDACTION + r"\2", text)
            else:
                text = pat.sub(_REDACTION, text)
        return text


class SecretScrubFilter(logging.Filter):
    """Record-level scrub of message, args, and any rendered traceback."""

    def __init__(self, scrubber: _Scrubber | None = None, exact_secrets=None):
        super().__init__()
        self._scrubber = scrubber or _Scrubber(exact_secrets)

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 — never let logging crash the app
            return True
        scrubbed = self._scrubber.scrub(message)
        if scrubbed != message:
            record.msg = scrubbed
            record.args = ()
        if record.exc_text:  # already-rendered traceback
            record.exc_text = self._scrubber.scrub(record.exc_text)
        return True


class _ScrubFormatter(logging.Formatter):
    """Wraps another formatter; scrubs its fully rendered output (incl. traceback)."""

    def __init__(self, inner: logging.Formatter, scrubber: _Scrubber):
        super().__init__()
        self._inner = inner
        self._scrubber = scrubber

    def format(self, record: logging.LogRecord) -> str:
        return self._scrubber.scrub(self._inner.format(record))


_SCRUBBED_LOGGERS = (
    "",  # root
    "uvicorn",
    "uvicorn.error",
    "uvicorn.access",
    "httpx",
    "httpcore",
    "openai",
    "mrk18",
)


def install_secret_scrubbing(exact_secrets: list[str] | None = None) -> SecretScrubFilter:
    """Attach scrubbing to root + known noisy loggers. Safe to call repeatedly
    (e.g. at app build AND in the server lifespan after uvicorn configures
    logging) — formatters are only wrapped once."""
    scrubber = _Scrubber(exact_secrets)
    flt = SecretScrubFilter(scrubber)

    for name in _SCRUBBED_LOGGERS:
        lg = logging.getLogger(name) if name else logging.getLogger()
        if flt not in lg.filters:
            lg.addFilter(flt)
        for handler in lg.handlers:
            if not isinstance(handler.formatter, _ScrubFormatter):
                handler.setFormatter(
                    _ScrubFormatter(handler.formatter or logging.Formatter(), scrubber)
                )
            if flt not in handler.filters:
                handler.addFilter(flt)

    root = logging.getLogger()
    if not root.handlers:  # guarantee at least one scrubbing sink exists
        h = logging.StreamHandler()
        h.setFormatter(_ScrubFormatter(logging.Formatter(), scrubber))
        h.addFilter(flt)
        root.addHandler(h)
    return flt

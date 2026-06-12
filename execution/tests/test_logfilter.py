"""Slice 2.2 — secret scrubbing: tokens must never survive into a log line."""

import io
import logging

from cryptography.fernet import Fernet

from mrk18_execution.security.logfilter import (
    SecretScrubFilter,
    _Scrubber,
    install_secret_scrubbing,
)


def _scrub(text, exact=None):
    f = SecretScrubFilter(_Scrubber(exact))
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, text, None, None)
    f.filter(rec)
    return rec.getMessage()


def test_fernet_ciphertext_redacted():
    token = Fernet(Fernet.generate_key()).encrypt(b"secret").decode()
    out = _scrub(f"storing token {token} for founder")
    assert token not in out
    assert "«redacted»" in out


def test_bearer_header_redacted():
    out = _scrub("Authorization: Bearer AQXabc123def456ghi")
    assert "AQXabc123def456ghi" not in out


def test_keyvalue_secret_redacted():
    out = _scrub("connecting with access_token=sk-live-9f8e7d6c5b4a refresh_token=rt-12345678")
    assert "sk-live-9f8e7d6c5b4a" not in out
    assert "rt-12345678" not in out


def test_exact_configured_secret_redacted():
    secret = "TiYlG7B2UFy86sbA8EkahoKrusr2wpetREC-AavhK4E"
    out = _scrub(f"master key is {secret} oops", exact=[secret])
    assert secret not in out


def test_ordinary_text_untouched():
    msg = "run 1ad1924d completed: 3 items approved, cost Rs.0.24"
    assert _scrub(msg) == msg


def test_empty_exact_secrets_ignored():
    # blank env values must not cause everything to be redacted
    out = _scrub("a perfectly normal message", exact=["", "x"])
    assert out == "a perfectly normal message"


def test_dsn_password_redacted():
    out = _scrub("connecting postgresql+asyncpg://postgres.abc:Sup3rS3cret@host:5432/db")
    assert "Sup3rS3cret" not in out


def test_oauth_code_query_redacted():
    out = _scrub("GET /oauth/callback?state=abc123def&code=AQXsecretauthcode99 HTTP/1.1")
    assert "AQXsecretauthcode99" not in out


def test_groq_and_fal_keys_redacted():
    out = _scrub("using gsk_abcdefghij1234567890XYZ and 7a3dd702-34b7-45fe-9f39-c5dc3d55b584:1a0798ef09d627b98487202c5292db37")
    assert "gsk_abcdefghij1234567890XYZ" not in out
    assert "1a0798ef09d627b98487202c5292db37" not in out


def test_traceback_is_scrubbed_via_handler():
    """A secret inside an exception traceback, logged from a SUB-logger and
    emitted through a root handler, is redacted (the real-world leak vector)."""
    root = logging.getLogger()
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    root.addHandler(handler)
    old_level = root.level
    root.setLevel(logging.INFO)
    try:
        install_secret_scrubbing(exact_secrets=["TOPSECRETVALUE123"])
        child = logging.getLogger("scrubtest.child")  # propagates to root
        try:
            raise ValueError("boom with TOPSECRETVALUE123 inside")
        except ValueError:
            child.exception("operation failed")
        output = buf.getvalue()
        assert "TOPSECRETVALUE123" not in output
        assert "«redacted»" in output
    finally:
        root.removeHandler(handler)
        root.setLevel(old_level)

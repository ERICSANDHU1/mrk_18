"""S2 — minimum-scope policy as code (PRD Sheet 11):

    "Minimum scopes only (post + read comments — never delete, DM, follow,
     settings)."

A connection request asking for anything beyond the allowlist is refused
BEFORE any token is stored — over-privileged tokens can never enter the vault.
"""

# Per platform: the ONLY scopes MRK18 will ever hold (research-verified names).
ALLOWED_SCOPES: dict[str, frozenset[str]] = {
    "linkedin": frozenset({
        "w_member_social",   # post + comment on behalf of the member
        "openid",            # identity
        "profile",           # display name for the UI
    }),
    "x": frozenset({
        "tweet.read",
        "tweet.write",
        "users.read",
        "offline.access",    # refresh token (X tokens are short-lived)
    }),
    "instagram": frozenset({
        "instagram_business_basic",
        "instagram_business_content_publish",
        "instagram_business_manage_comments",  # read/reply comments (Phase 3)
    }),
    "meta": frozenset({
        "ads_read",  # READ ad insights only — never ads_management (no create/edit)
    }),
}

# Scopes we refuse on sight, with the reason (defense-in-depth + clear errors).
FORBIDDEN_HINTS = ("delete", "dm", "direct_message", "follow", "settings", "admin", "manage_pages")


class ScopeViolation(Exception):
    pass


def validate_scopes(platform: str, requested: list[str]) -> list[str]:
    """Return the validated scope list, or raise ScopeViolation."""
    allowed = ALLOWED_SCOPES.get(platform)
    if allowed is None:
        raise ScopeViolation(f"unknown platform: {platform}")
    cleaned = [s.strip() for s in requested if s.strip()]
    for scope in cleaned:
        lowered = scope.lower()
        if any(hint in lowered for hint in FORBIDDEN_HINTS):
            raise ScopeViolation(
                f"scope '{scope}' is forbidden by policy (never delete/DM/follow/settings)"
            )
        if scope not in allowed:
            raise ScopeViolation(
                f"scope '{scope}' exceeds the minimum-scope policy for {platform} "
                f"(allowed: {sorted(allowed)})"
            )
    return cleaned


def default_scopes(platform: str) -> list[str]:
    return sorted(ALLOWED_SCOPES[platform])

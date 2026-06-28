"""Shared enumerations for all contracts.

NOTE: ApprovalDecision deliberately has no bulk/approve-all member —
"no Approve All" is a product rule (PRD v2.0, Sheet 9) enforced at the type level.
"""

from enum import Enum


class Platform(str, Enum):
    LINKEDIN = "linkedin"
    X = "x"
    INSTAGRAM = "instagram"
    META = "meta"  # Facebook/Meta ad account — read-only ads_read (analytics, not posting)


class ContentFormat(str, Enum):
    LINKEDIN_POST = "linkedin_post"
    X_SINGLE = "x_single"
    X_THREAD = "x_thread"
    IG_CAPTION = "ig_caption"
    REEL_SCRIPT = "reel_script"  # short-form VIDEO script (Reels/Shorts) — the script adapter


class ContentStatus(str, Enum):
    DRAFT = "draft"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"  # silence = rejection (gate timeout job)
    PUBLISHED = "published"
    EXPORTED = "exported"
    FAILED = "failed"


class ApprovalDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RunStatus(str, Enum):
    GENERATING = "generating"
    AWAITING_GATE1 = "awaiting_gate1"
    GENERATING_CONTENT = "generating_content"
    AWAITING_GATE2 = "awaiting_gate2"
    PUBLISHING = "publishing"
    DONE = "done"
    FAILED = "failed"


class PublishStatus(str, Enum):
    PUBLISHED = "published"
    QUEUED_MANUAL = "queued_manual"  # IG ops queue — result completes asynchronously
    EXPORTED = "exported"
    RETRYABLE = "retryable"
    FAILED = "failed"


class Visibility(str, Enum):
    PUBLIC = "PUBLIC"
    CONNECTIONS = "CONNECTIONS"  # LinkedIn only


class WindowPoint(str, Enum):
    H1 = "1h"
    H6 = "6h"
    H24 = "24h"
    H72 = "72h"
    D7 = "7d"


class AuditEventType(str, Enum):
    RUN_STARTED = "run_started"
    AGENT_ACTION = "agent_action"
    GATE_DECISION = "gate_decision"
    PUBLISH = "publish"
    EXPORT = "export"
    OPS_TASK = "ops_task"
    ERROR = "error"
    SECURITY_ALERT = "security_alert"

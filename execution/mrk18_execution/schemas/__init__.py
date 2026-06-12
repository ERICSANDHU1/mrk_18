"""MRK18 data contracts — the spine of the execution system.

RULE: this package imports nothing from the rest of mrk18_execution.
Everything depends on schemas; schemas depend on nothing.
"""

from .approval import ApprovalEvent
from .audit import AuditRecord
from .constraints import PLATFORM_CONSTRAINTS, validate_body, validate_media
from .content import (
    ALLOWED_TRANSITIONS,
    MAX_REGENERATIONS,
    ContentItem,
    MediaSpec,
    can_transition,
)
from .enums import (
    ApprovalDecision,
    AuditEventType,
    Confidence,
    ContentFormat,
    ContentStatus,
    Platform,
    PublishStatus,
    RunStatus,
    Visibility,
    WindowPoint,
)
from .founder import ConsentRecord, FounderProfile
from .publishing import PublishError, PublishRequest, PublishResult
from .report import Claim, MarketingIntelligenceReport, ReportSection
from .run import RunMeta
from .signals import SignalRecord

__all__ = [
    "ALLOWED_TRANSITIONS",
    "MAX_REGENERATIONS",
    "PLATFORM_CONSTRAINTS",
    "ApprovalDecision",
    "ApprovalEvent",
    "AuditEventType",
    "AuditRecord",
    "Claim",
    "Confidence",
    "ConsentRecord",
    "ContentFormat",
    "ContentItem",
    "ContentStatus",
    "FounderProfile",
    "MarketingIntelligenceReport",
    "MediaSpec",
    "Platform",
    "PublishError",
    "PublishRequest",
    "PublishResult",
    "PublishStatus",
    "ReportSection",
    "RunMeta",
    "RunStatus",
    "SignalRecord",
    "Visibility",
    "WindowPoint",
    "can_transition",
    "validate_body",
    "validate_media",
]

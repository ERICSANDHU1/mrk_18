"""Slice 1.1 validation tests — every contract accepts good data and rejects bad.

These tests ARE the demo for Slice 1.1: they encode the product rules
(silence = rejection, no approve-all, zero unauthorized publishes, platform
constraints at generation time) at the type level.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from mrk18_execution.schemas import (
    ApprovalDecision,
    ApprovalEvent,
    AuditEventType,
    AuditRecord,
    Claim,
    Confidence,
    ConsentRecord,
    ContentFormat,
    ContentItem,
    ContentStatus,
    FounderProfile,
    MarketingIntelligenceReport,
    MediaSpec,
    Platform,
    PublishRequest,
    PublishResult,
    PublishStatus,
    ReportSection,
    RunMeta,
    RunStatus,
    SignalRecord,
    WindowPoint,
    can_transition,
)

NOW = datetime.now(timezone.utc)


def make_consent() -> ConsentRecord:
    return ConsentRecord(given=True, text_version="v1-en")


def make_profile(**overrides) -> FounderProfile:
    base = dict(
        company_name="Acme SaaS",
        website="https://acme.example",
        product_description="A billing tool for Indian D2C brands.",
        icp="Pre-seed Indian D2C founders, tier-1/2 cities",
        top_competitors=["Chargebee"],
        tone="bold, direct, no fluff",
        primary_goal="signups",
        monthly_spend_inr=10000,
        target_platforms=[Platform.LINKEDIN, Platform.X],
        consent=make_consent(),
    )
    base.update(overrides)
    return FounderProfile(**base)


def make_item(**overrides) -> ContentItem:
    base = dict(
        run_id=uuid4(),
        platform=Platform.LINKEDIN,
        format=ContentFormat.LINKEDIN_POST,
        body="We cut founder billing time by 80%. Here is how we did it.",
    )
    base.update(overrides)
    return ContentItem(**base)


# ---------------------------------------------------------------- founder ---

class TestFounderProfile:
    def test_valid_profile(self):
        p = make_profile()
        assert p.founder_id is not None
        assert p.top_competitors == ["Chargebee"]

    def test_consent_must_be_affirmative(self):
        with pytest.raises(ValidationError, match="affirmative"):
            ConsentRecord(given=False, text_version="v1-en")

    def test_missing_field_blocks_completion(self):
        with pytest.raises(ValidationError):
            make_profile(icp="")

    def test_max_three_competitors(self):
        with pytest.raises(ValidationError):
            make_profile(top_competitors=["a", "b", "c", "d"])

    def test_blank_competitors_rejected(self):
        with pytest.raises(ValidationError, match="competitor"):
            make_profile(top_competitors=["   "])

    def test_at_least_one_platform(self):
        with pytest.raises(ValidationError):
            make_profile(target_platforms=[])

    def test_duplicate_platforms_rejected(self):
        with pytest.raises(ValidationError, match="duplicate"):
            make_profile(target_platforms=[Platform.X, Platform.X])

    def test_negative_spend_rejected(self):
        with pytest.raises(ValidationError):
            make_profile(monthly_spend_inr=-1)


# ----------------------------------------------------------------- report ---

class TestReport:
    def test_valid_report_and_low_confidence_surfacing(self):
        section = ReportSection(
            summary="CAC is rising.",
            claims=[
                Claim(text="CAC ~Rs450", source="intake:monthly_spend", confidence=Confidence.HIGH),
                Claim(text="Competitor X raised", source="https://news.example", confidence=Confidence.LOW),
            ],
        )
        report = MarketingIntelligenceReport(
            run_id=uuid4(),
            market_intel=section,
            audience_positioning=section,
            content_strategy=section,
            synthesis="Focus LinkedIn organic first.",
        )
        assert len(report.market_intel.low_confidence_claims) == 1

    def test_claim_requires_source(self):
        with pytest.raises(ValidationError):
            Claim(text="made up fact", source="", confidence=Confidence.HIGH)

    def test_section_requires_claims(self):
        with pytest.raises(ValidationError):
            ReportSection(summary="empty section", claims=[])


# ---------------------------------------------------------------- content ---

class TestContentItem:
    def test_valid_linkedin_post(self):
        item = make_item()
        assert item.status == ContentStatus.DRAFT

    def test_format_platform_mismatch_rejected(self):
        with pytest.raises(ValidationError, match="does not belong"):
            make_item(platform=Platform.X, format=ContentFormat.LINKEDIN_POST)

    def test_x_single_over_280_rejected(self):
        with pytest.raises(ValidationError, match="280"):
            make_item(
                platform=Platform.X,
                format=ContentFormat.X_SINGLE,
                body="x" * 281,
            )

    def test_x_thread_segment_over_280_rejected(self):
        with pytest.raises(ValidationError, match="thread item"):
            make_item(
                platform=Platform.X,
                format=ContentFormat.X_THREAD,
                body="hook",
                thread=["fine", "y" * 281],
            )

    def test_x_thread_needs_two_items(self):
        with pytest.raises(ValidationError, match=">= 2"):
            make_item(
                platform=Platform.X,
                format=ContentFormat.X_THREAD,
                body="hook",
                thread=["only one"],
            )

    def test_thread_forbidden_outside_x_thread(self):
        with pytest.raises(ValidationError, match="only allowed"):
            make_item(thread=["a", "b"])

    def test_ig_caption_hashtag_cap(self):
        with pytest.raises(ValidationError, match="hashtags"):
            make_item(
                platform=Platform.INSTAGRAM,
                format=ContentFormat.IG_CAPTION,
                body="caption " + " ".join(f"#t{i}" for i in range(31)),
            )

    def test_ig_media_must_be_jpeg(self):
        png = MediaSpec(
            url="https://cdn/x.png", mime="image/png", width=1080, height=1080, size_bytes=1000
        )
        with pytest.raises(ValidationError, match="image/png"):
            make_item(
                platform=Platform.INSTAGRAM,
                format=ContentFormat.IG_CAPTION,
                body="nice caption",
                media=[png],
            )

    def test_ig_aspect_ratio_enforced(self):
        too_tall = MediaSpec(
            url="https://cdn/x.jpg", mime="image/jpeg", width=500, height=1500, size_bytes=1000
        )
        with pytest.raises(ValidationError, match="aspect"):
            make_item(
                platform=Platform.INSTAGRAM,
                format=ContentFormat.IG_CAPTION,
                body="nice caption",
                media=[too_tall],
            )

    def test_link_in_linkedin_body_rejected(self):
        with pytest.raises(ValidationError, match="first_comment"):
            make_item(
                body="Read this: https://acme.example/blog",
                link_url="https://acme.example/blog",
            )

    def test_link_on_x_body_allowed(self):
        item = make_item(
            platform=Platform.X,
            format=ContentFormat.X_SINGLE,
            body="Read https://acme.example",
            link_url="https://acme.example",
        )
        assert item.link_url

    def test_regeneration_cap(self):
        with pytest.raises(ValidationError):
            make_item(regeneration_count=3)


class TestStatusTransitions:
    def test_happy_path(self):
        assert can_transition(ContentStatus.DRAFT, ContentStatus.AWAITING_APPROVAL)
        assert can_transition(ContentStatus.AWAITING_APPROVAL, ContentStatus.APPROVED)
        assert can_transition(ContentStatus.APPROVED, ContentStatus.PUBLISHED)

    def test_silence_equals_rejection_path(self):
        assert can_transition(ContentStatus.AWAITING_APPROVAL, ContentStatus.EXPIRED)
        # expired is terminal — no way back
        assert not any(
            can_transition(ContentStatus.EXPIRED, s) for s in ContentStatus
        )

    def test_no_publish_without_gate(self):
        assert not can_transition(ContentStatus.DRAFT, ContentStatus.PUBLISHED)
        assert not can_transition(ContentStatus.REJECTED, ContentStatus.PUBLISHED)

    def test_reject_goes_back_to_draft_only(self):
        assert can_transition(ContentStatus.REJECTED, ContentStatus.DRAFT)
        assert not can_transition(ContentStatus.REJECTED, ContentStatus.APPROVED)


# --------------------------------------------------------------- approval ---

class TestApprovalEvent:
    def test_valid_event(self):
        ev = ApprovalEvent(
            run_id=uuid4(), item_id=uuid4(), founder_id=uuid4(),
            decision=ApprovalDecision.APPROVED,
        )
        assert ev.signature is None  # Phase 1 placeholder

    def test_no_bulk_decision_exists(self):
        assert {d.value for d in ApprovalDecision} == {"approved", "rejected"}

    def test_events_are_immutable(self):
        ev = ApprovalEvent(
            run_id=uuid4(), item_id=uuid4(), founder_id=uuid4(),
            decision=ApprovalDecision.REJECTED, note="tone is off",
        )
        with pytest.raises(ValidationError):
            ev.decision = ApprovalDecision.APPROVED  # type: ignore[misc]


# ------------------------------------------------------------------ audit ---

class TestAuditRecord:
    def test_publish_without_approval_event_cannot_exist(self):
        with pytest.raises(ValidationError, match="unauthorized"):
            AuditRecord(
                event_type=AuditEventType.PUBLISH,
                agent_id="agent:publisher",
                outcome="published",
            )

    def test_publish_with_approval_event_ok(self):
        rec = AuditRecord(
            event_type=AuditEventType.PUBLISH,
            agent_id="agent:publisher",
            approval_event_id=uuid4(),
            platform=Platform.LINKEDIN,
            outcome="published",
        )
        assert rec.approval_event_id

    def test_non_publish_needs_no_approval(self):
        rec = AuditRecord(
            event_type=AuditEventType.AGENT_ACTION,
            agent_id="agent:strategy",
            outcome="strategy_written",
        )
        assert rec.approval_event_id is None

    def test_records_immutable(self):
        rec = AuditRecord(
            event_type=AuditEventType.ERROR, agent_id="agent:content", outcome="llm_timeout"
        )
        with pytest.raises(ValidationError):
            rec.outcome = "rewritten history"  # type: ignore[misc]


# ------------------------------------------------------------- publishing ---

class TestPublishing:
    def test_request_carries_approval_and_idempotency(self):
        req = PublishRequest(
            request_id="run1-item1-attempt1",
            item_id=uuid4(),
            approval_event_id=uuid4(),
            platform=Platform.LINKEDIN,
            account_ref="acct_123",
            author_handle="acme-founder",
            body="Approved post",
            scheduled_at=NOW,
        )
        assert req.visibility.value == "PUBLIC"

    def test_request_is_frozen(self):
        req = PublishRequest(
            request_id="run1-item1-attempt1",
            item_id=uuid4(),
            approval_event_id=uuid4(),
            platform=Platform.X,
            account_ref="acct_123",
            author_handle="acme",
            body="post",
            scheduled_at=NOW,
        )
        with pytest.raises(ValidationError):
            req.body = "tampered"  # type: ignore[misc]

    def test_result_updatable_for_ops_queue(self):
        res = PublishResult(request_id="r1", status=PublishStatus.QUEUED_MANUAL)
        res.status = PublishStatus.PUBLISHED
        res.public_url = "https://instagram.com/p/abc"
        assert res.status == PublishStatus.PUBLISHED


# ------------------------------------------------------------ run/signals ---

class TestRunAndSignals:
    def test_run_meta_defaults(self):
        run = RunMeta(founder_id=uuid4(), thread_id="thread-abc")
        assert run.status == RunStatus.GENERATING
        assert run.cost_inr == 0.0

    def test_cost_never_negative(self):
        run = RunMeta(founder_id=uuid4(), thread_id="t")
        with pytest.raises(ValidationError):
            run.cost_inr = -5.0

    def test_signal_record_bounds(self):
        sig = SignalRecord(
            founder_id=uuid4(), item_id=uuid4(), platform=Platform.LINKEDIN,
            window_point=WindowPoint.H24, pulled_at=NOW,
            reach=1000, engagement_rate=0.043, comment_sentiment=0.6,
        )
        assert sig.window_point == WindowPoint.H24

    def test_sentiment_out_of_bounds_rejected(self):
        with pytest.raises(ValidationError):
            SignalRecord(
                founder_id=uuid4(), item_id=uuid4(), platform=Platform.X,
                window_point=WindowPoint.H1, pulled_at=NOW,
                reach=10, engagement_rate=0.1, comment_sentiment=1.5,
            )

"""The grounding pass — confidence is EARNED from the source, and claims that
just restate the summary or each other are dropped. This is the fix for the
"HIGH means nothing and the cards repeat the summary" problem.
"""

from mrk18_execution.agents.analysis import _derive_confidence, _ground_section
from mrk18_execution.schemas.enums import Confidence
from mrk18_execution.schemas.report import Claim, ReportSection

PROFILE = {"icp": "facility managers", "company_name": "Chai Robotics"}


def _section(summary: str, claims: list[dict]) -> ReportSection:
    return ReportSection(summary=summary, claims=[Claim(**c) for c in claims])


def _ground(sec: ReportSection, **kw) -> ReportSection:
    base = dict(web_research=None, experience=None, company_knowledge=None, performance_memo=None)
    base.update(kw)
    return _ground_section(sec, profile=PROFILE, **base)


def test_intake_claim_is_high_only_if_the_field_exists():
    assert _derive_confidence("intake:icp", PROFILE, False, False, False, False) == Confidence.HIGH
    # a number the founder never gave → the model mis-tagged it → not grounded
    assert _derive_confidence("intake:revenue", PROFILE, False, False, False, False) == Confidence.LOW


def test_web_claim_needs_the_web_block_present():
    assert _derive_confidence("web", PROFILE, True, False, False, False) == Confidence.HIGH
    assert _derive_confidence("web", PROFILE, False, False, False, False) == Confidence.LOW


def test_model_knowledge_is_always_low():
    assert _derive_confidence("model-knowledge", PROFILE, True, True, True, True) == Confidence.LOW


def test_model_reported_high_is_overridden_when_ungrounded():
    sec = _section(
        "Thesis line.",
        [{"text": "Rivals raised mega-rounds last quarter.", "source": "web", "confidence": "high"}],
    )
    out = _ground(sec)  # no web_research → the 'web' tag is not earned
    assert out.claims[0].confidence == Confidence.LOW


def test_near_duplicate_claims_collapse():
    sec = _section(
        "Thesis.",
        [
            {"text": "Target facility managers in Tier-1 tech parks.", "source": "intake:icp", "confidence": "high"},
            {"text": "Focus on facility managers at Tier-1 tech parks.", "source": "intake:icp", "confidence": "high"},
            {"text": "Lead with a 14-day pilot, not a discount.", "source": "model-knowledge", "confidence": "low"},
        ],
    )
    out = _ground(sec)
    assert len(out.claims) == 2  # the two near-identical claims became one


def test_claim_that_echoes_the_summary_is_dropped():
    sec = _section(
        "Win by owning the facility-manager niche on LinkedIn before paid ads.",
        [
            {"text": "Own the facility manager niche on LinkedIn before paid ads.", "source": "model-knowledge", "confidence": "high"},
            {"text": "Ship a weekly founder-POV teardown of one office's chai ops.", "source": "intake:icp", "confidence": "high"},
        ],
    )
    out = _ground(sec)
    assert len(out.claims) == 1  # the echo of the summary was removed
    assert "weekly founder-pov" in out.claims[0].text.lower()  # the distinct claim survives


def test_a_section_is_never_left_empty():
    sec = _section(
        "Solo thesis.",
        [{"text": "Solo thesis.", "source": "model-knowledge", "confidence": "high"}],
    )
    out = _ground(sec)  # the only claim echoes the summary, but we must keep >= 1
    assert len(out.claims) == 1

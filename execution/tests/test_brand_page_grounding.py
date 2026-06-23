"""Level 1 image grounding: when the founder's website is fetched, the content
agent's image_prompt is told to describe the REAL product, not a generic one."""

from mrk18_execution.agents.content import _gen_prompt
from mrk18_execution.schemas.enums import ContentFormat, Platform

REPORT = {"content_strategy": {"summary": "lead with outcome", "claims": []}, "synthesis": "verdict"}
PROFILE = {"tone": "bold, technical"}


def test_image_prompt_grounded_when_brand_page_present():
    system, user = _gen_prompt(
        PROFILE,
        REPORT,
        ContentFormat.LINKEDIN_POST,
        Platform.LINKEDIN,
        brand_page="REAL PRODUCT: a polished silver teardrop pendant on a leather cord.",
    )
    assert "GROUND the image_prompt" in system  # the instruction kicks in
    assert "silver teardrop" in user  # the real product description reaches the prompt


def test_no_grounding_without_brand_page():
    system, user = _gen_prompt(PROFILE, REPORT, ContentFormat.LINKEDIN_POST, Platform.LINKEDIN)
    assert "GROUND the image_prompt" not in system
    assert "THE BRAND'S OWN WEBSITE" not in user

"""The audit normaliser is the wall between a free-form model response and the
UI's fixed schema. These pin the parts the report cannot render without:
`next_move` (the headline action) must never come back blank."""

from mrk18_execution.api.audit import _normalize_audit

BASE = {
    "headline_verdict": "37.6% of spend returned 7.8% of conversions",
    "money_summary": {
        "total_spend": "₹3,577",
        "total_conversions": 1327,
        "blended_cac": "₹2.70",
        "blended_roas": None,
        "wasted_spend_estimate": "₹1,345",
        "wasted_spend_definition": "spend in worst-performing campaigns",
    },
    "concentration": {
        "summary": "Poor Campaign burned 16% of spend",
        "top_performer": {"name": "App Installs", "why": "Lowest CAC"},
        "worst_offender": {"name": "Poor Campaign", "why": "CAC 83.57", "spend": "₹585"},
    },
    "structural_findings": [
        {
            "severity": "critical",
            "finding": "Poor Campaign has a CAC of 83.57 against a blended 2.70",
            "evidence": "spend 585.0, conversions 7.0",
            "root_cause": "Bidding against a pool that never converts",
            "action": "Cut Poor Campaign to zero and move ₹400 to Retargeting",
            "money_impact": "₹585",
        }
    ],
    "creative_signals": {"fatigue_detected": False, "evidence": "", "recommendation": ""},
    "reallocation_plan": [],
    "this_week": ["Cut Poor Campaign to zero", "Move ₹400 to Retargeting"],
    "data_quality": {"rows_analyzed": 16, "missing_columns": [], "limitations": "", "anomalies": []},
    "confidence": "medium",
    "pro_unlock": {"headline": "Unlock trends", "specific_gap": "One snapshot"},
}


def test_next_move_is_passed_through_when_the_model_supplies_it():
    data = dict(BASE)
    data["next_move"] = {
        "action": "Cut Poor Campaign's ₹585 to zero today",
        "why": "It returns 7 conversions at 30x your blended CAC",
        "impact": "₹585 recovered",
    }
    out = _normalize_audit(data)
    assert out is not None
    assert out["next_move"]["action"] == "Cut Poor Campaign's ₹585 to zero today"
    assert out["next_move"]["impact"] == "₹585 recovered"


def test_next_move_falls_back_to_the_first_weekly_action():
    """The report shows this at the very top, so a model that omits the field
    must not leave the most prominent slot on the page empty."""
    out = _normalize_audit(dict(BASE))  # no next_move key at all
    assert out is not None
    assert out["next_move"]["action"] == "Cut Poor Campaign to zero"
    # and it borrows the worst finding's framing rather than inventing one
    assert "CAC of 83.57" in out["next_move"]["why"]
    assert out["next_move"]["impact"] == "₹585"


def test_next_move_falls_back_to_the_top_findings_action_without_a_weekly_list():
    """A valid audit always carries at least one ranked finding, so the most
    prominent slot on the page has a real action even with both other sources
    missing."""
    data = dict(BASE)
    data["this_week"] = []
    out = _normalize_audit(data)
    assert out is not None
    assert out["next_move"]["action"] == "Cut Poor Campaign to zero and move ₹400 to Retargeting"


def test_next_move_is_length_capped_like_every_other_model_string():
    data = dict(BASE)
    data["next_move"] = {"action": "x" * 400, "why": "y" * 400, "impact": "z" * 400}
    out = _normalize_audit(data)
    assert out is not None
    assert len(out["next_move"]["action"]) <= 110
    assert len(out["next_move"]["why"]) <= 130
    assert len(out["next_move"]["impact"]) <= 24

"""Meaning-aware intake validation — gibberish must never become the founder's
company memory (which every agent then reasons from).

Layer 1 = deterministic heuristics (free). Layer 2 = one cheap LLM coherence
call that degrades to silence on any failure. Structural validation is unchanged.
"""

from uuid import uuid4

from mrk18_execution.intake_quality import coherence_problems, heuristic_problems
from tests.authtools import mint

REAL_FULL = {
    "company_name": "Chai Robotics",
    "website": "https://chairobotics.in",
    "product_description": "Robotic chai vending machines for Indian offices and campuses.",
    "icp": "Facility managers at 200+ employee Indian tech parks, Tier-1 cities.",
    "top_competitors": ["Chaipoint", "Chaayos"],
    "tone": "bold, warm, desi",
    "primary_goal": "signups",
    "monthly_spend_inr": 30000,
    "target_platforms": ["linkedin", "x"],
    "consent_given": True,
    "consent_text_version": "v1-2026-06",
}


# ----------------------------- Layer 1 (heuristics) -----------------------------


def test_layer1_passes_real_answers():
    assert heuristic_problems(REAL_FULL) == []


def test_layer1_flags_single_token_gibberish_icp():
    probs = heuristic_problems({**REAL_FULL, "icp": "vkxvkygv20"})
    assert any("Target customer" in p for p in probs)


def test_layer1_flags_consonant_mash_company():
    probs = heuristic_problems({**REAL_FULL, "company_name": "ghvckutyvyugciy"})
    assert any("Company name" in p for p in probs)


def test_layer1_flags_keyboard_walk():
    assert heuristic_problems({**REAL_FULL, "icp": "asdf qwerty zxcv hjkl"})


def test_layer1_brand_names_survive():
    probs = heuristic_problems(
        {
            "company_name": "Paytm",
            "product_description": "A simple investing app for Indian retail traders.",
            "icp": "Retail investors in India who trade weekly on their phones.",
            "top_competitors": ["Zerodha", "Groww"],
        }
    )
    assert probs == []


# ----------------------------- Layer 2 (coherence) ------------------------------


class _StubSocket:
    """Stands in for LLMSocket — returns a fixed verdict, makes no network call."""

    def __init__(self, **verdict):
        self._v = verdict

    async def complete(self, role, system, user, schema, max_validation_retries=2):
        return schema(**self._v), None


_ALL_GENUINE = dict(
    company_name_genuine=True,
    description_genuine=True,
    target_customer_genuine=True,
    competitors_genuine=True,
)


async def test_layer2_degrades_without_socket():
    assert await coherence_problems(None, REAL_FULL) == []


async def test_layer2_all_genuine_passes():
    assert await coherence_problems(_StubSocket(**_ALL_GENUINE), REAL_FULL) == []


async def test_layer2_flags_field_marked_not_genuine():
    sock = _StubSocket(**{**_ALL_GENUINE, "company_name_genuine": False})
    probs = await coherence_problems(sock, REAL_FULL)
    assert any("Company name" in p for p in probs)


async def test_layer2_model_error_degrades_to_silence():
    class _Boom:
        async def complete(self, *a, **k):
            raise RuntimeError("model down")

    assert await coherence_problems(_Boom(), REAL_FULL) == []


# --------------------------- end-to-end through the API -------------------------


async def _new_founder(client, email):
    client.headers["Authorization"] = f"Bearer {mint(uuid4(), email=email)}"
    resp = await client.post("/founders", json={})
    assert resp.status_code == 201, resp.text
    return resp.json()["founder_id"]


async def test_complete_rejects_structurally_valid_gibberish(client):
    # "vkxvkygv20" is 10 chars (passes min_length) but is single-token gibberish —
    # Layer 1 must reject it. (Test app has no llm_socket, so Layer 2 is skipped.)
    fid = await _new_founder(client, "gibber@chairobotics.in")
    await client.put(f"/founders/{fid}/intake", json={**REAL_FULL, "icp": "vkxvkygv20"})
    resp = await client.post(f"/founders/{fid}/intake/complete")
    assert resp.status_code == 422
    assert any("Target customer" in p for p in resp.json()["detail"]["problems"])


async def test_complete_accepts_real_intake(client):
    fid = await _new_founder(client, "real@chairobotics.in")
    await client.put(f"/founders/{fid}/intake", json=REAL_FULL)
    resp = await client.post(f"/founders/{fid}/intake/complete")
    assert resp.status_code == 200, resp.text
    assert resp.json()["complete"] is True

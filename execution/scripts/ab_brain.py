"""Blind A/B promotion gate — does each TRAINED adapter on the Brain actually
BEAT the incumbent (Groq) on its role's eval criteria? This is the plan's
Phase-1 gate: "an adapter only takes a seat when it wins."

How it stays cheap: the incumbent side AND the blind judge both run on Groq
(free tier). Only the Brain side costs RunPod — and one invocation amortises the
single cold start across all five roles. The judge sees the two outputs as "A"
and "B" in a randomised order, so it can't favour the Brain by position.

    cd execution
    .venv\\Scripts\\python.exe scripts\\ab_brain.py                 # all 5 (one cold start)
    .venv\\Scripts\\python.exe scripts\\ab_brain.py --role brand_analysis
    .venv\\Scripts\\python.exe scripts\\ab_brain.py --mock          # free dry-run (fake Brain)
"""

import argparse
import asyncio
import random
import sys
from pathlib import Path
from uuid import uuid4

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pydantic import BaseModel, Field  # noqa: E402

from mrk18_execution.agents.analysis import run_analysis_agent, run_synthesis  # noqa: E402
from mrk18_execution.agents.analytics import diagnose_metrics  # noqa: E402
from mrk18_execution.agents.content import generate_item  # noqa: E402
from mrk18_execution.config import get_settings  # noqa: E402
from mrk18_execution.llm.socket import (  # noqa: E402
    AgentRole,
    LLMSocket,
    brain_registry,
    default_registry,
)
from mrk18_execution.schemas.enums import Platform  # noqa: E402

# ── golden fixtures: one realistic Indian founder ────────────────────────────
PROFILE = {
    "company_name": "PariWala",
    "website": "https://pariwala.in",
    "product_description": (
        "A subscription app delivering pre-portioned North-Indian meal kits (sabzi + "
        "masala + roti dough) to working professionals in Bengaluru and Pune — cook a "
        "home meal in 12 minutes, no planning."
    ),
    "icp": "25-38 yr old metro tech professionals who want home-cooked food but have no time to plan or shop.",
    "top_competitors": ["Swiggy Instamart", "FreshMenu"],
    "tone": "warm, witty, a little desi, never corporate",
    "primary_goal": "signups",
    "monthly_spend_inr": 40000,
    "target_platforms": ["linkedin", "x"],
}

# brand_analysis grounding fixture — the allow-list of competitors/facts. ANY
# competitor or stat NOT here, appearing in the output, is a hallucination.
WEB_RESEARCH = (
    "## The brand's own website (their real product page)\n"
    "PariWala delivers pre-portioned North-Indian meal kits (sabzi + masala + roti dough) "
    "to professionals in Bengaluru and Pune; cook a home meal in ~12 minutes.\n\n"
    "## Competitor — Swiggy Instamart\n"
    "10-minute grocery delivery; ingredients, not meal-kits; mass-market.\n\n"
    "## Competitor — FreshMenu\n"
    "Cloud-kitchen delivering ready-to-eat meals; not cook-at-home.\n"
)

SECTIONS = {
    "market_intel": {
        "summary": "PariWala sits between grocery delivery and cloud kitchens — a 12-minute home-cooked meal, not another restaurant order.",
        "claims": [{"text": "The wedge is 'home-cooked, not delivered' — the guilt-free middle ground.", "confidence": "high", "source": "intake:product_description"}],
    },
    "audience": {
        "summary": "25-38 metro tech professionals who want home food but can't plan or shop.",
        "claims": [{"text": "Lead with the time win (12 min) and the home-cooked feeling, not price.", "confidence": "medium", "source": "model-knowledge"}],
    },
    "strategy": {
        "summary": "Relatable 'no-time-to-cook' content funnelling to a first-week trial kit.",
        "claims": [{"text": "Top: desi work-life content; bottom: first-week trial offer.", "confidence": "medium", "source": "model-knowledge"}],
    },
}

REPORT = {
    "content_strategy": {
        "summary": "Lead with the 12-minute home-cooked win for time-starved professionals; trial-kit CTA.",
        "claims": [{"text": "Lead with time + home-cooked, not price.", "confidence": "high", "source": "intake"}],
    },
    "synthesis": "You're not racing Swiggy on speed — you're selling the feeling of a home-cooked meal without the planning. Sell the guilt-free shortcut.",
}

METRICS = {
    "platform": "meta",
    "spend_inr": 40000,
    "window": "last_14_days",
    "campaigns": [
        {"name": "Trial Kit - Bengaluru", "impressions": 220000, "clicks": 3100, "ctr": 0.014, "signups": 95, "cpa_inr": 280},
        {"name": "Brand Awareness - Reels", "impressions": 980000, "clicks": 1400, "ctr": 0.0014, "signups": 6, "cpa_inr": 1900},
    ],
}


def _render_section(section) -> str:
    lines = [section.summary, ""]
    for c in section.claims:
        lines.append(f"- [{c.confidence}] {c.text}  (source: {c.source})")
    return "\n".join(lines)


def _render_diag(d) -> str:
    return (
        f"HEADLINE: {d.headline}\n"
        f"WORKING: {d.working}\nLEAKING: {d.leaking}\n"
        f"SCALE: {d.scale}\nCUT: {d.cut}\nNEXT MOVE: {d.next_move}"
    )


# ── each role: how to produce its output + what the judge grades on ──────────
async def _brand(socket):
    s, u = await run_analysis_agent(socket, AgentRole.MARKET_INTEL, PROFILE, [], web_research=WEB_RESEARCH)
    return _render_section(s), [u]


async def _funnel(socket):
    s, u = await run_analysis_agent(socket, AgentRole.STRATEGY, PROFILE, [])
    return _render_section(s), [u]


async def _personality(socket):
    out, u = await run_synthesis(socket, PROFILE, SECTIONS, [])
    return out.synthesis, [u]


async def _ad_copy(socket):
    item, usages = await generate_item(socket, str(uuid4()), PROFILE, REPORT, Platform.LINKEDIN)
    text = item.body or "\n".join(item.thread or [])
    if item.first_comment:
        text += f"\n[first comment] {item.first_comment}"
    return text, list(usages)


async def _analytics(socket):
    d, u = await diagnose_metrics(socket, METRICS)
    return _render_diag(d), [u]


ROLES = {
    "brand_analysis": {
        "label": "BRAND ANALYSIS (positioning)",
        "produce": _brand,
        "context": f"The founder:\n{PROFILE['product_description']}\n\nThe ONLY real-world context available (web research):\n{WEB_RESEARCH}",
        "criteria": (
            "FACTUAL GROUNDING IS EVERYTHING: every competitor named and every statistic MUST "
            "appear in the web-research context above. Penalise HARD (instant loss) any invented "
            "competitor, brand, or number not present there. Then judge positioning sharpness and "
            "whether the read is India-native and non-generic."
        ),
    },
    "funnel": {
        "label": "FUNNEL / CONTENT STRATEGY",
        "produce": _funnel,
        "context": f"The founder:\n{PROFILE['product_description']}\nGoal: {PROFILE['primary_goal']}, ₹{PROFILE['monthly_spend_inr']}/mo.",
        "criteria": "Funnel-stage completeness, India-native specificity, and whether an expert would rate it >= 4/5 ACTIONABLE (concrete next steps, not platitudes).",
    },
    "personality": {
        "label": "PERSONALITY (the CMO's verdict)",
        "produce": _personality,
        "context": f"The founder:\n{PROFILE['product_description']}\nBrand voice: {PROFILE['tone']}.",
        "criteria": "Bitter-truth honesty, a DECISIVE close, India-first, and matching the brand's witty-desi voice. Penalise fabricated specifics and generic AI-CMO fluff.",
    },
    "ad_copy": {
        "label": "AD COPY (LinkedIn post)",
        "produce": _ad_copy,
        "context": f"The founder:\n{PROFILE['product_description']}\nStrategy: {REPORT['content_strategy']['summary']}",
        "criteria": "Platform-native hook quality, leads with the OUTCOME (not product specs), brand voice, and NO fabricated price/coupon/stat.",
    },
    "analytics": {
        "label": "ANALYTICS INTERPRETER (ad diagnosis)",
        "produce": _analytics,
        "context": f"Ad metrics:\n{METRICS}",
        "criteria": "Signal-vs-vanity accuracy and a CORRECT scale/kill call — the right read is: SCALE the Trial-Kit campaign (₹280 CPA, 95 signups) and CUT the Brand-Awareness Reels (0.14% CTR, ₹1900 CPA, 6 signups). Penalise chasing the vanity impressions.",
    },
}


class Verdict(BaseModel):
    winner: str = Field(pattern="^(A|B|TIE)$")
    reason: str = Field(max_length=600)
    a_score: int = Field(ge=1, le=10)
    b_score: int = Field(ge=1, le=10)


async def _judge(judge_socket, label, criteria, context, out_a, out_b) -> Verdict:
    system = (
        f"You are a ruthless senior Indian marketing expert blind-judging two AI outputs for the "
        f"{label} task. Grade ONLY on: {criteria} Be harsh and specific. Score each 1-10. Call a TIE "
        "only if they are genuinely indistinguishable."
    )
    user = f"TASK CONTEXT:\n{context}\n\n=== OUTPUT A ===\n{out_a}\n\n=== OUTPUT B ===\n{out_b}\n\nWhich output is better, and why?"
    v, _u = await judge_socket.complete(AgentRole.SYNTHESIS, system, user, Verdict)
    return v


async def run_role(key, brain_socket, groq_socket, judge_socket, meter):
    spec = ROLES[key]
    print(f"\n{'=' * 74}\n  {spec['label']}\n{'=' * 74}")
    brain_out, brain_usages = await spec["produce"](brain_socket)
    groq_out, groq_usages = await spec["produce"](groq_socket)
    for u in (*brain_usages, *groq_usages):
        meter["in"] += u.tokens_in
        meter["out"] += u.tokens_out

    flip = random.random() < 0.5  # blind: randomise which side is "A"
    a, b = (brain_out, groq_out) if flip else (groq_out, brain_out)
    v = await _judge(judge_socket, spec["label"], spec["criteria"], spec["context"], a, b)

    if v.winner == "TIE":
        winner = "TIE"
    else:
        picked_brain = (v.winner == "A") == flip
        winner = "BRAIN" if picked_brain else "INCUMBENT"
    brain_score, groq_score = (v.a_score, v.b_score) if flip else (v.b_score, v.a_score)

    print(f"\n  -- BRAIN (adapter) --\n{_indent(brain_out)}")
    print(f"\n  -- INCUMBENT (Groq) --\n{_indent(groq_out)}")
    print(f"\n  >> WINNER: {winner}   (brain {brain_score}/10 vs incumbent {groq_score}/10)")
    print(f"     judge: {v.reason}")
    return {"role": key, "winner": winner, "brain": brain_score, "incumbent": groq_score}


def _indent(text: str) -> str:
    return "\n".join("     " + ln for ln in text.splitlines())


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", choices=[*ROLES, "all"], default="all")
    ap.add_argument("--mock", action="store_true", help="fake the Brain side (free dry-run of the plumbing)")
    args = ap.parse_args()

    settings = get_settings()
    if not settings.groq_api_key:
        sys.exit("GROQ_API_KEY missing — fill execution/.env")
    groq_socket = LLMSocket(default_registry(settings.groq_api_key))
    judge_socket = groq_socket  # the judge is free (Groq)

    if args.mock:
        brain_socket = groq_socket  # both sides on Groq — validates harness + judge for ₹0
        print(">> --mock: both sides run on Groq (free). Plumbing + judge check; verdicts will ~tie.\n")
    elif settings.brain_base_url:
        brain_socket = LLMSocket(
            brain_registry(settings.brain_base_url, settings.brain_api_key, settings.brain_base_model)
        )
        print(f">> Brain: {settings.brain_base_url}\n   (first call cold-starts the endpoint — give it a few minutes)\n")
    else:
        sys.exit("BRAIN_BASE_URL not set — wire BRAIN_* into .env, or use --mock for a free dry-run.")

    keys = list(ROLES) if args.role == "all" else [args.role]
    meter = {"in": 0, "out": 0}
    results = []
    for k in keys:
        try:
            results.append(await run_role(k, brain_socket, groq_socket, judge_socket, meter))
        except Exception as exc:  # noqa: BLE001
            print(f"\n  !! {k} FAILED: {type(exc).__name__}: {str(exc)[:300]}")
            results.append({"role": k, "winner": "ERROR", "brain": 0, "incumbent": 0})

    print(f"\n{'=' * 74}\n  PHASE-1 PROMOTION GATE — SCORECARD\n{'=' * 74}")
    for r in results:
        mark = {"BRAIN": "✅ promote", "TIE": "🟡 tie — keep fallback", "INCUMBENT": "❌ keep incumbent", "ERROR": "⚠️  error"}[r["winner"]]
        print(f"  {r['role']:<16} {r['winner']:<10} {r['brain']}/10 vs {r['incumbent']}/10   {mark}")
    wins = sum(r["winner"] == "BRAIN" for r in results)
    print(f"\n  {wins}/{len(results)} adapters beat the incumbent.")
    print(f"  tokens this run: {meter['in']:,} in / {meter['out']:,} out (incumbent + judge = Groq free; Brain = RunPod)")


if __name__ == "__main__":
    asyncio.run(main())

"""Comment Agent (Slice 3.4) — the thinking half: sentiment + reply drafting.

Two jobs, deliberately split by cost and trust:

  * score_sentiment — DETERMINISTIC lexicon scoring (-1..1). Free, instant,
    reproducible, no LLM. Good enough to triage tone and feed the
    `comment_sentiment` signal the blueprint reserved in Slice 1.1.
  * draft_reply — the LLM, AS the founder: short, warm, on-brand, never
    argues, never reveals it's AI, de-escalates a negative comment. Always a
    DRAFT — it reaches the founder's gate, never the platform.
"""

from pydantic import BaseModel, Field

from ..llm.socket import AgentRole, LLMSocket, Usage

# Tiny, honest lexicon — tuned for short social comments, India-aware. Not a
# sentiment-analysis product; a free triage signal. The LLM never sees this.
_POSITIVE = {
    "love", "loved", "great", "amazing", "awesome", "brilliant", "helpful",
    "useful", "thanks", "thank", "thankyou", "good", "best", "excellent",
    "fantastic", "superb", "nice", "perfect", "insightful", "valuable", "gold",
    "respect", "inspiring", "solid", "clean", "needed", "underrated", "fire",
}
_NEGATIVE = {
    "bad", "worst", "useless", "scam", "fake", "hate", "terrible", "awful",
    "wrong", "overpriced", "expensive", "disappointing", "disappointed",
    "boring", "spam", "misleading", "clickbait", "nonsense", "poor", "waste",
    "overrated", "confusing", "broken", "annoying", "cringe", "trash",
}
_NEGATORS = {"not", "no", "never", "isn't", "dont", "don't", "didn't", "doesn't"}

_QUESTION_HINTS = {"how", "what", "when", "where", "which", "why", "can", "does", "?"}


def _tokens(text: str) -> list[str]:
    return [t.strip(".,!?;:\"'()").lower() for t in text.split()]


def score_sentiment(text: str) -> float:
    """Return a sentiment score in [-1, 1]. 0.0 = neutral / no signal.
    Handles simple negation ('not helpful' flips positive→negative)."""
    tokens = _tokens(text)
    score = 0
    for i, tok in enumerate(tokens):
        polarity = 1 if tok in _POSITIVE else -1 if tok in _NEGATIVE else 0
        if polarity and i > 0 and tokens[i - 1] in _NEGATORS:
            polarity = -polarity
        score += polarity
    if score == 0:
        return 0.0
    # squash to (-1, 1): one strong word ≈ ±0.46, saturating from there
    magnitude = min(abs(score) / (abs(score) + 1.2), 1.0)
    return round(magnitude if score > 0 else -magnitude, 3)


def sentiment_label(score: float | None) -> str:
    if score is None:
        return "unknown"
    if score >= 0.25:
        return "positive"
    if score <= -0.25:
        return "negative"
    return "neutral"


def is_question(text: str) -> bool:
    toks = set(_tokens(text))
    return "?" in text or bool(toks & _QUESTION_HINTS)


class ReplyDraft(BaseModel):
    reply: str = Field(min_length=1, max_length=600, description="The founder's reply, ready to post")


async def draft_reply(
    socket: LLMSocket,
    *,
    profile: dict,
    platform: str,
    post_excerpt: str,
    comment_text: str,
    note: str | None = None,
) -> tuple[ReplyDraft, Usage]:
    """Draft ONE reply in the founder's voice. `note` carries the founder's
    redirection when they rejected a previous draft."""
    label = sentiment_label(score_sentiment(comment_text))
    tone = profile.get("tone", "direct, warm")
    company = profile.get("company_name", "the founder's company")
    system = (
        f"You are replying AS the founder of {company} to a comment on their "
        f"{platform} post. Brand voice: {tone}. India-first, concrete, human. "
        "Rules: keep it SHORT (1-3 sentences). Be warm and genuine. If the "
        "comment is a question, answer it. If it's negative, de-escalate with "
        "grace — never argue, never get defensive, never insult. NEVER reveal "
        "you are an AI. No hashtags, no links. This is a DRAFT the founder will "
        "review before it is ever posted."
    )
    user = (
        f"The post (excerpt): {post_excerpt[:300]}\n"
        f"The comment (sentiment: {label}): \"{comment_text}\"\n"
    )
    if note:
        user += f"\nThe founder rejected your previous draft. Their steer: {note}\n"
    user += "Write the reply."
    return await socket.complete(AgentRole.COMMENT, system, user, ReplyDraft)

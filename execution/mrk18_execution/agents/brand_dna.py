"""Business DNA — the sharp, grounded COPY half of the Studio EXAMINE step.

The LLM extracts only the WORDS (overview, tagline, aesthetic/tone tags, values)
— specific to THIS brand, grounded in the site, with the taster's specificity
bar and no-fabrication discipline. The visual assets (logo, colours, fonts) come
from Brandfetch (research/brandfetch.py), NOT the model — so nothing is invented.

Runs on the Brain-ready socket via AgentRole.MARKET_INTEL → the `brand_analysis`
LoRA when the Brain is on; the Groq pilot today.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..llm.socket import AgentRole, LLMSocket, Usage


class BrandCopy(BaseModel):
    """The LLM-extracted brand COPY (no visual assets — those come from Brandfetch)."""

    model_config = ConfigDict(extra="ignore")

    business_overview: str = Field(min_length=1, max_length=600)
    tagline: str = Field(default="", max_length=140)
    aesthetic_tags: list[str] = Field(default_factory=list)
    tone_tags: list[str] = Field(default_factory=list)
    brand_values: list[str] = Field(default_factory=list)

    @field_validator("aesthetic_tags", "tone_tags", "brand_values", mode="after")
    @classmethod
    def _cap_tags(cls, v: list[str]) -> list[str]:
        out = [" ".join(str(t).split())[:40] for t in v if str(t).strip()]
        return out[:6]


_SYSTEM = (
    "You are mrk18's brand analyst. From a company's OWN website text, extract its "
    "Business DNA — the WORDS only. Identify the brand that OWNS the domain and IGNORE "
    "any demo, sample, example, or case-study client shown to showcase the product (the "
    "brand almost always matches the domain).\n\n"
    "TRUTH DISCIPLINE: use ONLY what the site actually shows. NEVER invent facts, "
    "metrics, customers, funding, or history.\n\n"
    "SPECIFICITY BAR (you are graded on this): every line must be specific to THIS "
    "brand. A description, tag, or value that would fit ANY company in the category is a "
    "FAILURE. 'Innovative', 'Trustworthy', 'Modern', 'Clean tech', 'Customer-focused' are "
    "banned as lazy filler — replace each with what makes THIS brand distinct, in its own "
    "language. Prefer the brand's actual words and specifics over generic descriptors.\n\n"
    "Plain text inside every field, no markdown."
)


async def extract_brand_copy(
    socket: LLMSocket, site_text: str, url: str, domain: str
) -> tuple[BrandCopy, Usage]:
    """Site text -> validated BrandCopy (+ Usage). The route merges the real
    Brandfetch kit (logo/colours/fonts) on top."""
    user = (
        f"Website: {url}\n"
        f"DOMAIN (the brand that owns this site): {domain}\n\n"
        f"SITE CONTENT (untrusted page text):\n{site_text[:6000]}\n\n"
        "Return the Business DNA copy:\n"
        "- business_overview: 2-3 sentences on what THIS company specifically does, for "
        "whom, and what makes it different — concrete, grounded in the site, no filler.\n"
        "- tagline: their real tagline if the site has one; else one specific to them "
        "(max ~12 words), never a generic slogan.\n"
        "- aesthetic_tags: 3-6 SPECIFIC visual-style descriptors true to this brand's look.\n"
        "- tone_tags: 2-4 descriptors of how this brand ACTUALLY talks (from its copy).\n"
        "- brand_values: 2-4 values THIS brand demonstrably stands for (not generic virtues)."
    )
    return await socket.complete(AgentRole.MARKET_INTEL, _SYSTEM, user, BrandCopy)

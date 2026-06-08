"""Diverse brand-brief generator for the adcopy skill.

The reference dataset had only ~20 brand names across 1000 rows. Here we build
briefs by sampling from wide, India-centric entropy pools and synthesizing brand
names combinatorially, so every brief is distinct.

Coherence matters: product, USP, and audience must make sense together (a
budgeting app can't have a "delivered fresh, same day" USP). So each PRODUCT
carries its own candidate audiences and USPs. Platform / ad_format / tone / goal
are product-independent and sampled freely.
"""

import random

# Combinatorial brand-name parts (yields thousands of plausible D2C/startup names)
_BRAND_PREFIX = [
    "Fresh", "Urban", "Desi", "Nova", "Bloom", "Stride", "Glow", "Spark", "Daily",
    "Pure", "Brew", "Craft", "Zen", "Bold", "Swift", "Bright", "Vault", "Pixel",
    "Loom", "Sprout", "Terra", "Lumen", "Forge", "Nimbus", "Atlas", "Kraft",
    "Maple", "Ember", "Indi", "Saffron", "Mitti", "Tara", "Veda", "Roots", "Kaya",
]
_BRAND_SUFFIX = [
    "Drop", "Box", "Lane", "Hub", "Kart", "Labs", "Co", "Works", "Bites", "Fit",
    "Care", "Wear", "Mart", "Nest", "Goods", "Studio", "Brew", "Roast", "Wala",
    "Threads", "Stack", "Grid", "Flow", "Mix", "Tonic", "Bar", "House", "Crew",
]

# Each product: industry, coherent audiences, coherent USPs.
_PRODUCTS = [
    {
        "product": "10-minute grocery delivery", "industry": "Quick-commerce",
        "audiences": ["busy urban renters", "work-from-home professionals", "young families in metros"],
        "usps": ["essentials in 10 minutes, no minimum order", "free delivery on every order", "fresh produce, delivered same day"],
    },
    {
        "product": "cold-pressed juices subscription", "industry": "D2C Food & Beverage",
        "audiences": ["health-conscious millennials", "busy professionals skipping breakfast", "new gym-goers"],
        "usps": ["no added sugar, no preservatives", "delivered fresh to your door daily", "cancel or pause anytime"],
    },
    {
        "product": "ayurvedic hair care range", "industry": "D2C Beauty",
        "audiences": ["women 25-45 with hair fall", "men with early hair thinning", "first-time ayurveda buyers"],
        "usps": ["made with clinically-backed ingredients", "no sulphates or parabens", "results in 8 weeks or money back"],
    },
    {
        "product": "sustainable activewear", "industry": "D2C Apparel",
        "audiences": ["fitness beginners", "yoga regulars", "eco-conscious millennials"],
        "usps": ["made from recycled fabric", "free 30-day returns", "designed and made in India"],
    },
    {
        "product": "artisanal filter coffee", "industry": "D2C Food & Beverage",
        "audiences": ["home coffee enthusiasts", "work-from-home professionals", "South-Indian filter-coffee lovers"],
        "usps": ["single-estate beans, roasted weekly", "delivered fresh within 48 hours of roast", "subscribe and save 15%"],
    },
    {
        "product": "budgeting and investing app", "industry": "Consumer Fintech",
        "audiences": ["first-time investors in tier-2 cities", "salaried savers in their 30s", "gen-Z first jobbers"],
        "usps": ["start investing with just ₹100", "no jargon, guided in your language", "SEBI-registered and secure"],
    },
    {
        "product": "online IELTS coaching", "industry": "Edtech",
        "audiences": ["aspiring IELTS test-takers", "students planning to study abroad", "working professionals seeking PR"],
        "usps": ["band 7+ or a free re-attempt", "live classes with certified trainers", "flexible weekend batches"],
    },
    {
        "product": "handmade leather wallets", "industry": "D2C Accessories",
        "audiences": ["men shopping for a gift", "professionals upgrading their everyday carry", "design-conscious buyers"],
        "usps": ["full-grain leather, handcrafted", "lifetime stitching warranty", "free personalised engraving"],
    },
    {
        "product": "plant-based protein powder", "industry": "D2C Nutrition",
        "audiences": ["fitness beginners", "vegetarians and vegans", "busy professionals who skip meals"],
        "usps": ["no added sugar, 24g protein per scoop", "made from Indian sources", "tastes good or money back"],
    },
    {
        "product": "smart home security cameras", "industry": "Consumer Electronics",
        "audiences": ["small-business owners", "parents of young kids", "homeowners who travel often"],
        "usps": ["2-year warranty, no questions asked", "set up in under 5 minutes", "free cloud storage for 30 days"],
    },
    {
        "product": "tournament-grade gaming gear", "industry": "Gaming / Electronics",
        "audiences": ["competitive gamers 16-26", "esports aspirants in tier-2 & tier-3 India", "PC-building hobbyists"],
        "usps": ["tournament-grade with 2-year warranty", "ultra-low latency", "trusted by competitive players"],
    },
    {
        "product": "regional-language audiobooks", "industry": "Media / Subscription",
        "audiences": ["commuters who love stories", "readers who prefer their mother tongue", "busy parents short on screen-free time"],
        "usps": ["thousands of titles in 8 Indian languages", "cancel anytime, fully online", "first month free"],
    },
    {
        "product": "teeth-whitening kits", "industry": "D2C Personal Care",
        "audiences": ["young professionals before events", "soon-to-be brides and grooms", "coffee and chai drinkers"],
        "usps": ["visible results in 7 days", "enamel-safe formula", "free returns within 30 days"],
    },
    {
        "product": "eco-friendly cleaning supplies", "industry": "D2C Home",
        "audiences": ["eco-conscious households", "parents wanting safer homes", "people with sensitive skin"],
        "usps": ["plant-based and non-toxic", "carbon-neutral packaging", "refills that cut plastic by 80%"],
    },
    {
        "product": "freelancer invoicing SaaS", "industry": "B2B SaaS",
        "audiences": ["freelancers and creators", "solo consultants", "small agency owners"],
        "usps": ["create GST invoices in 60 seconds", "get paid 2x faster", "free for your first 10 invoices"],
    },
    {
        "product": "millet-based snacks", "industry": "D2C Food",
        "audiences": ["health-conscious millennials", "parents seeking better snacks for kids", "office snackers"],
        "usps": ["no maida, no palm oil", "high-fibre ancient grains", "guilt-free and genuinely tasty"],
    },
    {
        "product": "prescription eyewear, online", "industry": "D2C Eyewear",
        "audiences": ["first-time online glasses buyers", "screen-heavy professionals", "students on a budget"],
        "usps": ["frames starting at ₹999", "free home eye test", "free returns within 30 days"],
    },
    {
        "product": "pet food and treats", "industry": "D2C Pet Care",
        "audiences": ["pet parents in metros", "first-time dog owners", "cat parents seeking better nutrition"],
        "usps": ["vet-formulated, no fillers", "delivered fresh on a schedule", "money-back if your pet won't eat it"],
    },
    {
        "product": "yoga and meditation app", "industry": "Health & Wellness",
        "audiences": ["stressed working professionals", "beginners to meditation", "people with poor sleep"],
        "usps": ["guided sessions from 5 minutes", "personalised to your goals", "7-day free trial"],
    },
    {
        "product": "solar rooftop installation", "industry": "Cleantech / Services",
        "audiences": ["homeowners with high power bills", "RWA and housing societies", "small factory owners"],
        "usps": ["cut your power bill by up to 90%", "subsidy paperwork handled for you", "25-year panel warranty"],
    },
    {
        "product": "handcrafted silver jewellery", "industry": "D2C Jewellery",
        "audiences": ["women shopping for everyday wear", "gift buyers", "brides seeking minimal pieces"],
        "usps": ["925 sterling silver, handcrafted", "free gift wrapping", "lifetime polishing"],
    },
    {
        "product": "kids' STEM toy subscription", "industry": "D2C / Subscription",
        "audiences": ["parents of 5-12 year-olds", "grandparents buying gifts", "homeschooling families"],
        "usps": ["a new science kit every month", "screen-free learning", "pause or cancel anytime"],
    },
    {
        "product": "resume-building tool", "industry": "Edtech / SaaS",
        "audiences": ["fresh graduates job-hunting", "professionals switching careers", "students applying for internships"],
        "usps": ["recruiter-approved templates", "build a resume in 10 minutes", "free to start"],
    },
    {
        "product": "electric scooter", "industry": "Mobility / EV",
        "audiences": ["daily city commuters", "delivery riders", "students and college-goers"],
        "usps": ["120 km on a single charge", "save thousands on fuel", "free home charger"],
    },
    {
        "product": "AI study-notes generator", "industry": "Edtech / AI",
        "audiences": ["exam-prepping students", "college-goers short on time", "competitive-exam aspirants"],
        "usps": ["turn any PDF into notes in seconds", "made for the Indian syllabus", "free for your first 5 documents"],
    },
]

_PLATFORMS = [
    "Meta Feed", "Instagram Reels", "Instagram Stories", "Facebook Feed",
    "Google Search", "YouTube pre-roll", "WhatsApp broadcast", "LinkedIn Feed",
    "Amazon Sponsored", "Flipkart Ads",
]

_FORMATS = [
    "carousel ad", "single image ad", "short video (15s)", "story ad",
    "reel script", "search ad copy", "collection ad", "lead-gen ad",
]

_TONES = [
    "Witty and playful", "Honest and no-nonsense", "Warm and reassuring",
    "Bold and contrarian", "Premium and aspirational", "Friendly and casual",
    "Urgent and high-energy", "Calm and expert", "Cheeky and irreverent",
]

_GOALS = [
    "Drive first purchases", "Drive subscription signups", "Increase app installs",
    "Generate qualified leads", "Boost add-to-cart rate", "Re-engage cart abandoners",
    "Build brand awareness", "Promote a limited-time offer", "Grow the waitlist",
    "Increase repeat orders",
]

# Goals that only make sense for app/subscription products.
_APP_GOALS = {"Increase app installs", "Drive subscription signups", "Grow the waitlist"}
_APP_PRODUCTS = {
    "budgeting and investing app", "online IELTS coaching", "yoga and meditation app",
    "AI study-notes generator", "freelancer invoicing SaaS", "resume-building tool",
    "regional-language audiobooks", "kids' STEM toy subscription",
    "cold-pressed juices subscription",
}


def _brand_name(rng: random.Random) -> str:
    style = rng.random()
    if style < 0.7:
        return rng.choice(_BRAND_PREFIX) + rng.choice(_BRAND_SUFFIX)
    if style < 0.85:
        return f"{rng.choice(_BRAND_PREFIX)} {rng.choice(_BRAND_SUFFIX)}"
    return rng.choice(_BRAND_PREFIX) + rng.choice(_BRAND_SUFFIX).lower()


def _goal_for(product: str, rng: random.Random) -> str:
    if product in _APP_PRODUCTS:
        return rng.choice(_GOALS)
    # physical/one-off products shouldn't ask for app installs etc.
    return rng.choice([g for g in _GOALS if g not in _APP_GOALS])


def generate_inputs(count: int, seed: int = 18) -> list[dict]:
    """Return `count` unique, internally-coherent adcopy briefs."""
    rng = random.Random(seed)
    seen = set()
    out = []
    attempts = 0
    while len(out) < count and attempts < count * 50:
        attempts += 1
        p = rng.choice(_PRODUCTS)
        brief = {
            "brand_name": _brand_name(rng),
            "product": p["product"],
            "target_audience": rng.choice(p["audiences"]),
            "platform": rng.choice(_PLATFORMS),
            "ad_format": rng.choice(_FORMATS),
            "tone": rng.choice(_TONES),
            "goal": _goal_for(p["product"], rng),
            "usp": rng.choice(p["usps"]),
        }
        key = tuple(sorted(brief.items()))
        if key in seen:
            continue
        seen.add(key)
        out.append(brief)
    if len(out) < count:
        raise RuntimeError(
            f"Could only build {len(out)} unique briefs (wanted {count}); widen the pools."
        )
    return out


if __name__ == "__main__":
    import json
    for r in generate_inputs(5):
        print(json.dumps(r, ensure_ascii=False))

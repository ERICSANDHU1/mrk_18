"""Seed generator for the MRK18 Analytics-interpreter adapter (#6).

Each seed is a realistic, INTERNALLY-COHERENT metrics snapshot plus an
answer-key `hint` (the real story + the one lever + the pre-computed math).
The writer turns metrics -> a sharp MRK18-voice diagnosis; the hint guarantees
the diagnosis hits the intended teaching point and the arithmetic is correct.

Coherence rule: ROAS = AOV / CAC and contribution = AOV*margin - CAC are kept
consistent in every snapshot, so the model never learns from broken math.

12 problem archetypes (the thing being taught), x business x channel x
data-shape x founder-style x difficulty, plus a DATA-ABSENT (dual) mode that
teaches the model to ask for the metric it needs instead of hallucinating.

Run:
  python -m generate.analytics_seeds --count 1000 --out data/seeds/analytics_seeds.jsonl
"""

import argparse, json, os, random

# ---------------------------------------------------------------------------
_D2C = ["a D2C skincare brand", "a D2C coffee brand", "a D2C apparel label",
        "a D2C nutrition brand", "a D2C home-care brand", "a D2C footwear brand",
        "a D2C jewellery brand", "a D2C snacks brand", "a D2C pet-care brand",
        "a D2C eyewear brand", "a D2C haircare brand", "a D2C candle brand"]
_SAAS = ["a B2B SaaS for CA firms", "an HR-tech SaaS", "a no-code SaaS",
         "a vertical SaaS for clinics", "a fintech API SaaS", "a logistics SaaS"]
_MKT = ["a marketplace seller (Amazon)", "a Meesho seller", "a Flipkart seller"]
_EDU = ["an IELTS edtech", "a test-prep edtech", "a kids-coding edtech"]
_LOCAL = ["a cloud kitchen", "a salon chain", "a dental clinic", "a gym"]

_CHANNELS = ["Meta", "Google Search", "Google Performance Max", "Amazon Ads",
             "Meesho Ads", "YouTube", "WhatsApp broadcast", "email", "SEO / organic",
             "a blended Meta + Google mix"]

_SHAPES = ["single 30-day snapshot", "week-over-week trend (4 weeks)",
           "channel-by-channel comparison", "full funnel breakdown",
           "monthly cohort / retention table"]

_STYLES = ["data dump — pastes the numbers, asks 'what's wrong?'",
           "describes the numbers in prose, no neat table",
           "wrong self-diagnosis — blames the obvious metric",
           "panicked / venting before the question",
           "asks a narrow question ('why is my CTR low?')",
           "calm, sophisticated — wants the non-obvious read"]

_DIFFS = ["basic — founder is new, needs the fundamental reframed",
          "intermediate — knows the metrics, misreads them",
          "advanced — sophisticated, needs a sharp non-obvious insight"]


def _money(rng, lo, hi, step=10):
    return rng.randrange(lo, hi + 1, step)

def _fmt(n):
    if n >= 100000:
        return f"₹{n/100000:.1f}L".replace('.0L', 'L')
    if n >= 1000 and n % 1000 == 0:
        return f"₹{n // 1000}K"
    return f"₹{n:,}"

def _contrib(aov, margin, cac):
    return round(aov * margin / 100 - cac)

def _roas(aov, cac):
    return round(aov / cac, 1)

# ---------------------------------------------------------------------------
# Each archetype returns (metrics:dict, hint:str). Numbers are kept coherent.
# ---------------------------------------------------------------------------

def a_looks_bad_but_fine(rng, biz, ch):
    margin = rng.randint(60, 70); aov = _money(rng, 1200, 3500, 50)
    cac = rng.randint(int(aov * 0.52), int(aov * margin / 100) - 40)  # ROAS<2 but contribution>0
    contrib = _contrib(aov, margin, cac); roas = _roas(aov, cac)
    rep = rng.randint(26, 46); spend = _money(rng, 300000, 1800000, 50000)
    m = {"window": "last 30 days", "spend": _fmt(spend), "aov": aov, "gross_margin_pct": margin,
         "cac": cac, "roas": roas, "ctr_pct": round(rng.uniform(1.0, 2.2), 1), "repeat_90d_pct": rep}
    h = (f"REAL STORY: ROAS {roas} looks weak so the founder is panicking, but contribution = "
         f"₹{aov}×{margin}% − ₹{cac} = +₹{contrib}/order — genuinely profitable, and repeat is a solid {rep}%. "
         f"They're reading a vanity metric (ROAS) instead of contribution. LEVER: stop judging on ROAS, "
         f"this account should be SCALING, not cut.")
    return m, h

def a_looks_fine_but_broken(rng, biz, ch):
    margin = rng.randint(45, 62); aov = _money(rng, 900, 3000, 50)
    cac = rng.randint(int(aov * 0.20), int(aov / 3.0))  # ROAS>=3, first-order positive
    contrib = _contrib(aov, margin, cac); roas = _roas(aov, cac)
    rep = rng.randint(5, 11)  # the break
    m = {"window": "last 30 days", "aov": aov, "gross_margin_pct": margin, "cac": cac,
         "roas": roas, "repeat_90d_pct": rep, "ctr_pct": round(rng.uniform(1.2, 2.6), 1)}
    h = (f"REAL STORY: ROAS {roas} looks great and first-order contribution is +₹{contrib}, BUT 90-day repeat "
         f"is only {rep}% — acquisition works, retention is the leak; with almost no second order the LTV "
         f"collapses. LEVER: fix repeat BEFORE scaling spend; you're filling a bucket with no bottom.")
    return m, h

def a_creative_fatigue(rng, biz, ch):
    margin = rng.randint(40, 62); aov = _money(rng, 800, 2500, 50)
    cac_prev = rng.randint(300, 700); cac_now = round(cac_prev * rng.uniform(1.8, 2.2))
    roas_prev = _roas(aov, cac_prev); roas_now = _roas(aov, cac_now)
    freq = round(rng.uniform(2.7, 3.8), 1); contrib = _contrib(aov, margin, cac_now)
    m = {"window": "last 6 weeks", "channel": ch, "aov": aov, "gross_margin_pct": margin,
         "cac": {"6w_ago": cac_prev, "now": cac_now}, "roas": {"6w_ago": roas_prev, "now": roas_now},
         "frequency": freq, "ctr_trend": "sliding", "creatives": "unchanged", "audience": "same"}
    h = (f"REAL STORY: CAC ₹{cac_prev}→₹{cac_now} over 6 weeks, frequency {freq} (above ~2.5), CTR sliding, "
         f"SAME creatives + audience = textbook creative fatigue, NOT an algorithm or targeting problem. "
         f"Contribution now ₹{contrib}. LEVER: refresh creative with new angles + build a testing cadence so "
         f"you never ride one winner to exhaustion.")
    return m, h

def a_funnel_leak(rng, biz, ch):
    visits = _money(rng, 20000, 60000, 1000)
    atc = round(visits * rng.uniform(0.06, 0.10))
    checkout = round(atc * rng.uniform(0.55, 0.75))
    purchase = round(checkout * rng.uniform(0.18, 0.32))  # the collapse: checkout->purchase
    co_pur = round(100 * purchase / checkout)
    m = {"window": "last 30 days", "funnel": {"visits": visits, "add_to_cart": atc,
         "reached_checkout": checkout, "purchase": purchase},
         "ctr_pct": round(rng.uniform(1.3, 2.4), 1)}
    h = (f"REAL STORY: traffic and add-to-cart are healthy (ATC {round(100*atc/visits)}%), but "
         f"checkout→purchase is only {co_pur}% (should be ~50-70%). The leak is at the LAST step — "
         f"payment/checkout friction — not acquisition. LEVER: instrument and fix checkout (surprise shipping, "
         f"forced login, missing UPI/COD); ad money is fine.")
    return m, h

def a_intent_mismatch(rng, biz, ch):
    impr = _money(rng, 300000, 1500000, 10000); clicks = round(impr * rng.uniform(0.008, 0.02))
    ctr = round(100 * clicks / impr, 1); orders = round(clicks * rng.uniform(0.004, 0.012))
    cvr = round(100 * orders / clicks, 2); aov = _money(rng, 700, 2500, 50)
    m = {"window": "last 30 days", "channel": ch, "impressions": impr, "clicks": clicks,
         "ctr_pct": ctr, "orders": orders, "conversion_rate_pct": cvr, "aov": aov,
         "targeting": "broad / interest-based" if "Meta" in ch else "broad-match keywords"}
    h = (f"REAL STORY: impressions and clicks are high but conversion is just {cvr}% — you're buying broad, "
         f"low-intent traffic ({m['targeting']}), people browsing, not buying. CTR isn't the problem; intent is. "
         f"LEVER: tighten to high-intent audiences/keywords, add negatives, and stop optimising for clicks.")
    return m, h

def a_attribution(rng, biz, ch):
    meta = round(rng.uniform(3.4, 4.6), 1); shopify = round(rng.uniform(1.3, 2.0), 1)
    spend = _money(rng, 400000, 2000000, 50000)
    m = {"window": "last 30 days (post-iOS)", "platform_reported_roas": meta,
         "shopify_last_click_roas": shopify, "spend": _fmt(spend),
         "note": "the two dashboards don't match and the founder can't tell which is real"}
    h = (f"REAL STORY: Meta claims {meta} ROAS (modelled conversions, 7-day-click) while Shopify last-click "
         f"shows {shopify} — both are biased and the truth sits between. The founder is refereeing two dashboards "
         f"that will never agree. LEVER: stop trusting platform ROAS as absolute; anchor on BLENDED CAC "
         f"(total spend ÷ actual new customers from Shopify) and manage to that.")
    return m, h

def a_scaling_wall(rng, biz, ch):
    aov = _money(rng, 900, 2800, 50); margin = rng.randint(45, 65)
    spend_prev = _money(rng, 300000, 700000, 50000); spend_now = round(spend_prev * rng.uniform(1.8, 2.3))
    cac_prev = rng.randint(350, 650); cac_now = round(cac_prev * rng.uniform(1.4, 1.8))
    roas_prev = _roas(aov, cac_prev); roas_now = _roas(aov, cac_now)
    m = {"window": "last 8 weeks", "channel": ch, "aov": aov, "gross_margin_pct": margin,
         "spend": {"start": _fmt(spend_prev), "now": _fmt(spend_now)},
         "cac": {"start": cac_prev, "now": cac_now}, "roas": {"start": roas_prev, "now": roas_now}}
    h = (f"REAL STORY: spend {_fmt(spend_prev)}→{_fmt(spend_now)}, ROAS {roas_prev}→{roas_now}, CAC rising — "
         f"you've saturated your best audiences/intent and extra budget is buying colder, pricier reach. The "
         f"channel has an efficient ceiling and you hit it. LEVER: create new demand (new audiences/creatives/"
         f"channels) before adding budget — don't just push more spend into the same finite pool.")
    return m, h

def a_noise(rng, biz, ch):
    conv = rng.randint(40, 120); delta = rng.randint(8, 22)
    metric = rng.choice(["ROAS", "CAC", "conversion rate", "CTR"])
    m = {"window": "this week vs last week", "conversions_this_week": conv,
         "metric_moved": metric, "change_pct": f"-{delta}%" if metric in ("ROAS", "conversion rate", "CTR") else f"+{delta}%",
         "founder_reaction": "about to overhaul the whole strategy"}
    h = (f"REAL STORY: {metric} moved {delta}% week-over-week on just {conv} conversions — that's inside normal "
         f"variance, not a trend. Reacting to one noisy week is how founders whipsaw their accounts. LEVER: do "
         f"NOTHING yet; wait for a 3-4 week signal before changing anything, and tell them what would actually "
         f"count as a real shift.")
    return m, h

def a_insufficient(rng, biz, ch):
    days = rng.randint(3, 7); conv = rng.randint(8, 26); spend = _money(rng, 15000, 60000, 1000)
    m = {"window": f"last {days} days", "spend": _fmt(spend), "conversions": conv,
         "founder_question": "is my CAC good? should I scale or kill it?"}
    h = (f"REAL STORY: {conv} conversions over {days} days is far too small to conclude anything — any CAC or "
         f"ROAS off this is statistical noise. The honest answer is 'we can't know yet'. LEVER: refuse to "
         f"diagnose; tell them to let it run to ~100 conversions or a 2-3 week window first, and name that exact "
         f"threshold so they stop guessing.")
    return m, h

def a_concentration(rng, biz, ch):
    pct = rng.randint(88, 97); rev = _money(rng, 800000, 4000000, 100000)
    m = {"window": "last 90 days", "monthly_revenue": _fmt(rev),
         "channel_mix": {ch: f"{pct}%", "everything else": f"{100-pct}%"},
         "unit_economics": "healthy on that channel"}
    h = (f"REAL STORY: {pct}% of revenue rides on {ch}. The unit economics may be fine, but this is "
         f"CONCENTRATION RISK — one algorithm change, ad-account ban, or CPM spike and revenue halves overnight. "
         f"This is a risk read, not a fix-the-numbers one. LEVER: start a genuine second channel NOW, while "
         f"you're choosing to, not when you're forced to.")
    return m, h

def a_margin_masked(rng, biz, ch):
    margin = rng.randint(24, 32); aov = _money(rng, 700, 1800, 50)
    cac = rng.randint(int(aov * 0.35), int(aov * 0.6))
    contrib = _contrib(aov, margin, cac); roas = _roas(aov, cac)
    m = {"window": "last 30 days", "aov": aov, "gross_margin_pct": margin, "cac": cac, "roas": roas,
         "ctr_pct": round(rng.uniform(1.4, 2.5), 1), "founder_question": "how do I lower my CAC?"}
    h = (f"REAL STORY: they think it's a CAC/ads problem, but a {margin}% gross margin is the disease. "
         f"Contribution = ₹{aov}×{margin}% − ₹{cac} = ₹{contrib}/order — no targeting tweak fixes a margin this "
         f"thin. LEVER: this is a MARGIN problem wearing a marketing costume — fix COGS/pricing/AOV first; "
         f"the ads aren't what's broken.")
    return m, h

_ARCHETYPES = [
    ("looks-bad-but-fine", a_looks_bad_but_fine), ("looks-fine-but-broken", a_looks_fine_but_broken),
    ("creative-fatigue", a_creative_fatigue), ("funnel-leak", a_funnel_leak),
    ("intent-mismatch", a_intent_mismatch), ("attribution-confusion", a_attribution),
    ("scaling-wall", a_scaling_wall), ("noise-seasonality", a_noise),
    ("insufficient-data", a_insufficient), ("channel-over-reliance", a_concentration),
    ("margin-masked-as-marketing", a_margin_masked),
]
# retention-hole is folded into looks-fine-but-broken (cohort variant via data_shape)

_BIZPOOL = {"d2c": _D2C, "saas": _SAAS, "marketplace": _MKT, "edtech": _EDU, "local": _LOCAL}


def generate_seeds(count, start_id=1, seed=18, data_absent_ratio=0.12):
    rng = random.Random(seed)
    out, seen = [], set()
    n_absent = int(count * data_absent_ratio)
    attempts = 0
    while len(out) < count and attempts < count * 60:
        attempts += 1
        label, fn = _ARCHETYPES[len(out) % len(_ARCHETYPES)] if rng.random() < 0.6 else rng.choice(_ARCHETYPES)
        biz = rng.choice(_D2C if rng.random() < 0.62 else _SAAS + _MKT + _EDU + _LOCAL)
        ch = rng.choice(_CHANNELS)
        metrics, hint = fn(rng, biz, ch)
        absent = len(out) < n_absent and rng.random() < 0.5
        if absent:
            metrics = {"note": "founder gives NO real numbers — only a vague worry"}
            hint = ("DATA-ABSENT (dual mode): the founder suspects a problem but shares no metrics. MRK18 must "
                    "NOT invent a diagnosis. LEVER: ask, in-voice, for the 2-3 specific numbers needed to judge it "
                    f"(for this '{label}' worry: e.g. AOV, gross margin, 90-day repeat, or the funnel stages) and "
                    "say exactly what each would tell you — then stop.")
        s = {"id": f"an{start_id + len(out):04d}",
             "seed": {"archetype": label, "business": biz, "channel": ch,
                      "data_shape": rng.choice(_SHAPES), "founder_style": rng.choice(_STYLES),
                      "difficulty": rng.choice(_DIFFS), "mode": "data-absent" if absent else "data-rich"},
             "metrics": metrics, "hint": hint}
        key = json.dumps(s["seed"], sort_keys=True) + json.dumps(metrics, sort_keys=True)
        if key in seen:
            continue
        seen.add(key); out.append(s)
    if len(out) < count:
        raise RuntimeError(f"only built {len(out)}/{count}; widen pools")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=1000)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--seed", type=int, default=18)
    ap.add_argument("--out", default=os.path.join("data", "seeds", "analytics_seeds.jsonl"))
    a = ap.parse_args(argv)
    seeds = generate_seeds(a.count, start_id=a.start, seed=a.seed)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        for s in seeds:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"wrote {len(seeds)} seeds -> {a.out}  (ids {seeds[0]['id']}..{seeds[-1]['id']})")


if __name__ == "__main__":
    main()

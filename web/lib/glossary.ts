/** Marketing-jargon glossary the CMO can explain out loud. Definitions are
 *  founder-friendly (plain language, one or two sentences) — the kind of thing a
 *  20-year CMO would say to a first-time founder, not a textbook. */

export type GlossaryEntry = {
  /** Canonical term as shown to the user. */
  term: string;
  /** Other spellings/phrasings that should match the same definition. */
  aliases?: string[];
  /** Plain-language explanation the CMO speaks. */
  definition: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  { term: "ROAS", aliases: ["return on ad spend"], definition: "ROAS means Return On Ad Spend — for every ₹1 you put into ads, how many rupees come back. A ROAS of 3 means ₹3 back for every ₹1 spent." },
  { term: "CTR", aliases: ["click-through rate", "click through rate"], definition: "CTR means Click-Through Rate — out of everyone who saw your ad, the share who actually clicked it. A higher CTR means your hook is landing." },
  { term: "CAC", aliases: ["customer acquisition cost"], definition: "CAC means Customer Acquisition Cost — the total marketing money it takes to win one new paying customer." },
  { term: "CPC", aliases: ["cost per click"], definition: "CPC means Cost Per Click — what you pay each time someone clicks your ad." },
  { term: "CPM", aliases: ["cost per mille", "cost per thousand"], definition: "CPM means Cost Per Mille — what you pay for every 1,000 times your ad is shown on screen." },
  { term: "CPL", aliases: ["cost per lead"], definition: "CPL means Cost Per Lead — what you pay to get one interested lead, like a sign-up or enquiry, before they actually buy." },
  { term: "LTV", aliases: ["lifetime value", "clv"], definition: "LTV means Lifetime Value — the total profit one customer brings you over the whole time they stay with you." },
  { term: "AOV", aliases: ["average order value"], definition: "AOV means Average Order Value — the average amount a customer spends in a single purchase." },
  { term: "CVR", aliases: ["conversion rate"], definition: "CVR means Conversion Rate — out of all your visitors, the share who take the action you want, like buying or signing up." },
  { term: "impressions", definition: "Impressions are the number of times your ad was shown on a screen — not unique people, just total views." },
  { term: "reach", definition: "Reach is the number of unique people who saw your ad at least once." },
  { term: "frequency", definition: "Frequency is how many times, on average, each person saw your ad. Push it too high and people start tuning you out." },
  { term: "retargeting", aliases: ["remarketing"], definition: "Retargeting means showing ads again to people who already visited you but didn't buy yet — nudging warm prospects back." },
  { term: "attribution", definition: "Attribution is how you decide which ad or channel gets the credit for a sale, when a customer saw several before buying." },
  { term: "funnel", definition: "A funnel is the journey from first noticing you to buying — awareness, then interest, then purchase. People drop off at each step." },
  { term: "bounce rate", aliases: ["bounce"], definition: "Bounce rate is the share of visitors who land on your page and leave straight away without doing anything." },
  { term: "break-even", aliases: ["break even", "breakeven"], definition: "Break-even is the point where what a campaign earns equals what it cost. Below break-even, you're spending more than you make back." },
  { term: "conversion", aliases: ["conversions"], definition: "A conversion is when a visitor does the thing you wanted — a purchase, a sign-up, or a lead." },
  { term: "organic", definition: "Organic means the traffic and reach you get for free — like SEO, content, or word of mouth — not paid ads." },
  { term: "broad match", aliases: ["broad-match"], definition: "Broad match is a loose keyword setting that shows your ad for lots of related searches. It widens reach but can quietly waste spend." },
  { term: "engagement", definition: "Engagement is likes, comments, shares and saves — the signals that people are actually interacting with your content." },
  { term: "churn", definition: "Churn is the rate at which customers stop buying from you or cancel." },
  { term: "ICP", aliases: ["ideal customer profile"], definition: "ICP means Ideal Customer Profile — a sharp description of the exact customer you serve best and should target." },
  { term: "USP", aliases: ["unique selling proposition"], definition: "USP means Unique Selling Proposition — the one thing that makes you different and worth choosing over rivals." },
  { term: "spend", definition: "Spend is simply the total money you've put into your ads over a period." },
  { term: "free tier", definition: "A free tier is the version of your product people use at no cost — the top of your funnel that should lead them toward paying, not replace paying." },
  { term: "free-to-paid", aliases: ["free to paid"], definition: "Free-to-paid is the share of free users who upgrade to a paid plan — the number that decides whether a free tier actually makes money." },
  { term: "paywall", definition: "A paywall is the point where a feature is locked until the user pays. Where you place it largely decides who upgrades." },
  { term: "activation", definition: "Activation is the moment a new user first hits real value — the 'aha' that predicts whether they'll stick around and pay." },
  { term: "monetise", aliases: ["monetize", "monetises", "monetizes"], definition: "Monetise means turning usage or attention into revenue." },
  { term: "MRR", aliases: ["monthly recurring revenue"], definition: "MRR means Monthly Recurring Revenue — the predictable subscription revenue you collect each month." },
];

const _flat = GLOSSARY.flatMap((e) => [e.term, ...(e.aliases ?? [])].map((p) => ({ p, e })))
  // longest patterns first so "cost per click" beats "click", "break-even" beats "break"
  .sort((a, b) => b.p.length - a.p.length);

function _esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \b word boundaries so "spend" doesn't match inside "spending" — and, unlike
// lookbehind, \b is supported everywhere (no crash on older Safari).
const _RE = new RegExp(`\\b(${_flat.map((x) => _esc(x.p)).join("|")})\\b`, "gi");

export type TermMatch = { start: number; end: number; entry: GlossaryEntry };

/** Find non-overlapping glossary terms in `text`, left-to-right, longest-first. */
export function findTerms(text: string): TermMatch[] {
  const out: TermMatch[] = [];
  _RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = _RE.exec(text)) !== null) {
    const matched = m[1];
    const lower = matched.toLowerCase();
    const entry = _flat.find((x) => x.p.toLowerCase() === lower)?.e;
    if (entry) out.push({ start: m.index, end: m.index + matched.length, entry });
  }
  return out;
}
